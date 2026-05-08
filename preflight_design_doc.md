# Preflight — PPL Student Dashboard
## Developer Handoff Design Document

**Version:** 1.1 (final)
**Author:** Matt Guenther
**Target user:** Single user (Matt) — no auth UX, but endpoint protection required
**Target airport:** KVBT — Thaden Field, Bentonville AR (field elevation 1,304 ft MSL)
**Purpose:** Personal dashboard for Private Pilot License training. Aggregates live weather, scheduling, logbook progress, ground school status, and expenses.
**Build environment:** Claude Code in VS Code

---

## Section 0 — Read Me First

**Things this doc deliberately does not decide.** When the developer agent encounters one, surface the decision rather than guessing:

1. Whether Flight Schedule Pro API access exists (depends on Legends Air Center confirming API access).
2. Final URL paths for FAA NOTAM API endpoints — these are confirmed at API key registration. Verify at build time.
3. Fuel price data source — manual entry for v1; scraping deferred.

**Verify before implementing any external API call.** API surfaces drift. Before writing the first fetch in a Netlify Function, hit the documented endpoint manually (curl or browser) and confirm the response shape matches what's in this doc. If it doesn't, update the doc rather than work around it silently.

**Round trip pattern for unknowns:** if something in this doc conflicts with reality (an API returns a different shape, a library has a breaking change, a constraint doesn't hold), stop and ask. Do not improvise schemas.

---

## 1. Tech Stack

| Layer | Tool | Pin |
|---|---|---|
| Frontend framework | React | `^18.3.0` |
| Build tool | Vite | `^5.4.0` |
| Language | JavaScript (no TypeScript) | — |
| Styling | Tailwind CSS | `^3.4.0` (v3, NOT v4) |
| Data fetching / caching | TanStack Query | `^5.51.0` |
| Charts | Recharts | `^2.12.0` |
| Icons | Lucide React | `^0.439.0` |
| Date utilities | date-fns | `^3.6.0` |
| Date timezone handling | date-fns-tz | `^3.1.0` |
| UUID generation | uuid | `^10.0.0` |
| Hosting | Netlify (static deploy) | — |
| Serverless functions | Netlify Functions (Node 20) | — |
| Persistent storage | Netlify Blobs (`@netlify/blobs`) | `^8.1.0` |
| CI/CD | GitHub → Netlify auto-deploy | main = production |

---

## 2. Repository Structure

```
preflight/
├── netlify/
│   └── functions/
│       ├── _auth.js               # Shared auth helper for all functions
│       ├── weather.js             # METAR, TAF, winds aloft proxy
│       ├── notams.js              # FAA NOTAM API proxy
│       ├── tfr.js                 # FAA TFR feed proxy
│       ├── fsp.js                 # Flight Schedule Pro proxy (conditional)
│       ├── blobs.js               # Unified Netlify Blobs CRUD handler
│       └── export.js              # Export all blob data as JSON
├── public/
│   └── favicon.ico
├── src/
│   ├── components/
│   │   ├── layout/
│   │   │   ├── Header.jsx
│   │   │   └── PanelCard.jsx
│   │   ├── panels/
│   │   │   ├── GoNoGo.jsx
│   │   │   ├── Weather.jsx
│   │   │   ├── NextLesson.jsx
│   │   │   ├── CheckrideReadiness.jsx
│   │   │   ├── GroundSchool.jsx
│   │   │   ├── Logbook.jsx
│   │   │   ├── AircraftRef.jsx
│   │   │   └── ExpenseTracker.jsx
│   │   ├── forms/
│   │   │   ├── LogbookEntryForm.jsx
│   │   │   ├── ExpenseEntryForm.jsx
│   │   │   ├── PersonalMinsForm.jsx
│   │   │   └── Modal.jsx          # Base modal component
│   │   └── ui/
│   │       ├── Badge.jsx
│   │       ├── ProgressBar.jsx
│   │       ├── MetricCard.jsx
│   │       ├── StatusDot.jsx
│   │       ├── ErrorState.jsx
│   │       ├── LoadingState.jsx
│   │       └── StaleIndicator.jsx
│   ├── hooks/
│   │   ├── useWeather.js
│   │   ├── useNotams.js
│   │   ├── useTfr.js
│   │   ├── useLesson.js
│   │   └── useBlobs.js
│   ├── lib/
│   │   ├── api.js                 # Auth-aware fetch wrapper
│   │   ├── goNoGo.js              # Personal minimums evaluation
│   │   ├── densityAlt.js          # Density altitude calculator
│   │   ├── crosswind.js           # Crosswind component calculator
│   │   ├── checkride.js           # Readiness score composite
│   │   ├── validation.js          # Form input validation
│   │   ├── time.js                # UTC↔local conversion helpers
│   │   └── constants.js           # Airport, aircraft, V-speeds, defaults
│   ├── App.jsx
│   ├── main.jsx
│   └── index.css
├── .env.example                   # Committed
├── .env.local                     # Gitignored
├── .gitignore
├── netlify.toml
├── tailwind.config.js
├── postcss.config.js
├── vite.config.js
├── package.json
└── README.md
```

---

## 3. Environment Variables

All secrets in Netlify UI under Site Settings → Environment Variables. Never hardcode.

```
# .env.example — commit this file

# === Frontend (VITE_ prefix exposes to browser) ===
VITE_AIRPORT_ICAO=KVBT
VITE_API_AUTH_TOKEN=                # Shared secret for function auth (see Section 4)

# === Functions only (server-side, never exposed) ===
API_AUTH_TOKEN=                     # Same value as VITE_API_AUTH_TOKEN
FAA_NOTAM_CLIENT_ID=                # Register at api.faa.gov
FAA_NOTAM_CLIENT_SECRET=            # Register at api.faa.gov

# === Optional — only if Flight Schedule Pro API access granted ===
FSP_API_KEY=
FSP_CLUB_ID=

# === Auto-injected by Netlify at runtime — do not set manually ===
# NETLIFY_SITE_ID
# NETLIFY_BLOBS_CONTEXT
```

**Generating the auth token:** Use any cryptographically random 32+ char string. `openssl rand -hex 32` works. The same value goes in both `VITE_API_AUTH_TOKEN` (so the frontend can send it) and `API_AUTH_TOKEN` (so the function can validate it).

---

## 4. Endpoint Authentication

This app is single-user but Netlify Functions are public URLs. All functions that touch user data or proxy paid/rate-limited APIs require auth.

### `netlify/functions/_auth.js`

Shared helper imported by every function. Validates a bearer token in the `Authorization` header against `API_AUTH_TOKEN` env var. Returns 401 on mismatch.

```js
export function requireAuth(headers) {
  const expected = process.env.API_AUTH_TOKEN;
  if (!expected) {
    return { ok: false, status: 500, message: 'Server misconfigured' };
  }
  const header = headers.get?.('authorization') || headers.authorization || headers.Authorization;
  const provided = header?.replace(/^Bearer\s+/i, '');
  if (provided !== expected) {
    return { ok: false, status: 401, message: 'Unauthorized' };
  }
  return { ok: true };
}
```

Every function calls this first:

```js
import { requireAuth } from './_auth.js';
export default async (req, context) => {
  const auth = requireAuth(req.headers);
  if (!auth.ok) {
    return new Response(JSON.stringify({ error: auth.message }), { status: auth.status });
  }
  // ... function logic
};
```

### `src/lib/api.js`

Frontend fetch wrapper that injects the token on every call:

```js
const TOKEN = import.meta.env.VITE_API_AUTH_TOKEN;
export async function apiFetch(path, options = {}) {
  const res = await fetch(path, {
    ...options,
    headers: {
      ...options.headers,
      'Authorization': `Bearer ${TOKEN}`,
      'Content-Type': 'application/json',
    },
  });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`${res.status}: ${body}`);
  }
  return res.json();
}
```

All hooks use `apiFetch()`, never raw `fetch()`.

**Threat model note:** `VITE_API_AUTH_TOKEN` is bundled into the JS sent to the browser, so anyone who loads the page can extract it. This is by design — the goal is to prevent random internet scanners hitting the function URLs, not to defend against a determined attacker who has the page URL. Acceptable for a personal tool. If the threat model changes (sharing with other students, going public), swap to Netlify Identity.

---

## 5. Time and Timezone Handling

**One rule:** all timestamps stored in blobs are ISO 8601 UTC (`2026-05-08T14:53:00Z`). Display conversion happens client-side at render time.

### `src/lib/time.js`

```js
import { formatInTimeZone, toZonedTime } from 'date-fns-tz';
import { format, parseISO } from 'date-fns';

const LOCAL_TZ = 'America/Chicago'; // KVBT is in Central time

export function toUTC(localDate) {
  // Input: Date object or local ISO string. Output: UTC ISO string.
  return new Date(localDate).toISOString();
}

export function formatLocal(utcIso, fmt = 'MMM d, yyyy h:mm a') {
  return formatInTimeZone(parseISO(utcIso), LOCAL_TZ, fmt);
}

export function formatZulu(utcIso, fmt = 'HHmm') {
  return format(parseISO(utcIso), fmt) + 'Z';
}

export function todayLocalISO() {
  // Returns today's date as YYYY-MM-DD in local tz, for date-only fields
  return formatInTimeZone(new Date(), LOCAL_TZ, 'yyyy-MM-dd');
}
```

**Logbook date fields** are date-only strings (`YYYY-MM-DD`), interpreted as local date — no time component, no timezone conversion. METAR observation times, TAF periods, lesson start/end times all use full UTC ISO strings.

---

## 6. Constants

`src/lib/constants.js` — single source of truth for static reference data. Imported only; never mutated.

```js
export const AIRPORT = {
  icao: 'KVBT',
  name: 'Thaden Field',
  city: 'Bentonville, AR',
  elevation_ft: 1304,
  runways: [
    { id: '18', heading_deg: 180, length_ft: 6006 },
    { id: '36', heading_deg: 360, length_ft: 6006 },
  ],
};

// Aircraft is an array — student may fly multiple tail numbers.
// First entry is the primary; UI defaults to it but allows switching.
export const FLEET = [
  {
    tail: 'N7422U',
    type: 'Cessna 172S',
    primary: true,
    vspeeds: {
      // Va varies with weight. Provide a table; UI shows the user-selected weight row.
      // Source: C172S POH. Verify against actual POH for the specific airframe.
      Va_table: [
        { weight_lb: 2550, kias: 105 }, // Max gross
        { weight_lb: 2200, kias: 98 },
        { weight_lb: 1900, kias: 90 },
      ],
      Vx:  { kias: 62,  label: 'Best angle climb' },
      Vy:  { kias: 74,  label: 'Best rate climb' },
      Vfe: { kias: 85,  label: 'Max flap extension (full flaps)' },
      Vno: { kias: 129, label: 'Max structural cruise' },
      Vne: { kias: 163, label: 'Never exceed' },
      Vso: { kias: 40,  label: 'Stall, landing config' },
      Vs1: { kias: 48,  label: 'Stall, clean' },
    },
    fuel_type: '100LL',
    fuel_burn_gph: 8.5,
  },
];

// Default personal minimums. Seeds the blob on first run.
// Once seeded, the blob is the source of truth; constants are not re-read.
export const DEFAULT_PERSONAL_MINIMUMS = {
  ceiling_ft: 3000,
  visibility_sm: 5,
  crosswind_kt: 10,
  wind_kt: 15,
  // Caution thresholds — within X% of limit triggers caution
  caution_margin_pct: 20,
};

// Part 61.109 — full requirements for ASEL Private Pilot certificate.
// Source: 14 CFR §61.109(a). Verify against current FAR.
export const PART_61_REQUIREMENTS = {
  total_hours: 40,
  dual_hours: 20,         // includes XC, night, instrument
  solo_hours: 10,
  solo_xc_hours: 5,       // includes one ≥150 NM with three full-stop landings
  solo_xc_long_nm: 150,   // longest leg ≥50 NM
  night_hours: 3,         // dual, with one XC ≥100 NM total
  night_xc_nm: 100,
  night_takeoffs_landings: 10, // full-stop, at an airport
  instrument_hours: 3,    // simulated or actual
  cross_country_dual: 3,  // dual XC with instructor
  three_takeoffs_landings_solo: 3, // to a full stop at controlled field
};

// All maneuvers tracked for sign-off. Maps to 14 CFR §61.107(b)(1) tasks
// plus ACS task elements. Update if ACS revises.
export const MANEUVER_LIST = [
  'preflight_inspection',
  'normal_takeoff',
  'crosswind_takeoff',
  'normal_landing',
  'crosswind_landing',
  'short_field_takeoff',
  'short_field_landing',
  'soft_field_takeoff',
  'soft_field_landing',
  'go_around',
  'forward_slip',
  'slow_flight',
  'power_off_stall',
  'power_on_stall',
  'steep_turns',
  'turns_around_point',
  's_turns',
  'rectangular_course',
  'emergency_descent',
  'simulated_engine_failure',
  'unusual_attitudes_recovery',
  'hood_work_basic_instruments',
];

// Ground school topics
export const GROUND_SCHOOL_TOPICS = [
  'regulations',
  'weather_theory',
  'weather_services',
  'navigation',
  'airspace',
  'performance_wb',
  'aerodynamics',
  'aircraft_systems',
  'airport_ops',
  'radio_comms',
  'cross_country_planning',
  'physiology_aeromedical',
  'night_ops_theory',
  'emergency_procedures',
  'charts_publications',
  'flight_computers',
  'sectional_reading',
  'checkride_prep',
];
```

---

## 7. Netlify Functions

Each function is at `netlify/functions/<name>.js`. Frontend reaches them at `/.netlify/functions/<name>`.

### 7.1 `weather.js`

Proxies `aviationweather.gov`. No API key needed. Proxy exists for: server-side caching, optional response shaping, and consistency with other functions.

**Frontend call:** `GET /.netlify/functions/weather?icao=KVBT`

**Internal fetches (verified against current API as of May 2026):**
- METAR: `https://aviationweather.gov/api/data/metar?ids=KVBT&format=json&taf=false`
- TAF: `https://aviationweather.gov/api/data/taf?ids=KVBT&format=json`
- Winds aloft (low altitudes, 6h forecast): `https://aviationweather.gov/api/data/windtemp?region=nc&level=low&fcst=06`
- G-AIRMETs (CONUS replacement for AIRMETs): `https://aviationweather.gov/api/data/gairmet?format=json`

**Note:** AIRMET (text) was discontinued for CONUS in January 2025. Use G-AIRMETs.

**Response shape:**
```json
{
  "fetched_utc": "2026-05-08T14:53:00Z",
  "metar": {
    "raw": "KVBT 081453Z 15012G18KT 10SM CLR 18/04 A3015 RMK AO2",
    "wind_dir_deg": 150,
    "wind_speed_kt": 12,
    "wind_gust_kt": 18,
    "visibility_sm": 10,
    "sky_condition": "CLR",
    "ceiling_ft": null,
    "temp_c": 18,
    "dewpoint_c": 4,
    "altimeter_inhg": 30.15,
    "flight_category": "VFR",
    "observed_utc": "2026-05-08T14:53:00Z"
  },
  "taf": {
    "raw": "...",
    "issued_utc": "2026-05-08T11:30:00Z",
    "periods": [
      {
        "from_utc": "2026-05-08T12:00:00Z",
        "to_utc": "2026-05-08T18:00:00Z",
        "wind_dir_deg": 150,
        "wind_speed_kt": 12,
        "visibility_sm": 10,
        "sky_condition": "CLR",
        "flight_category": "VFR"
      }
    ]
  },
  "winds_aloft": {
    "3000_ft": { "dir_deg": 160, "speed_kt": 14, "temp_c": 12 },
    "6000_ft": { "dir_deg": 175, "speed_kt": 22, "temp_c": 6 },
    "9000_ft": { "dir_deg": 190, "speed_kt": 31, "temp_c": -2 }
  },
  "gairmets": []
}
```

**Polling:** 5 minutes via TanStack Query (`staleTime`).
**Caching headers:** Set `Cache-Control: public, max-age=180` on the function response.

---

### 7.2 `notams.js`

Proxies the FAA NOTAM API at `api.faa.gov`. Requires OAuth2 client credentials registered at `https://api.faa.gov` (free registration).

**Verify at implementation time:** confirm exact endpoint path and response shape against current `api.faa.gov` documentation. The endpoint structure has changed and the doc here may be outdated by the time of build. Documented path as of writing:

`https://external-api.faa.gov/notamapi/v1/notams?icaoLocation=KVBT&pageSize=20`

**OAuth2 flow:** the function exchanges `FAA_NOTAM_CLIENT_ID` + `FAA_NOTAM_CLIENT_SECRET` for a bearer token, caches it in Netlify Blobs (`config/notam_oauth_token` with expiry), reuses until expiry.

**Frontend call:** `GET /.netlify/functions/notams?icao=KVBT`

**Response shape:**
```json
{
  "fetched_utc": "2026-05-08T14:53:00Z",
  "count": 2,
  "notams": [
    {
      "id": "0/1234",
      "classification": "FDC",
      "summary": "RWY 18/36 CLSD 2200-0600 DAILY",
      "raw": "...",
      "effective_from_utc": "2026-05-08T22:00:00Z",
      "effective_to_utc": "2026-05-15T06:00:00Z"
    }
  ]
}
```

**Polling:** 30 minutes.
**Failure mode:** if FAA API is down or returns 5xx, return cached previous result with `stale: true` flag, plus the `fetched_utc` timestamp of the cached data.

---

### 7.3 `tfr.js`

Fetches active TFRs nationwide from the FAA TFR feed and filters to those within 100 NM of KVBT.

**Source:** `https://tfr.faa.gov/tfrapi/exportTfrList` returns JSON. Some TFRs are GeoJSON polygons; others are point + radius. Filter implementation must handle both.

**Verify at implementation time:** the FAA TFR feed URL has changed multiple times. If `tfrapi/exportTfrList` 404s, fall back to scraping `https://tfr.faa.gov/tfr2/list.html`.

**Frontend call:** `GET /.netlify/functions/tfr`

**Response shape:**
```json
{
  "fetched_utc": "2026-05-08T14:53:00Z",
  "tfrs_nearby": [
    {
      "id": "4/3892",
      "type": "VIP",
      "summary": "Presidential TFR - XNA area",
      "distance_nm": 18,
      "ceiling_ft": 18000,
      "floor_ft": 0,
      "active": true,
      "effective_from_utc": "2026-05-09T14:00:00Z",
      "effective_to_utc": "2026-05-09T22:00:00Z"
    }
  ]
}
```

**Polling:** 15 minutes.

---

### 7.4 `fsp.js` (conditional)

Implement only if Legends Air confirms API access. Otherwise skip and rely on the manual `scheduling/next_lesson` blob.

**Frontend call:** `GET /.netlify/functions/fsp`

**Response shape:**
```json
{
  "fetched_utc": "2026-05-08T14:53:00Z",
  "next_lesson": {
    "start_utc": "2026-05-14T19:00:00Z",
    "end_utc": "2026-05-14T21:00:00Z",
    "type": "dual",
    "instructor": "Sarah M.",
    "aircraft_tail": "N7422U",
    "notes": "Ground reference maneuvers"
  },
  "upcoming": []
}
```

**Polling:** 60 minutes.

---

### 7.5 `blobs.js`

Unified CRUD for Netlify Blobs. All persistent user data flows through this single function.

**Frontend calls:**
```
GET    /.netlify/functions/blobs?store=<store>&key=<key>
POST   /.netlify/functions/blobs              { store, key, value }
DELETE /.netlify/functions/blobs?store=<store>&key=<key>
```

**Stores and keys:**

| Store | Key | Value type | First-run seed |
|---|---|---|---|
| `logbook` | `entries` | LogbookEntry[] | `[]` |
| `expenses` | `entries` | ExpenseEntry[] | `[]` |
| `training` | `maneuvers` | Object: maneuver_name → ManeuverStatus | seed from `MANEUVER_LIST` |
| `training` | `ground_school` | Object: topic → TopicStatus | seed from `GROUND_SCHOOL_TOPICS` |
| `training` | `practice_tests` | PracticeTestResult[] | `[]` |
| `training` | `written_exam` | WrittenExamStatus | `{ passed: false, date: null, score: null }` |
| `scheduling` | `next_lesson` | NextLesson \| null | `null` |
| `config` | `personal_minimums` | PersonalMinimums | seed from `DEFAULT_PERSONAL_MINIMUMS` |
| `config` | `selected_aircraft_tail` | string | `"N7422U"` |
| `config` | `notam_oauth_token` | { token, expires_utc } | not seeded |

**First-run seeding:** on every GET, if the requested key returns `null` and is in the seed table above, the function writes the seed value before returning it. Idempotent.

---

### 7.6 `export.js`

Returns the entire blob dataset as a single JSON document. Used for backups and FAA logbook reconstruction.

**Frontend call:** `GET /.netlify/functions/export`

**Response:**
```json
{
  "exported_utc": "2026-05-08T14:53:00Z",
  "version": "1.0",
  "data": {
    "logbook": { "entries": [] },
    "expenses": { "entries": [] },
    "training": { "maneuvers": {}, "ground_school": {}, "practice_tests": [], "written_exam": {} },
    "scheduling": { "next_lesson": null },
    "config": { "personal_minimums": {}, "selected_aircraft_tail": "N7422U" }
  }
}
```

UI offers "Download backup" button that hits this endpoint and saves as `preflight-backup-YYYY-MM-DD.json`.

---

## 8. Blob Data Schemas

### LogbookEntry

```json
{
  "id": "uuid-v4",
  "date": "2026-05-08",
  "aircraft_tail": "N7422U",
  "type": "dual",
  "hobbs_start": 1423.4,
  "hobbs_end": 1425.1,
  "hobbs_total": 1.7,
  "landings_day": 4,
  "landings_night": 0,
  "night_hours": 0,
  "instrument_hours": 0,
  "xc_hours": 0,
  "xc_distance_nm": 0,
  "instructor": "Sarah M.",
  "departure_airport": "KVBT",
  "destination_airport": "KVBT",
  "debrief_notes": "Ground reference maneuvers — improving on turns around a point.",
  "maneuvers_practiced": ["turns_around_point", "s_turns", "rectangular_course"],
  "created_utc": "2026-05-08T22:34:12Z"
}
```

`type` enum: `"dual"` | `"solo"` | `"sim"` | `"checkride"`.
`xc_hours > 0` implies cross-country flight; the redundant boolean is dropped.

### ExpenseEntry

```json
{
  "id": "uuid-v4",
  "date": "2026-05-08",
  "logbook_entry_id": "uuid-v4-or-null",
  "hobbs_hours": 1.7,
  "aircraft_cost": 253.30,
  "instructor_cost": 68.00,
  "fees": 0,
  "fuel_cost": 0,
  "total": 321.30,
  "notes": "",
  "created_utc": "2026-05-08T22:34:12Z"
}
```

### ManeuverStatus

```json
{ "signed_off": true, "date": "2026-04-15", "instructor": "Sarah M.", "notes": "" }
```

### TopicStatus

```json
{ "status": "in_progress", "last_updated": "2026-05-01", "notes": "" }
```

`status` enum: `"not_started"` | `"in_progress"` | `"complete"`.

### PracticeTestResult

```json
{
  "id": "uuid-v4",
  "date": "2026-05-01",
  "score_pct": 79,
  "questions_total": 60,
  "questions_correct": 47,
  "weak_areas": ["airspace", "performance"]
}
```

### WrittenExamStatus

```json
{ "passed": false, "date": null, "score": null }
```

### NextLesson (manual fallback)

```json
{
  "start_utc": "2026-05-14T19:00:00Z",
  "end_utc": "2026-05-14T21:00:00Z",
  "type": "dual",
  "instructor": "Sarah M.",
  "aircraft_tail": "N7422U",
  "notes": "Ground reference maneuvers"
}
```

### PersonalMinimums

```json
{
  "ceiling_ft": 3000,
  "visibility_sm": 5,
  "crosswind_kt": 10,
  "wind_kt": 15,
  "caution_margin_pct": 20
}
```

---

## 9. Validation (`src/lib/validation.js`)

Every form submission runs through validation before hitting the API. Reject and surface errors in the UI; never silently coerce.

### LogbookEntry rules
- `hobbs_end > hobbs_start` (strict)
- `hobbs_total === round(hobbs_end - hobbs_start, 1)` — auto-computed, not user-entered
- `date` is not in the future (compare to `todayLocalISO()`)
- `date` is not before 2024-01-01 (sanity floor — adjust if needed)
- `aircraft_tail` matches a tail in `FLEET`
- `landings_day >= 0` integer, `landings_night >= 0` integer
- `night_hours <= hobbs_total`
- `instrument_hours <= hobbs_total`
- `xc_hours <= hobbs_total`
- if `xc_hours > 0`, `destination_airport !== departure_airport` AND `xc_distance_nm >= 50`
- `maneuvers_practiced` items must all be in `MANEUVER_LIST`

### ExpenseEntry rules
- All currency fields ≥ 0
- `total === aircraft_cost + instructor_cost + fees + fuel_cost` (auto-computed)
- `date` not in the future
- if `logbook_entry_id` provided, it must reference an existing logbook entry

### PersonalMinimums rules
- `ceiling_ft >= 1000`, `<= 10000`
- `visibility_sm >= 1`, `<= 10`
- `crosswind_kt >= 0`, `<= 25`
- `wind_kt >= 0`, `<= 40`
- `caution_margin_pct >= 0`, `<= 50`

Validation function signature:
```js
export function validateLogbook(entry) {
  const errors = {};
  // ... checks
  return { valid: Object.keys(errors).length === 0, errors };
}
```

Forms display field-level errors inline; submit button disabled until `valid: true`.

---

## 10. Business Logic

### 10.1 Go/No-Go (`src/lib/goNoGo.js`)

For a student pilot, the only legal flight category is VFR. MVFR / IFR / LIFR are all hard no-go regardless of personal minimums.

**Inputs:** parsed METAR data, current personal minimums (from blob), TFR list.

**Output:**
```js
{
  status: 'go' | 'caution' | 'no_go',
  conditions: [
    { name: 'ceiling', status: 'pass', value: '3500 ft', limit: '3000 ft' }
  ]
}
```

**Rules:**
1. If METAR `flight_category !== 'VFR'` → `no_go` immediately.
2. If `ceiling_ft < ceiling_ft_min` OR `visibility_sm < visibility_sm_min` OR `wind_speed_kt > wind_kt_max` OR `crosswind > crosswind_kt_max` (using best runway) → `no_go`.
3. If any value is within `caution_margin_pct` of its limit → `caution`.
4. If active TFR within 25 NM → adds `caution` flag (never overrides `no_go`).
5. Otherwise → `go`.

### 10.2 Crosswind component (`src/lib/crosswind.js`)

```js
export function crosswindComponent(windDirDeg, windSpeedKt, runwayHeadingDeg) {
  const angleDeg = Math.abs(windDirDeg - runwayHeadingDeg);
  const wrappedAngle = angleDeg > 180 ? 360 - angleDeg : angleDeg;
  const angleRad = wrappedAngle * Math.PI / 180;
  return Math.round(windSpeedKt * Math.sin(angleRad) * 10) / 10;
}

export function bestRunway(windDirDeg, windSpeedKt) {
  // Returns the runway with the lowest crosswind component
  return AIRPORT.runways
    .map(r => ({ ...r, xwind: crosswindComponent(windDirDeg, windSpeedKt, r.heading_deg) }))
    .sort((a, b) => Math.abs(a.xwind) - Math.abs(b.xwind))[0];
}
```

### 10.3 Density altitude (`src/lib/densityAlt.js`)

Uses the cockpit rule-of-thumb formula. Approximate but adequate for awareness:

```js
export function densityAltitude(elevationFt, oatC, altimeterInHg) {
  const pressureAlt = elevationFt + (29.92 - altimeterInHg) * 1000;
  const isaTemp = 15 - (2 * elevationFt / 1000);
  return Math.round(pressureAlt + 120 * (oatC - isaTemp));
}
```

UI must annotate "Approximate (rule-of-thumb formula)" to set expectations vs. flight planning software.

### 10.4 Checkride readiness (`src/lib/checkride.js`)

Composite score 0–100% from weighted components. Computed entirely from blob data.

| Component | Weight | Formula |
|---|---|---|
| Total hours | 20% | min(total / 40, 1) |
| Solo hours | 10% | min(solo / 10, 1) |
| Solo XC hours | 8% | min(solo_xc / 5, 1) |
| Long solo XC ≥150 NM | 5% | 1 if any solo_xc entry has distance ≥ 150 else 0 |
| Night hours | 8% | min(night / 3, 1) |
| Night XC ≥100 NM | 4% | 1 if any night entry has xc_distance ≥ 100 else 0 |
| Night T&L count | 5% | min(night_landings / 10, 1) |
| Instrument hours | 5% | min(instrument / 3, 1) |
| Maneuvers signed off | 15% | signed / total |
| Ground school complete | 12% | complete_topics / total_topics |
| Written exam | 8% | 1 if `passed === true` else 0 |

Sum, multiply by 100, round to integer.

UI also surfaces a "remaining requirements" list — any component below 100% shown as a checklist item with current/required values.

### 10.5 Cost projection

```js
export function projectedTotalCost(expenses, currentTotalHours, targetHours = 40) {
  const totalSpent = expenses.reduce((sum, e) => sum + e.total, 0);
  if (currentTotalHours <= 0) return { projected: 0, remaining: 0, confidence: 'low' };
  const costPerHour = totalSpent / currentTotalHours;
  const hoursRemaining = Math.max(0, targetHours - currentTotalHours);
  const projected = totalSpent + (costPerHour * hoursRemaining);
  return {
    projected: Math.round(projected),
    remaining: Math.round(projected - totalSpent),
    cost_per_hour: Math.round(costPerHour),
    confidence: currentTotalHours < 5 ? 'low' : currentTotalHours < 15 ? 'medium' : 'high',
  };
}
```

UI shows confidence label next to the projected number.

---

## 11. Loading and Error States

Every fetched panel must handle these four states explicitly. No bare spinners; no silent failures.

| State | Display |
|---|---|
| Loading (first fetch) | Skeleton with panel header visible, body shimmer |
| Loading (refetch with cached data) | Show cached data with subtle pulse on refresh icon |
| Error (network) | "Couldn't reach [source]. Showing data from [stale_timestamp]." Retry button. |
| Error (auth/4xx) | "Authentication error — check API_AUTH_TOKEN config." (visible to user since it's a personal app) |
| Stale (cached, older than 2× polling interval) | Yellow `<StaleIndicator>` badge with timestamp |

`<ErrorState>`, `<LoadingState>`, `<StaleIndicator>` live in `src/components/ui/`.

---

## 12. Component Specifications

### 12.1 `GoNoGo.jsx`
- Consumes: `useWeather()`, `useTfr()`, `useBlobs('config', 'personal_minimums')`
- Display: large GO / CAUTION / NO-GO text (green / amber / red), checklist of conditions, footer with personal minimums + edit button
- Edit minimums opens `<PersonalMinsForm>` in modal
- Empty state: if weather not loaded yet → loading skeleton

### 12.2 `Weather.jsx`
- Consumes: `useWeather()`
- Display: VFR badge only (or red "no-go" badge if non-VFR — no MVFR/IFR/LIFR gradient since student pilots can't fly any of those)
- Wind, temp/dew, altimeter, density altitude (with "approx" annotation)
- Winds aloft table: 3k / 6k / 9k
- TAF: up to 4 future periods, each labeled with local time range
- Raw METAR string in monospace at bottom
- Stale indicator if `fetched_utc` > 10 min old

### 12.3 `NextLesson.jsx`
- Consumes: `useLesson()` — tries FSP function first if `FSP_API_KEY` present, falls back to blob `scheduling/next_lesson`
- Display: date+time (in local), instructor, tail, type, focus
- "Edit" button opens manual entry modal that writes to blob (always available, even when FSP is connected — manual edit overrides FSP for current lesson)

### 12.4 `CheckrideReadiness.jsx`
- Consumes: all `training` blobs + `logbook/entries` (for hour aggregation)
- Display: composite percentage, progress bar, expandable breakdown by component
- "What's left" view: filtered list of components below 100%

### 12.5 `GroundSchool.jsx`
- Consumes: `useBlobs('training', 'ground_school')`, `useBlobs('training', 'practice_tests')`
- Display: per-topic status with click-to-cycle (not_started → in_progress → complete)
- Saves immediately on click (optimistic update)
- Practice test scores: trend line + best/last/count
- "Add practice test" button opens modal

### 12.6 `Logbook.jsx`
- Consumes: `useBlobs('logbook', 'entries')`
- Display: aggregated hours, Part 61 progress bars (each line in `PART_61_REQUIREMENTS`)
- Last 5 entries listed with date/type/hobbs/notes
- "Add entry" button opens `<LogbookEntryForm>` modal

### 12.7 `ExpenseTracker.jsx`
- Consumes: `useBlobs('expenses', 'entries')`
- Display: total, projected, cost per hour, confidence label
- Recharts dual-axis bar+line — cost per lesson + Hobbs hours
- Range selector: 8 lessons / 30 days / 90 days / all time (default: 30 days)
- "Add expense" button — pre-fills from most recent logbook entry if matched

### 12.8 `AircraftRef.jsx`
- Consumes: `FLEET` constants + `useBlobs('config', 'selected_aircraft_tail')`
- Display: aircraft selector dropdown (if `FLEET.length > 1`), V-speed table, fuel info
- Va sub-selector by weight — shows the row matching user-selected weight
- Crosswind calculator: input wind dir/speed, outputs xwind for both runways

---

## 13. Forms (Modal Pattern)

All entry forms render in a modal overlay using `<Modal>` component. Modal traps focus, closes on ESC and backdrop click, restores scroll lock on body.

Modal contract:
```jsx
<Modal isOpen={open} onClose={() => setOpen(false)} title="Add Logbook Entry">
  <LogbookEntryForm
    onSave={async (entry) => { await saveEntry(entry); setOpen(false); }}
    onCancel={() => setOpen(false)}
  />
</Modal>
```

Forms validate on submit, show field-level errors inline, disable submit until valid.

---

## 14. Layout

Single-page app, no router needed.

```
┌──────────────────────────────────────────────────────┐
│ Header (full width)                                  │
├──────────────┬───────────────┬───────────────────────┤
│              │               │  NextLesson           │
│  GoNoGo      │  Weather      ├───────────────────────┤
│              │               │  CheckrideReadiness   │
├──────────┬───┴────┬──────────┴────┬──────────────────┤
│ TotalHrs │ ToCkrd │ TotalSpent    │ ProjectedTotal   │
├──────────┴────────┼───────────────┴──────────────────┤
│                   │                                  │
│  GroundSchool     │  Logbook                         │
│                   │                                  │
├───────────────────┼──────────────────────────────────┤
│                   │                                  │
│  ExpenseTracker   │  AircraftRef                     │
│                   │                                  │
└───────────────────┴──────────────────────────────────┘
```

Responsive: below 768px all panels stack to single column. Above 768px the grid above applies.

---

## 15. `package.json`

```json
{
  "name": "preflight",
  "private": true,
  "version": "1.0.0",
  "type": "module",
  "scripts": {
    "dev": "netlify dev",
    "vite-only": "vite",
    "build": "vite build",
    "preview": "vite preview",
    "lint": "eslint src --ext .js,.jsx"
  },
  "dependencies": {
    "@netlify/blobs": "^8.1.0",
    "@tanstack/react-query": "^5.51.0",
    "date-fns": "^3.6.0",
    "date-fns-tz": "^3.1.0",
    "lucide-react": "^0.439.0",
    "react": "^18.3.0",
    "react-dom": "^18.3.0",
    "recharts": "^2.12.0",
    "uuid": "^10.0.0"
  },
  "devDependencies": {
    "@vitejs/plugin-react": "^4.3.0",
    "autoprefixer": "^10.4.0",
    "eslint": "^9.0.0",
    "eslint-plugin-react": "^7.35.0",
    "postcss": "^8.4.0",
    "tailwindcss": "^3.4.0",
    "vite": "^5.4.0"
  }
}
```

---

## 16. `netlify.toml`

```toml
[build]
  command = "npm run build"
  publish = "dist"
  functions = "netlify/functions"

[functions]
  node_bundler = "esbuild"

[dev]
  framework = "vite"
  targetPort = 5173
  port = 8888

[[headers]]
  for = "/*"
  [headers.values]
    X-Frame-Options = "DENY"
    X-Content-Type-Options = "nosniff"
    Referrer-Policy = "strict-origin-when-cross-origin"
```

---

## 17. `vite.config.js`

```js
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  build: {
    outDir: 'dist',
    sourcemap: true,
  },
});
```

No proxy block. `netlify dev` wraps Vite and handles function routing automatically — frontend calls to `/.netlify/functions/*` resolve to local function handlers during development.

---

## 18. `tailwind.config.js`

```js
export default {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  theme: {
    extend: {
      fontFamily: {
        mono: ['ui-monospace', 'SFMono-Regular', 'Menlo', 'Monaco', 'monospace'],
      },
    },
  },
  plugins: [],
};
```

---

## 19. TanStack Query Setup

```js
// src/main.jsx
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 2,
      refetchOnWindowFocus: false,
      staleTime: 60_000,
    },
  },
});
```

Per-hook polling intervals:

| Hook | `staleTime` | `refetchInterval` |
|---|---|---|
| `useWeather` | 5 min | 5 min |
| `useNotams` | 30 min | 30 min |
| `useTfr` | 15 min | 15 min |
| `useLesson` | 60 min | 60 min |
| `useBlobs` | 0 | none (manual invalidation on mutation) |

---

## 20. README.md (deliverable)

The developer agent must create a `README.md` covering:

1. Project description (1 paragraph)
2. Local setup steps:
   - Clone
   - `npm install`
   - Copy `.env.example` to `.env.local`, generate auth token with `openssl rand -hex 32`, set both `VITE_API_AUTH_TOKEN` and `API_AUTH_TOKEN` to that value
   - Register at `api.faa.gov` for NOTAM credentials, set `FAA_NOTAM_CLIENT_ID` and `FAA_NOTAM_CLIENT_SECRET`
   - `npm run dev` — runs at `http://localhost:8888`
3. Deploy to Netlify:
   - Connect GitHub repo to Netlify site
   - Set all env vars in Netlify UI (mirror `.env.local` minus the file)
   - Push to main → auto-deploy
4. Backup strategy:
   - "Download backup" button hits `/.netlify/functions/export`
   - Recommended: monthly local save
5. Known limitations:
   - Density altitude is rule-of-thumb (see Section 10.3)
   - Va listed as table; UI defaults to max-gross row
   - Single-aircraft assumption in v1 (FLEET array supports multiple but UI primarily designed for one)
   - Ground school topics manually tracked (no Sporty's API)

---

## 21. Out of Scope (v1)

- User authentication beyond the shared-secret token
- Multi-user support
- Mobile native app
- Offline mode / service worker
- FAA paper logbook PDF export
- ForeFlight import/export
- Weight & Balance calculator (deferred to v2)
- Flight planning / route entry
- Historical weather lookup

---

## 22. Build Order Recommendation

For the developer agent, suggested order to keep each phase verifiable:

1. **Scaffold**: Vite + React + Tailwind + Netlify CLI working, deploys to Netlify.
2. **Auth + blobs**: `_auth.js`, `blobs.js`, `useBlobs` hook, seed-on-first-read working. Verify by writing and reading a logbook entry from the browser console.
3. **Constants + validation**: `constants.js`, `validation.js`, `time.js` complete and unit-tested if possible.
4. **Weather**: `weather.js` function + `useWeather` hook + `Weather.jsx` panel. Verify against KVBT live.
5. **Go/No-Go**: depends on weather. Build with mocked TFR data, integrate `tfr.js` last.
6. **Logbook + Expenses**: forms, panels, validation, projections.
7. **Ground School + Checkride Readiness**: depends on logbook.
8. **NOTAMs + TFR**: external dependencies, leave for last.
9. **Aircraft + final layout polish**.
10. **Export endpoint + README**.

---

## 23. Open Questions to Resolve Before Section-Specific Work

| # | Question | Owner |
|---|---|---|
| 1 | Does Legends Air grant Flight Schedule Pro API access? | Matt to ask |
| 2 | What is the exact FAA NOTAM API endpoint and OAuth flow as of build date? | Verify at api.faa.gov |
| 3 | Is `tfr.faa.gov/tfrapi/exportTfrList` still the active TFR feed? | Verify on first implementation |
| 4 | Confirm V-speeds for the specific Cessna 172S airframe at Legends — POH may differ from generic constants | Matt to verify against POH |

Resolve #1 before building Section 7.4. Items #2 and #3 are checked at function implementation time. Item #4 is a constants update only.

---

*End of document v1.1.*
