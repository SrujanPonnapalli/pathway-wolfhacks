# pathway

Next.js (TypeScript, Tailwind) app. The decision tree is trained offline in Python and runs in the browser — no Python server.

## Run

```bash
cp .env.example .env.local   # fill in keys
npm install
npm run dev
```

`npm test` checks the in-browser tree walker. Apply `db/schema.sql` to Tiger Cloud once.

## Layout

| Path | What |
|---|---|
| `data/` | Student outcomes dataset (800 rows) + data dictionary |
| `docs/planning/` | Ideation, critiques, decisions, spec — start at `docs/planning/README.md` |
| `src/lib/tree.ts` | Walks exported sklearn tree JSON; returns path (for D3 highlight) + risk |
| `public/models/` | `tree_early.json`, `tree_mid.json`, `evidence.json` from the notebook (sample tree checked in) |
| `notebooks/` | Training + export (`iaa_baseline.py`) |
| `db/schema.sql` | `events` hypertable + `weekly_stats` continuous aggregate |
| `src/app/api/events` | Log events (POST) / weekly stats (GET) — also the puck's endpoint |
| `src/app/api/{syllabus,coach}` | Gemini (stubs) |
| `src/app/api/{tts,stt}` | ElevenLabs (stubs) |
| `src/app/api/calendar` | .ics import/export (stub) |

Risk scores are computed on-device and never stored server-side.

## Owners

- Frontend lead — page skeleton + D3 tree
- Srujan — notebook + JSON exports
- Third — Tiger schema, events, calendar
- Fourth — Gemini/ElevenLabs routes, Vercel + domain
