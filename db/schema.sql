-- Pathway database (Tiger Cloud: PostgreSQL + TimescaleDB + pgvector).
-- Idempotent: safe to run again. Apply with `npm run db:setup`. Docs: docs/database/.
--
-- Privacy invariant: this database stores INPUTS ONLY (what a student did and has).
-- It never stores a risk score, status, model output or path. The decision tree runs in
-- the browser. `npm run db:check` fails if any column name looks like a model output.

CREATE EXTENSION IF NOT EXISTS timescaledb;
CREATE EXTENSION IF NOT EXISTS vector;

-- ── People and courses ────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS profiles (
  id          TEXT PRIMARY KEY,                      -- 'maya', 'jordan', 'priya', 'judge'
  name        TEXT NOT NULL,
  class_year  TEXT,
  sample      BOOLEAN NOT NULL DEFAULT false,        -- built from dataset rows (synthetic)
  term_start  DATE NOT NULL DEFAULT DATE '2026-08-18', -- for pace-adjusting counts mid-semester
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS courses (
  profile_id   TEXT NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  slug         TEXT NOT NULL,                        -- 'bio-181'
  code         TEXT NOT NULL,                        -- 'BIO 181'
  name         TEXT NOT NULL,
  dataset_row  TEXT,                                 -- student_id the baseline came from, if sample
  baseline     JSONB NOT NULL DEFAULT '{}'::jsonb,   -- model inputs before any logged activity
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (profile_id, slug)
);

-- Scheduled class meetings: the denominator for attendance_rate.
CREATE TABLE IF NOT EXISTS class_meetings (
  profile_id  TEXT NOT NULL,
  course_slug TEXT NOT NULL,
  starts_at   TIMESTAMPTZ NOT NULL,
  title       TEXT NOT NULL,
  PRIMARY KEY (profile_id, course_slug, starts_at),
  FOREIGN KEY (profile_id, course_slug) REFERENCES courses(profile_id, slug) ON DELETE CASCADE
);

-- Exams and assignments, from syllabi (Gemini, then confirmed by the student), .ics, or manual.
CREATE TABLE IF NOT EXISTS deadlines (
  id           BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  profile_id   TEXT NOT NULL,
  course_slug  TEXT NOT NULL,
  kind         TEXT NOT NULL CHECK (kind IN ('exam', 'assignment')),
  title        TEXT NOT NULL,
  due_at       TIMESTAMPTZ NOT NULL,
  source       TEXT NOT NULL DEFAULT 'manual' CHECK (source IN ('syllabus', 'ics', 'manual', 'seed')),
  confirmed    BOOLEAN NOT NULL DEFAULT true,        -- syllabus dates start unconfirmed
  submitted_at TIMESTAMPTZ,                          -- assignments only
  FOREIGN KEY (profile_id, course_slug) REFERENCES courses(profile_id, slug) ON DELETE CASCADE,
  UNIQUE (profile_id, course_slug, kind, title, due_at)
);
CREATE INDEX IF NOT EXISTS deadlines_due ON deadlines (profile_id, due_at);

-- Make It Real output: dated study blocks.
CREATE TABLE IF NOT EXISTS study_blocks (
  id          BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  client_id   TEXT,                                  -- id the browser gave it, for idempotent sync
  profile_id  TEXT NOT NULL,
  course_slug TEXT NOT NULL,
  title       TEXT NOT NULL,
  starts_at   TIMESTAMPTZ NOT NULL,
  done_at     TIMESTAMPTZ,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  FOREIGN KEY (profile_id, course_slug) REFERENCES courses(profile_id, slug) ON DELETE CASCADE,
  UNIQUE (profile_id, client_id)
);

CREATE TABLE IF NOT EXISTS todos (
  profile_id TEXT NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  id         TEXT NOT NULL,
  title      TEXT NOT NULL,
  detail     TEXT NOT NULL DEFAULT '',
  href       TEXT NOT NULL DEFAULT '/',
  due_at     TIMESTAMPTZ,
  done_at    TIMESTAMPTZ,
  PRIMARY KEY (profile_id, id)
);

-- Study buddies see effort only (see buddy_effort below), never status.
CREATE TABLE IF NOT EXISTS buddies (
  profile_id TEXT NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  buddy_id   TEXT NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  PRIMARY KEY (profile_id, buddy_id),
  CHECK (profile_id <> buddy_id)
);

-- ── Activity timeline (hypertable) ────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS events (
  time        TIMESTAMPTZ NOT NULL DEFAULT now(),
  profile_id  TEXT NOT NULL,
  course_slug TEXT NOT NULL,
  kind        TEXT NOT NULL CHECK (kind IN ('study', 'quiz', 'flashcards', 'check_in', 'submit', 'viva')),
  minutes     INT NOT NULL DEFAULT 0 CHECK (minutes BETWEEN 0 AND 600),
  score       REAL CHECK (score BETWEEN 0 AND 100),  -- quiz score, percent
  late_night  BOOLEAN NOT NULL DEFAULT false,         -- logged between 00:00 and 04:00 student-local time
  source      TEXT NOT NULL DEFAULT 'app' CHECK (source IN ('app', 'puck', 'seed')),
  meta        JSONB NOT NULL DEFAULT '{}'::jsonb      -- e.g. {"class_at": "..."} for check-ins
);
SELECT create_hypertable('events', by_range('time', INTERVAL '7 days'), if_not_exists => TRUE);
CREATE INDEX IF NOT EXISTS events_course_time ON events (profile_id, course_slug, time DESC);

-- Compress weeks-old events (Tiger columnstore); recent ones stay row-oriented for fast writes.
ALTER TABLE events SET (timescaledb.compress, timescaledb.compress_segmentby = 'profile_id, course_slug', timescaledb.compress_orderby = 'time DESC');
SELECT add_compression_policy('events', compress_after => INTERVAL '30 days', if_not_exists => TRUE);

-- The earlier scaffold's aggregate had a different shape; replace it.
DROP MATERIALIZED VIEW IF EXISTS weekly_stats CASCADE;

-- Weekly totals per student and course. Real-time (materialized_only = false), so reads
-- include events logged seconds ago; the policy keeps the materialized part fresh.
CREATE MATERIALIZED VIEW IF NOT EXISTS course_weekly
WITH (timescaledb.continuous, timescaledb.materialized_only = false) AS
SELECT
  profile_id,
  course_slug,
  time_bucket(INTERVAL '7 days', time)                                AS week,
  coalesce(sum(minutes) FILTER (WHERE kind IN ('study', 'viva')), 0)  AS study_minutes,
  coalesce(sum(minutes) FILTER (WHERE kind IN ('study', 'viva') AND late_night), 0) AS late_night_minutes,
  count(*) FILTER (WHERE kind = 'study')                               AS sessions,
  count(*) FILTER (WHERE kind = 'quiz')                                AS quizzes,
  avg(score) FILTER (WHERE kind = 'quiz')                              AS avg_quiz_score,
  count(*) FILTER (WHERE kind = 'flashcards')                          AS flashcard_sessions,
  count(*) FILTER (WHERE kind = 'check_in')                            AS check_ins
FROM events
GROUP BY profile_id, course_slug, week
WITH NO DATA;

SELECT add_continuous_aggregate_policy('course_weekly',
  start_offset => INTERVAL '21 days', end_offset => INTERVAL '1 minute',
  schedule_interval => INTERVAL '5 minutes', if_not_exists => TRUE);

-- ── Model inputs ──────────────────────────────────────────────────────────────────────
-- Activity-derived model inputs per student and course, named exactly like the dataset
-- columns. Counts are to-date; the app pace-adjusts them (count × term_weeks / weeks_elapsed)
-- because the model was trained on end-of-semester totals. Rates need no adjustment.

CREATE OR REPLACE VIEW course_features AS
WITH w AS (
  SELECT profile_id, course_slug,
         sum(study_minutes) AS study_minutes, sum(late_night_minutes) AS late_minutes,
         sum(sessions) AS sessions, sum(quizzes) AS quizzes,
         sum(avg_quiz_score * quizzes) / nullif(sum(quizzes) FILTER (WHERE avg_quiz_score IS NOT NULL), 0) AS avg_quiz_score,
         sum(flashcard_sessions) AS flashcard_sessions, sum(check_ins) AS check_ins
  FROM course_weekly GROUP BY profile_id, course_slug
),
meetings AS (
  SELECT profile_id, course_slug, count(*) AS held
  FROM class_meetings WHERE starts_at <= now() GROUP BY profile_id, course_slug
),
work AS (
  SELECT profile_id, course_slug,
         count(*) FILTER (WHERE submitted_at IS NOT NULL AND submitted_at <= due_at) AS on_time,
         count(*) FILTER (WHERE submitted_at IS NOT NULL) AS submitted,
         count(*) FILTER (WHERE submitted_at IS NULL AND due_at < now()) AS missed
  FROM deadlines WHERE kind = 'assignment' AND confirmed GROUP BY profile_id, course_slug
),
prep AS ( -- days between the first study session in the 14 days before each past exam and the exam
  SELECT d.profile_id, d.course_slug,
         avg(coalesce(extract(epoch FROM d.due_at - first.t) / 86400, 0)) AS days_started
  FROM deadlines d
  LEFT JOIN LATERAL (
    SELECT min(e.time) AS t FROM events e
    WHERE e.profile_id = d.profile_id AND e.course_slug = d.course_slug
      AND e.kind IN ('study', 'quiz', 'flashcards', 'viva')
      AND e.time BETWEEN d.due_at - INTERVAL '14 days' AND d.due_at
  ) first ON true
  WHERE d.kind = 'exam' AND d.confirmed AND d.due_at <= now()
  GROUP BY d.profile_id, d.course_slug
)
SELECT
  c.profile_id,
  c.slug                                                             AS course_slug,
  greatest(1, ceil(extract(epoch FROM now() - p.term_start::timestamptz) / 604800))::int AS weeks_elapsed,
  round((coalesce(w.study_minutes, 0) / 60.0
         / greatest(1, ceil(extract(epoch FROM now() - p.term_start::timestamptz) / 604800)))::numeric, 2) AS avg_weekly_study_hours,
  coalesce(w.sessions, 0)                                            AS study_sessions_logged,
  coalesce(w.quizzes, 0)                                             AS practice_quizzes_taken,
  round(w.avg_quiz_score::numeric, 1)                                AS avg_practice_quiz_score,
  coalesce(w.flashcard_sessions, 0)                                  AS flashcard_sessions,
  round((coalesce(w.late_minutes, 0) / nullif(w.study_minutes, 0))::numeric, 3) AS late_night_study_pct,
  coalesce(w.check_ins, 0)                                           AS check_ins,
  m.held                                                             AS classes_held,
  round((w.check_ins::numeric / nullif(m.held, 0)), 3)               AS attendance_rate,
  round((k.on_time::numeric / nullif(k.submitted + k.missed, 0)), 3) AS on_time_submission_rate,
  coalesce(k.missed, 0)                                              AS missed_deadlines,
  round(pr.days_started::numeric, 1)                                 AS avg_days_started_before_exam
FROM courses c
JOIN profiles p ON p.id = c.profile_id
LEFT JOIN w        ON w.profile_id = c.profile_id AND w.course_slug = c.slug
LEFT JOIN meetings m ON m.profile_id = c.profile_id AND m.course_slug = c.slug
LEFT JOIN work k   ON k.profile_id = c.profile_id AND k.course_slug = c.slug
LEFT JOIN prep pr  ON pr.profile_id = c.profile_id AND pr.course_slug = c.slug;

-- Current streak: consecutive local days with any activity, ending today or yesterday.
CREATE OR REPLACE VIEW profile_streaks AS
WITH d AS (
  SELECT DISTINCT profile_id, (time AT TIME ZONE 'America/New_York')::date AS day FROM events
), g AS (
  SELECT profile_id, day, day - (row_number() OVER (PARTITION BY profile_id ORDER BY day))::int AS grp FROM d
), last AS (
  SELECT DISTINCT ON (profile_id) profile_id, day, grp FROM g ORDER BY profile_id, day DESC
)
SELECT g.profile_id, count(*)::int AS streak_days
FROM g JOIN last l ON l.profile_id = g.profile_id AND l.grp = g.grp
WHERE l.day >= (now() AT TIME ZONE 'America/New_York')::date - 1
GROUP BY g.profile_id;

-- Effort a buddy may see: study blocks planned/done this week and active study days. No status.
CREATE OR REPLACE VIEW buddy_effort AS
SELECT
  p.id AS profile_id,
  p.name,
  count(b.id) FILTER (WHERE b.starts_at >= date_trunc('week', now()))                          AS blocks_planned,
  count(b.id) FILTER (WHERE b.starts_at >= date_trunc('week', now()) AND b.done_at IS NOT NULL) AS blocks_done,
  (SELECT count(DISTINCT date_trunc('day', e.time)) FROM events e
    WHERE e.profile_id = p.id AND e.time >= now() - INTERVAL '7 days')                        AS active_days_7d
FROM profiles p
LEFT JOIN study_blocks b ON b.profile_id = p.id
GROUP BY p.id, p.name;

-- ── Study Pots on Solana devnet (docs/solana) ─────────────────────────────────────────
-- Weekly accountability pots staked in PATH, a devnet test token with no value. The chain holds
-- the stakes and payouts; this maps wallets to profiles and keeps a log of every transaction.

-- App-made (custodial) wallets. secret_enc = AES-256-GCM(iv ‖ ciphertext ‖ tag) of the 64-byte key.
CREATE TABLE IF NOT EXISTS wallets (
  profile_id  TEXT PRIMARY KEY REFERENCES profiles(id) ON DELETE CASCADE,
  pubkey      TEXT NOT NULL UNIQUE,
  secret_enc  BYTEA NOT NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS pots (
  address      TEXT PRIMARY KEY,                   -- Pot PDA on devnet
  pot_id       BYTEA NOT NULL UNIQUE,              -- random 16 bytes, no meaning
  creator_id   TEXT NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  stake        INT  NOT NULL CHECK (stake BETWEEN 1 AND 100),
  week_start   DATE NOT NULL,                      -- Monday, America/New_York: the plan's week
  lock_at      TIMESTAMPTZ NOT NULL,               -- stakes lock; the plan freezes
  settle_after TIMESTAMPTZ NOT NULL,
  phase        TEXT NOT NULL DEFAULT 'open' CHECK (phase IN ('open', 'settled', 'cancelled')),
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS pot_members (
  pot        TEXT NOT NULL REFERENCES pots(address) ON DELETE CASCADE,
  profile_id TEXT NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  joined_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  payout     INT,                                  -- PATH received at settlement
  PRIMARY KEY (pot, profile_id)
);

-- 100 PATH per profile per week, claimed lazily.
CREATE TABLE IF NOT EXISTS allowance_grants (
  profile_id TEXT NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  week_start DATE NOT NULL,
  amount     INT  NOT NULL,
  PRIMARY KEY (profile_id, week_start)
);

-- Every devnet transaction Pathway sent, for the activity feed and Explorer links.
CREATE TABLE IF NOT EXISTS chain_txs (
  sig        TEXT PRIMARY KEY,
  at         TIMESTAMPTZ NOT NULL DEFAULT now(),
  kind       TEXT NOT NULL CHECK (kind IN ('allowance', 'create', 'join', 'leave', 'attest', 'settle', 'cancel')),
  pot        TEXT,
  profile_id TEXT REFERENCES profiles(id) ON DELETE CASCADE,
  detail     JSONB NOT NULL DEFAULT '{}'::jsonb
);
CREATE INDEX IF NOT EXISTS chain_txs_pot ON chain_txs (pot, at DESC);

-- Effort per pot member, the numbers Pathway attests on-chain. Planned = blocks in the pot's week
-- created before the lock. Backed = planned blocks marked done with real logged activity for the
-- same course within a day of marking them done (a quiz, flashcards, or 15+ minutes of study/viva).
CREATE OR REPLACE VIEW pot_progress AS
SELECT
  m.pot,
  m.profile_id,
  count(b.id)::int AS planned,
  (count(b.id) FILTER (WHERE b.done_at IS NOT NULL AND EXISTS (
    SELECT 1 FROM events e
    WHERE e.profile_id = b.profile_id AND e.course_slug = b.course_slug
      AND e.time BETWEEN b.done_at - INTERVAL '1 day' AND b.done_at + INTERVAL '1 day'
      AND (e.kind IN ('quiz', 'flashcards') OR (e.kind IN ('study', 'viva') AND e.minutes >= 15))
  )))::int AS backed
FROM pot_members m
JOIN pots p ON p.address = m.pot
LEFT JOIN study_blocks b ON b.profile_id = m.profile_id
  AND b.starts_at >= (p.week_start::timestamp AT TIME ZONE 'America/New_York')
  AND b.starts_at <  ((p.week_start + 7)::timestamp AT TIME ZONE 'America/New_York')
  AND b.created_at < p.lock_at
GROUP BY m.pot, m.profile_id;

-- ── Course material for Viva (pgvector) ───────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS documents (
  id          BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  profile_id  TEXT NOT NULL,
  course_slug TEXT NOT NULL,
  filename    TEXT NOT NULL,
  kind        TEXT NOT NULL DEFAULT 'slides' CHECK (kind IN ('syllabus', 'slides', 'notes', 'other')),
  uploaded_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  FOREIGN KEY (profile_id, course_slug) REFERENCES courses(profile_id, slug) ON DELETE CASCADE
);

-- Extracted text chunks. The file itself is not stored. 768 dims = Gemini text-embedding-004.
CREATE TABLE IF NOT EXISTS doc_chunks (
  id          BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  document_id BIGINT NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
  ord         INT NOT NULL,
  content     TEXT NOT NULL,
  embedding   vector(768),
  UNIQUE (document_id, ord)
);
CREATE INDEX IF NOT EXISTS doc_chunks_embedding ON doc_chunks USING hnsw (embedding vector_cosine_ops);

COMMENT ON TABLE events IS 'Study activity timeline (inputs only). Never store model outputs here.';
COMMENT ON VIEW course_features IS 'Model inputs derived from activity, named like data/data_dictionary.csv columns. Counts are to-date; pace-adjust in the app.';
