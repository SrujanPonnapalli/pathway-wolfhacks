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
| `docs/planning/` | Ideation, critiques, decisions, spec. Start at `docs/planning/README.md` |
| `src/lib/tree.ts` | `predict`, `explain` (path as steps), `recourse` (cheapest actionable change). Tested in `tree.test.ts` |
| `src/lib/features.ts` | Every dataset column: label, suggest/context/never role, bounds, plain-English wording |
| `src/lib/data.ts` | The one file the UI reads data through. Swap its bodies for `/api` calls |
| `src/lib/mock.ts` | Demo profiles built from real dataset rows, fixed demo clock |
| `src/lib/store.tsx` | Client state: profile switcher, live loop (quiz/check-in → re-score on device), study blocks |
| `public/models/` | `tree_early.json`, `tree_mid.json` (SAMPLE trees on real columns until the notebook export lands), `evidence.json` pending |
| `src/lib/viva.ts`, `src/lib/voice.ts` | Viva's persona + mock replies (with the causal-language filter), simulated voice session |
| `src/components/Viva.tsx` | Viva's face on an [orb-ui](https://orb-ui.com) orb; driven by `{ state, input, output }` |
| `src/app/` | Home, Study, Insights (tree path + what would help + evidence), Viva (chat / voice), Study buddies |
| `db/schema.sql` | `events` hypertable + `weekly_stats` continuous aggregate |
| `src/app/api/*` | events (works), syllabus/coach (Gemini), tts/stt (ElevenLabs), calendar: stubs |

Statuses are computed on-device and never stored server-side.

UI libraries (all MIT): [orb-ui](https://orb-ui.com) for Viva's body, and [thinking-orbs](https://libraries.dev/orbs), [border-beam](https://libraries.dev/beam), [voice-glow](https://libraries.dev/voice) and [liquid-gooey](https://libraries.dev/gooey) from Libraries.dev (free npm packages only, no Pro content).

## Owners

- Frontend lead — page skeleton + D3 tree
- Srujan — notebook + JSON exports
- Third — Tiger schema, events, calendar
- Fourth — Gemini/ElevenLabs routes, Vercel + domain
