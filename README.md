# Pathway

Next.js (TypeScript, Tailwind) app. The decision tree is trained offline in Python and runs in the browser — no Python server.

## Run

```bash
cp .env.example .env.local   # fill in keys
npm install
npm run dev
```

`npm test` runs the unit tests. For the database, put `DATABASE_URL` in `.env.local`, then run `npm run db:setup` and `npm run db:check`; see [docs/database](docs/database/README.md). Without a database the app runs on local demo data.

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
| `db/schema.sql`, `scripts/db.ts` | Tiger schema (events hypertable, `course_weekly` real-time aggregate, `course_features` model-input view, pgvector) and the setup/seed/check script. Docs: [docs/database](docs/database/README.md) |
| `src/app/api/*` | Database routes (profiles, state, events, blocks, todos, courses, buddies); `tts`/`stt` = Viva's voice via ElevenLabs (v4 Turbo, Scribe v2; key stays server-side) |
| `src/app/device/` | The Raspberry Pi kiosk screen (1024×600, no app chrome). `scripts/kiosk.sh` launches it fullscreen on the Pi; setup docs: [docs/hardware](docs/hardware/README.md) |
| `src/lib/gemini.ts`, `src/lib/intel/` | Gemini: `coach` (Viva's brain, one fast call over the student's own context), `syllabus`, `study` (quiz/viva/flashcards), `dataset`, `analyze` (drop anything). Routes: `api/{coach,syllabus,quiz,viva,analyze,dataset}` |
| `src/lib/schedule.ts`, `src/lib/gcal.ts`, `src/app/calendar/` | The week: classes/exams/due dates (Moodle feed, demo data) + study blocks + Google Calendar; suggestion rules; approved changes write to Google |
| `src/lib/inbox.ts`, `src/app/inbox/` | Course mail (demo data); Viva drafts replies, Gmail sends |

Your status is calculated on your device and never stored by Pathway; the database holds inputs only. In voice mode, speech is processed by ElevenLabs.

UI libraries (all MIT): [orb-ui](https://orb-ui.com) for Viva's body, and [thinking-orbs](https://libraries.dev/orbs), [border-beam](https://libraries.dev/beam), [voice-glow](https://libraries.dev/voice) and [liquid-gooey](https://libraries.dev/gooey) from Libraries.dev (free npm packages only, no Pro content).

## Owners

- Frontend lead — page skeleton + D3 tree
- Srujan — notebook + JSON exports
- Third — Tiger schema, events, calendar
- Fourth — Gemini/ElevenLabs routes, Vercel + domain

## Gemini and Google Calendar

`GEMINI_API_KEY` (AI Studio). Viva answers from one fast call on `gemini-3.5-flash-lite`; documents use `gemini-3.8-flash` with fallbacks. Both model names are env-overridable.

Google Calendar is read and written from the browser with a Web OAuth client ID (`NEXT_PUBLIC_GOOGLE_CLIENT_ID`): Cloud Console → enable Calendar API → consent screen (Testing, add yourself as test user) → OAuth client, Web application, authorized JavaScript origin `http://localhost:3000` (add the Vercel/GoDaddy origins later). Once connected, every class, exam, due date and study block is written to the student's calendar once and kept in sync; approved suggestions update the Google events.
