const TOKEN_KEY = 'taskdag:gh_token';
const STATE_KEY = 'taskdag:oauth_state';

const CLIENT_ID = import.meta.env.VITE_GITHUB_CLIENT_ID as string;
const WORKER_URL = import.meta.env.VITE_AUTH_WORKER_URL as string;

export function getToken(): string | null {
  return localStorage.getItem(TOKEN_KEY);
}

export function clearToken(): void {
  localStorage.removeItem(TOKEN_KEY);
}

export function startLogin(): void {
  const state = crypto.randomUUID();
  localStorage.setItem(STATE_KEY, state);
  const url = new URL('https://github.com/login/oauth/authorize');
  url.searchParams.set('client_id', CLIENT_ID);
  url.searchParams.set('scope', 'gist');
  url.searchParams.set('state', state);
  window.location.assign(url.toString());
}

export async function handleCallback(): Promise<boolean> {
  const params = new URLSearchParams(window.location.search);
  const code = params.get('code');
  const returnedState = params.get('state');
  if (!code) return false;

  const expected = localStorage.getItem(STATE_KEY);
  localStorage.removeItem(STATE_KEY);
  if (!expected || expected !== returnedState) {
    cleanUrl();
    throw new Error('oauth_state_mismatch');
  }

  const res = await fetch(`${WORKER_URL}/exchange`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ code }),
  });
  const raw = await res.text();
  console.log('[auth] exchange response', res.status, raw);
  cleanUrl();
  let data: { access_token?: string; error?: string } = {};
  try {
    data = JSON.parse(raw);
  } catch {
    throw new Error(`exchange_bad_json:${res.status} ${raw.slice(0, 200)}`);
  }
  if (!data.access_token) throw new Error(data.error ?? `exchange_failed:${res.status}`);
  localStorage.setItem(TOKEN_KEY, data.access_token);
  return true;
}

function cleanUrl(): void {
  const url = new URL(window.location.href);
  url.searchParams.delete('code');
  url.searchParams.delete('state');
  window.history.replaceState({}, '', url.toString());
}
