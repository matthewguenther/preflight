export function requireAuth(headers) {
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
  return new Response(JSON.stringify(body), {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      ...(init.headers || {}),
    },
  });
}
