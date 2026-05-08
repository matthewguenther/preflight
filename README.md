# Preflight

Preflight is a personal Private Pilot License training dashboard for KVBT / Thaden Field. It combines live aviation weather, go/no-go personal minimum checks, lesson scheduling, logbook progress, ground school status, checkride readiness, aircraft reference data, and expense tracking in a single React + Netlify app.

## Local Setup

1. Clone the repo and run `npm install`.
2. Copy `.env.example` to `.env.local`.
3. Generate a shared auth token with `openssl rand -hex 32`.
4. Set both `VITE_API_AUTH_TOKEN` and `API_AUTH_TOKEN` to that token.
5. Register at `api.faa.gov` for NOTAM credentials and set `FAA_NOTAM_CLIENT_ID` and `FAA_NOTAM_CLIENT_SECRET`.
6. Run `npm run dev` and open `http://localhost:8888`.

## Deploy To Netlify

Connect the GitHub repo to a Netlify site. In the Netlify UI, set the same environment variables from `.env.local` without committing that file. Pushes to `main` will build with `npm run build` and publish `dist`.

## Backup Strategy

Use the in-app Download backup button. It calls `/.netlify/functions/export` and saves `preflight-backup-YYYY-MM-DD.json`. A monthly local backup is recommended.

## Known Limitations

- Density altitude uses a rule-of-thumb formula.
- Va is shown from the configured table and defaults to the max-gross row.
- The v1 UI is primarily designed around one aircraft, though `FLEET` supports more.
- Ground school topics are manually tracked; there is no Sporty's API integration.
- Flight Schedule Pro is intentionally left disabled until API access and endpoint details are confirmed.
