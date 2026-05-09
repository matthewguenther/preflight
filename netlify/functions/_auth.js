export function requireAuth(headers) {
  // Minimal shared guard for every Netlify function. The browser sends
  // VITE_API_AUTH_TOKEN; the function compares it to server-only API_AUTH_TOKEN.
  const expected = process.env.API_AUTH_TOKEN;
  if (!expected) {
    return { ok: false, status: 500, message: 'Missing API_AUTH_TOKEN environment variable' };
  }
  const header = headers.get?.('authorization') || headers.authorization || headers.Authorization;
  const provided = header?.replace(/^Bearer\s+/i, '');
  if (provided !== expected) {
    return { ok: false, status: 401, message: 'Unauthorized' };
  }
  return { ok: true };
}

export function json(body, init = {}) {
  // Keep function responses consistent and JSON-typed, while still allowing
  // callers to pass status codes or cache-control headers.
  return new Response(JSON.stringify(body), {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      ...(init.headers || {}),
    },
  });
}
