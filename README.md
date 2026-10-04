# Pathway

**Know your next move.** Pathway helps students make sense of a difficult semester. It brings course activity, grades, deadlines, and study habits into one place, explains *why* a course may need attention, and turns that explanation into a step the student can put on their calendar.

This is a hackathon prototype. Its decision trees were trained on synthetic student data, so their predictions are demonstrations of the product, not validated academic outcomes.

## Try the demo

```bash
npm install
npm run dev
```

Open [localhost:3000/demo](http://localhost:3000/demo) for Maya's sample semester. The demo works without API keys or a database. You can also open `/demo/jordan`, `/demo/priya`, or `/demo/judge` for a blank profile. The [landing page](http://localhost:3000/landing) is separate from the app.

Outside demo mode, Pathway asks visitors to sign in with Google. Account sign-in requires a database, a Google OAuth web client ID, and a session secret; see [Configuration](#configuration).

### iPhone demo

Open the deployed site's `/demo` URL in Safari, then choose **Share → Add to Home Screen**. The installed app launches into the demo with the Pathway icon. It uses five bottom tabs: Home, Study, Week, Viva, and More. More contains Courses, Insights, Inbox, and Buddies; Beacon is available in desktop navigation. The app needs an internet connection.

Phone layouts account for the home indicator and landscape safe areas. Text fields keep Safari from zooming on focus, and Viva adjusts to the visible viewport when the keyboard opens. Before presenting, check the installed app on the target iPhone, especially Viva voice permissions and the keyboard.

## What Pathway does

- **Shows the reason.** An on-device decision tree checks course signals and displays the path behind its result. Insights also shows what could change the result and the evidence behind the prototype model.
- **Makes a plan.** The Week page puts classes, due dates, and study blocks together. Suggestions wait for approval before changing the calendar.
- **Helps you study.** Course materials can become quizzes, flashcards, and explanations. Viva supports chat and voice, can use relevant course context, and can propose actions such as adding or moving a study block.
- **Keeps the source visible.** Uploaded syllabi, notes, and grade pages become reviewable facts with source references. Uncertain facts wait for the student to check them.
- **Connects the rest of the semester.** Pathway includes a course-focused inbox, study buddies, Pathway Beacon (a Raspberry Pi desk companion), and optional Study Pots on Solana devnet.

### What connects today

| Service | Current behavior |
| --- | --- |
| Moodle and Gradescope | Sample records are included in the demo. Students can drop their own syllabus or grade page; there is no direct account sync yet. |
| Google Drive | An optional Google Picker lets a student choose course files to import. It needs Google OAuth and a browser API key. |
| Google Calendar | An optional shared demo calendar or a student's personal calendar can sync events and approved study blocks. |
| Gmail | Viva can draft a reply and open it in Gmail for the student to send. The inbox currently uses sample mail; Pathway does not send mail itself. |
| Gemini | Powers Viva, document analysis, study material generation, and planning when an API key is configured. The decision tree itself does not call Gemini. |
| ElevenLabs | Handles Viva speech-to-text and text-to-speech when configured. |

## How it works

1. **Collect signals.** Pathway uses sample or uploaded course records, logged quizzes and check-ins, upcoming work, and the student's calendar.
2. **Explain the check-in.** Python trains and exports the decision trees offline. The browser runs the exported JSON model and shows its decision path; there is no Python server.
3. **Choose a next step.** Rule-based suggestions and Gemini planner proposals appear in the same review flow. Suggested calendar changes wait for approval; direct commands to Viva leave a receipt in the conversation.
4. **Keep studying.** New activity updates the course picture. Viva can answer with course context and leave a receipt for actions it takes in the app.

The database, when configured, stores student inputs and app state. The course-status prediction is calculated in the browser rather than stored as a database field. In voice mode, speech is processed by ElevenLabs.

## Built with

Next.js 16, React 19, TypeScript, and Tailwind CSS power the app. Python and scikit-learn train the exported decision trees. Optional services include Gemini for Viva and planning, ElevenLabs for voice, Tiger Cloud for persistence, Google Drive and Calendar, and Solana devnet for Study Pots.

## Configuration

Copy `.env.example` to `.env.local` when you want to enable services. Replace its placeholders; if you are not using Tiger Cloud, remove the example `DATABASE_URL` value.

| To enable | Set in `.env.local` | Notes |
| --- | --- | --- |
| Google account sign-in | `DATABASE_URL`, `NEXT_PUBLIC_GOOGLE_CLIENT_ID`, `SESSION_SECRET` | Set up the schema with `npm run db:setup`. The OAuth client must allow your local or deployed origin. |
| Viva and document analysis | `GEMINI_API_KEY` | `GEMINI_MODEL_FAST` and `GEMINI_MODEL` can override the defaults. |
| Viva voice | `ELEVENLABS_API_KEY` | `ELEVENLABS_VOICE_ID` is optional. Keep the API key server-side. |
| Google Drive Picker | `NEXT_PUBLIC_GOOGLE_CLIENT_ID`, `NEXT_PUBLIC_GOOGLE_API_KEY` | Enable the Google Picker and Drive APIs for the project. |
| Personal Google Calendar | `NEXT_PUBLIC_GOOGLE_CLIENT_ID` | Connect from the app through Google OAuth. |
| Shared demo calendar | `GOOGLE_SERVICE_ACCOUNT_JSON`, `GOOGLE_CALENDAR_ID` | Share the calendar with the service account. Google mirrors the profile on screen: Pathway's own entries are tagged and kept in step, the student's own events are never touched. `GOOGLE_FAKE_CALENDAR=1` provides an in-memory local stand-in. |
| Study Pots | `SOLANA_AUTHORITY_SECRET`, `WALLET_ENCRYPTION_KEY`, `PATH_MINT` | Uses Solana devnet; see [docs/solana](docs/solana/README.md). |

**One clock.** Every time the browser keeps is a local wall-clock string without a zone (`src/lib/time.ts`): data from the database or a model is converted on the way in, and study blocks go to the database as UTC instants. Blocks write through on every add, move, rename or removal, and a reload merges rather than replaces.

**Demo account.** The demo student is Rehan (profile id `maya`, which keys the rows, the seeded facts and the Google tags). A Google account listed in `DEMO_ACCOUNT_EMAILS` (comma-separated; defaults to the team's demo account) signs in as that profile (`DEMO_ACCOUNT_PROFILE`): the account and `/demo` are one profile, so courses, files, facts, study blocks, chats and the Google calendar are the same seen either way, and a change made in one shows in the other (`src/lib/demoAccount.ts`). `/demo` offers only that profile (the other sample students stay in the database as study buddies), it stays open to visitors while the account points at it, every sign-in re-adds anything the seed is missing, and deleting the demo account only unlinks it. What used to live only in one browser (Viva chats, suggestions set aside, demo events moved or removed, notes, study material) is kept per profile as one document (`/api/extras`, table `profile_extras`) and merged on load, and files dropped on one device are merged into the graph everywhere (`GET /api/knowledge`). If the shared calendar (`GOOGLE_CALENDAR_ID`) is that account's own, it is connected for it with no OAuth step.

**Viva acts at once.** Viva's calendar actions run as soon as the model returns them, and the receipt says what happened. `NEXT_PUBLIC_VIVA_CONFIRM=1` brings back the spoken "want me to go ahead?" check on voice turns.

For database setup and the pooled Vercel connection string, see [docs/database](docs/database/README.md). Never commit `.env.local` or service-account keys.

## Useful commands

```bash
npm run dev       # local app
npm test          # unit tests
npm run lint      # ESLint
npm run build     # production build
npm run db:setup  # create database schema, when DATABASE_URL is configured
npm run db:check  # check database setup
```

## Where to look in the code

| Area | Key files |
| --- | --- |
| Model and evidence | `notebooks/pathway_model.py`, `notebooks/RESULTS.md`, `public/models/`, `src/lib/tree.ts`, `src/lib/features.ts` |
| Demo and app state | `src/lib/mock.ts`, `src/lib/data.ts`, `src/lib/store.tsx`, `src/app/demo/` |
| Course materials | `src/lib/knowledge/`, `src/app/courses/`, `src/app/study/` |
| Viva and voice | `src/lib/intel/`, `src/components/Viva.tsx`, `src/components/VivaDock.tsx`, `src/lib/voice.ts` |
| Calendar | `src/lib/schedule.ts`, `src/lib/gcal.ts`, `src/app/calendar/` |
| Database and API | `db/schema.sql`, `scripts/db.ts`, `src/app/api/` |
| Pathway Beacon | `src/app/device/`, `scripts/kiosk.sh`, [hardware setup](docs/hardware/README.md) |

The [planning notes](docs/planning/README.md) document earlier ideas and decisions; the code and this README describe the current prototype.
