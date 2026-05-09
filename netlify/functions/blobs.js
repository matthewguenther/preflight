import { getStore } from '@netlify/blobs';
import { requireAuth, json } from './_auth.js';
import { seedFor } from './_seeds.js';

function getParams(req) {
  const url = new URL(req.url);
  return { store: url.searchParams.get('store'), key: url.searchParams.get('key') };
}

export default async (req) => {
  const auth = requireAuth(req.headers);
  if (!auth.ok) return json({ error: auth.message }, { status: auth.status });

  if (req.method === 'GET') {
    const { store, key } = getParams(req);
    if (!store || !key) return json({ error: 'store and key are required' }, { status: 400 });
    const blobStore = getStore({ name: store });
    let value = await blobStore.get(key, { type: 'json' });
    // First read of a known app dataset seeds defaults so panels can render
    // useful starter state without a separate setup step.
    if (value === null) {
      const seed = seedFor(store, key);
      if (seed !== undefined) {
        value = seed;
        await blobStore.setJSON(key, value);
      }
    }
    return json({ store, key, value });
  }

  if (req.method === 'POST') {
    // Writes replace the whole value at {store, key}. Components own merging
    // arrays/objects before calling save().
    const body = await req.json();
    if (!body.store || !body.key) return json({ error: 'store and key are required' }, { status: 400 });
    await getStore({ name: body.store }).setJSON(body.key, body.value);
    return json({ store: body.store, key: body.key, value: body.value });
  }

  if (req.method === 'DELETE') {
    const { store, key } = getParams(req);
    if (!store || !key) return json({ error: 'store and key are required' }, { status: 400 });
    await getStore({ name: store }).delete(key);
    return json({ ok: true });
  }

  return json({ error: 'Method not allowed' }, { status: 405 });
};
