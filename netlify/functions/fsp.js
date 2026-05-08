import { requireAuth, json } from './_auth.js';

export default async (req) => {
  const auth = requireAuth(req.headers);
  if (!auth.ok) return json({ error: auth.message }, { status: auth.status });

  if (!process.env.FSP_API_KEY || !process.env.FSP_CLUB_ID) {
    return json({
      fetched_utc: new Date().toISOString(),
      configured: false,
      next_lesson: null,
      upcoming: [],
      warning: 'Flight Schedule Pro API is not configured',
    });
  }

  return json({
    fetched_utc: new Date().toISOString(),
    configured: false,
    next_lesson: null,
    upcoming: [],
    warning: 'Flight Schedule Pro integration needs confirmed API details before implementation',
  });
};
