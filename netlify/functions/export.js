import { getStore } from '@netlify/blobs';
import { requireAuth, json } from './_auth.js';
import { seedFor } from './_seeds.js';

const DATASET = {
  logbook: ['entries'],
  expenses: ['entries'],
  training: ['maneuvers', 'ground_school', 'practice_tests', 'written_exam'],
  scheduling: ['next_lesson'],
  config: ['personal_minimums', 'selected_aircraft_tail'],
};

async function getOrSeed(storeName, key) {
  const store = getStore({ name: storeName });
  let value = await store.get(key, { type: 'json' });
  if (value === null) {
    const seed = seedFor(storeName, key);
    if (seed !== undefined) {
      value = seed;
      await store.setJSON(key, value);
    }
  }
  return value;
}

export default async (req) => {
  const auth = requireAuth(req.headers);
  if (!auth.ok) return json({ error: auth.message }, { status: auth.status });

  const data = {};
  for (const [store, keys] of Object.entries(DATASET)) {
    data[store] = {};
    for (const key of keys) {
      data[store][key] = await getOrSeed(store, key);
    }
  }

  return json({
    exported_utc: new Date().toISOString(),
    version: '1.0',
    data,
  });
};
