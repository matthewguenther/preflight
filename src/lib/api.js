const TOKEN = import.meta.env.VITE_API_AUTH_TOKEN;

export async function apiFetch(path, options = {}) {
  // All browser-to-function calls go through here so the bearer token and JSON
  // headers stay consistent. Netlify functions reject requests without the
  // matching API_AUTH_TOKEN.
  const res = await fetch(path, {
    ...options,
    headers: {
      ...options.headers,
      Authorization: `Bearer ${TOKEN}`,
      'Content-Type': 'application/json',
    },
  });
  if (!res.ok) {
    // Preserve the function's response body; it usually contains the specific
    // external feed or validation failure that caused the request to fail.
    const body = await res.text();
    throw new Error(`${res.status}: ${body}`);
  }
  return res.json();
}
