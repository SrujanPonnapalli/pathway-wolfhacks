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
| `public/models/` | `tree_early.json` (early tree v2: depth 4, 11 leaves, splits on a derived `warning_signs` count whose cutoffs ship inside the file), `tree_mid.json` (depth 3, 6 leaves), `evidence.json` (test metrics, capacity curve, 200-refit stability, subgroup audit). All exported from `notebooks/pathway_model.py`; `src/lib/rows.json` holds the dataset rows the demo profiles are built from |
| `src/lib/viva.ts`, `src/lib/voice.ts` | Viva's persona + mock replies (with the causal-language filter), simulated voice session |
| `src/components/Viva.tsx` | Viva's face on an [orb-ui](https://orb-ui.com) orb; driven by `{ state, input, output }` |
| `src/app/` | Home, Courses (every class: syllabus, gradebook, attendance, lecture materials, and the facts with their sources and review gate; `src/app/courses/`), Study (quiz / flashcards from the course materials or a dropped file), Insights (status + route to on track, four standing tiles on the tree's own cutoffs, grades by syllabus category and missing work via `src/lib/standing.ts`; model path, what-ifs and evidence collapsed below), Viva (chat / voice), Study buddies |
| `src/lib/coursework-data.ts`, `src/lib/coursework.ts`, `src/lib/knowledge/sample.ts` | Sample course content for all 8 dataset courses (syllabus, weekly schedule, assignments, lecture notes with full text) and the per-student gradebook and attendance log generated from each profile's own numbers, so no demo status flips; `sample.ts` turns them into the knowledge graph every profile starts with |
| `db/schema.sql`, `scripts/db.ts` | Tiger schema (events hypertable, `course_weekly` real-time aggregate, `course_features` model-input view, pgvector) and the setup/seed/check script. Docs: [docs/database](docs/database/README.md) |
| `src/app/api/*` | Database routes (profiles, state, events, blocks, todos, courses, buddies); `tts`/`stt` = Viva's voice via ElevenLabs (v4 Turbo, Scribe v2; key stays server-side) |
| `src/app/device/` | The Raspberry Pi kiosk screen (1024×600, no app chrome). `scripts/kiosk.sh` launches it fullscreen on the Pi; setup docs: [docs/hardware](docs/hardware/README.md) |
| `src/lib/gemini.ts`, `src/lib/intel/` | Gemini: `coach` (Viva's brain, one fast call over the student's own context; also drafts replies and the advisor note), `planner` (proposes up to 3 calendar changes from mail, due work, syllabus policies and status), `syllabus`, `study` (quiz/viva/flashcards), `dataset`, `analyze` (drop anything). Routes: `api/{coach,plan,syllabus,quiz,viva,analyze,dataset}` |
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

**Viva is an agent.** Chat and voice both go through `POST /api/agent` (`src/lib/intel/agent.ts`): one structured call returns what Viva says and a list of actions the browser then runs against its own state: add (with daily, weekday or weekly repeats), move, resize, rename or remove calendar events, clear a range, approve or dismiss suggestions (or all of them), "make it real", log quizzes and check-ins, set a midterm, open a quiz or deck from a named lecture file, draft an email (shown with Copy / Open in Gmail, never sent), or navigate. A block whose time is taken slides to the next free slot and the receipt says so. Viva sees the next 14 days with ids; a topic question brings the matching lecture file along (word overlap, no model call, `src/lib/knowledge/excerpts.ts`), and a whole-week question gets a brief per-course pack (next two weeks of dates, open and missing work, weights) instead of every fact. Every action leaves a receipt under the message. A zero-token router picks a specialist per message (coach, writer, scheduler, tutor), each with its own prompt addendum and output budget, so there are no tool loops and no second round trip. Durable facts the student states come back as `remember` notes that ride along with every turn, so history can stay at six turns without Viva forgetting. The mini Viva in the sidebar (`src/components/VivaDock.tsx`) holds the one voice session and the one chat thread for the whole app; leaving the Viva page hands the conversation to it. Voice speed (0.8× to 1.6×) and a token meter live in its settings; Skip fast-forwards what Viva is saying.

**The loop, and what it costs.** The decision tree runs on-device on every change (a quiz, a check-in, a midterm, a dropped Gradescope page, which overrides the course's deadline numbers) and never calls Gemini. Gemini is called only when there is something new to read: one call per dropped file, one per Viva turn, and one planner call per *context change* (the client hashes courses' status, sources, mail, the week's events and current suggestions; the result is cached per hash in localStorage, so dragging blocks around or reloading costs nothing). Planner proposals land in the same Week-page list as the rule-based suggestions and need the same Approve. The advisor note on Insights is one call, and nothing is sent unless the student sends it.

**Shared calendar (the demo).** The student's Google Calendar is connected for everyone who opens the app, with no sign-in: a service account that the calendar is shared with does the reading and writing through `/api/gcal`. Set `GOOGLE_SERVICE_ACCOUNT_JSON` (key file contents) and `GOOGLE_CALENDAR_ID` (the account's email). Classes, exams, due dates and study blocks are written once (tagged `Pathway:<id>`, so visitors never duplicate them); the app polls every 20 s and shows a notice when anything is added, moved or removed in Google; approved suggestions and "Make it real" write back. `GOOGLE_FAKE_CALENDAR=1` fakes it in memory for local dev.

**Personal calendar (fallback).** With no service account, Google Calendar is read and written from the browser with a Web OAuth client ID (`NEXT_PUBLIC_GOOGLE_CLIENT_ID`): Cloud Console → enable Calendar API → consent screen (Testing, add yourself as test user) → OAuth client, Web application, authorized JavaScript origin `http://localhost:3000` (add the Vercel/GoDaddy origins later). Once connected, every class, exam, due date and study block is written to the student's calendar once and kept in sync; approved suggestions update the Google events.
