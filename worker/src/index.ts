interface Env {
  GITHUB_CLIENT_ID: string;
  GITHUB_CLIENT_SECRET: string;
  ALLOWED_ORIGINS: string;
}

export default {
  async fetch(req: Request, env: Env): Promise<Response> {
    const origin = req.headers.get('Origin') ?? '';
    const allowed = env.ALLOWED_ORIGINS.split(',').map((s) => s.trim());
    const corsOrigin = allowed.includes(origin) ? origin : allowed[0];

    const cors = {
      'Access-Control-Allow-Origin': corsOrigin,
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
      'Access-Control-Max-Age': '86400',
      Vary: 'Origin',
    };

    if (req.method === 'OPTIONS') return new Response(null, { headers: cors });

    const url = new URL(req.url);

    if (req.method === 'GET' && url.pathname === '/health') {
      return json(
        {
          ok: true,
          secrets: Boolean(env.GITHUB_CLIENT_ID && env.GITHUB_CLIENT_SECRET),
          allowedOrigins: allowed,
        },
        200,
        cors,
      );
    }

    if (req.method !== 'POST' || url.pathname !== '/exchange') {
      return new Response('Not found', { status: 404, headers: cors });
    }

    let body: { code?: string };
    try {
      body = await req.json();
    } catch {
      return json({ error: 'invalid_json' }, 400, cors);
    }
    if (!body.code) return json({ error: 'missing_code' }, 400, cors);

    if (!env.GITHUB_CLIENT_ID || !env.GITHUB_CLIENT_SECRET) {
      return json(
        { error: 'worker_missing_secrets', hint: 'run: wrangler secret put GITHUB_CLIENT_ID / GITHUB_CLIENT_SECRET' },
        500,
        cors,
      );
    }

    const res = await fetch('https://github.com/login/oauth/access_token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify({
        client_id: env.GITHUB_CLIENT_ID,
        client_secret: env.GITHUB_CLIENT_SECRET,
        code: body.code,
      }),
    });

    const raw = await res.text();
    let data: { access_token?: string; error?: string; error_description?: string } = {};
    try {
      data = JSON.parse(raw);
    } catch {
      return json({ error: 'github_non_json', status: res.status, body: raw.slice(0, 500) }, 502, cors);
    }
    if (!data.access_token) {
      return json(
        { error: data.error ?? 'exchange_failed', error_description: data.error_description, status: res.status },
        400,
        cors,
      );
    }
    return json({ access_token: data.access_token }, 200, cors);
  },
};

function json(body: unknown, status: number, cors: Record<string, string>): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', ...cors },
  });
}
