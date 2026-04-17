const FILENAME = 'taskdag.md';
const DESCRIPTION = 'TaskDAG state';
const GIST_ID_KEY = 'taskdag:gist_id';

interface GistFile {
  filename?: string;
  content?: string;
  truncated?: boolean;
  raw_url?: string;
}

interface Gist {
  id: string;
  description?: string;
  files: Record<string, GistFile>;
}

function ghHeaders(token: string): HeadersInit {
  return {
    Authorization: `Bearer ${token}`,
    Accept: 'application/vnd.github+json',
    'X-GitHub-Api-Version': '2022-11-28',
  };
}

async function failWith(label: string, res: Response): Promise<never> {
  const body = await res.text().catch(() => '');
  console.error(`[gist] ${label} ${res.status} ${res.statusText}`, body);
  throw new Error(`${label}:${res.status} ${body.slice(0, 200)}`);
}

async function listGists(token: string): Promise<Gist[]> {
  const out: Gist[] = [];
  for (let page = 1; page <= 10; page++) {
    const res = await fetch(`https://api.github.com/gists?per_page=100&page=${page}`, {
      headers: ghHeaders(token),
    });
    if (!res.ok) await failWith('list_gists_failed', res);
    const batch = (await res.json()) as Gist[];
    out.push(...batch);
    if (batch.length < 100) break;
  }
  return out;
}

export async function findOrCreateGist(token: string): Promise<string> {
  const cached = localStorage.getItem(GIST_ID_KEY);
  if (cached) {
    const ok = await fetch(`https://api.github.com/gists/${cached}`, {
      headers: ghHeaders(token),
    });
    if (ok.ok) return cached;
  }

  const gists = await listGists(token);
  const match = gists.find((g) => g.description === DESCRIPTION && FILENAME in g.files);
  if (match) {
    localStorage.setItem(GIST_ID_KEY, match.id);
    return match.id;
  }

  const res = await fetch('https://api.github.com/gists', {
    method: 'POST',
    headers: { ...ghHeaders(token), 'Content-Type': 'application/json' },
    body: JSON.stringify({
      description: DESCRIPTION,
      public: false,
      files: { [FILENAME]: { content: '# TaskDAG\n' } },
    }),
  });
  if (!res.ok) await failWith('create_gist_failed', res);
  const data = (await res.json()) as Gist;
  localStorage.setItem(GIST_ID_KEY, data.id);
  return data.id;
}

export async function pullGist(token: string, gistId: string): Promise<string> {
  const res = await fetch(`https://api.github.com/gists/${gistId}`, {
    headers: ghHeaders(token),
  });
  if (!res.ok) await failWith('pull_gist_failed', res);
  const data = (await res.json()) as Gist;
  const file = data.files[FILENAME];
  if (!file) return '';
  if (file.truncated && file.raw_url) {
    const raw = await fetch(file.raw_url);
    return await raw.text();
  }
  return file.content ?? '';
}

export async function pushGist(token: string, gistId: string, content: string): Promise<void> {
  const res = await fetch(`https://api.github.com/gists/${gistId}`, {
    method: 'PATCH',
    headers: { ...ghHeaders(token), 'Content-Type': 'application/json' },
    body: JSON.stringify({ files: { [FILENAME]: { content } } }),
  });
  if (!res.ok) await failWith('push_gist_failed', res);
}

export function clearGistId(): void {
  localStorage.removeItem(GIST_ID_KEY);
}
