-- Tiger Cloud (Postgres + TimescaleDB)
CREATE TABLE IF NOT EXISTS events (
  time        TIMESTAMPTZ NOT NULL DEFAULT now(),
  profile_id  TEXT        NOT NULL,
  kind        TEXT        NOT NULL,      -- 'study' | 'submit' | ...
  minutes     INT         NOT NULL DEFAULT 0,
  on_time     BOOLEAN
);
SELECT create_hypertable('events', by_range('time'), if_not_exists => TRUE);

CREATE MATERIALIZED VIEW IF NOT EXISTS weekly_stats
WITH (timescaledb.continuous) AS
SELECT
  profile_id,
  time_bucket('7 days', time) AS week,
  sum(minutes) FILTER (WHERE kind = 'study') / 60.0 AS weekly_hours,
  avg(CASE WHEN extract(hour FROM time) >= 23 OR extract(hour FROM time) < 4 THEN 1 ELSE 0 END)
    FILTER (WHERE kind = 'study') AS late_night_pct,
  avg(on_time::int) FILTER (WHERE kind = 'submit') AS on_time_rate
FROM events
GROUP BY profile_id, week;

SELECT add_continuous_aggregate_policy('weekly_stats',
  start_offset => INTERVAL '8 weeks', end_offset => INTERVAL '1 hour',
  schedule_interval => INTERVAL '15 minutes', if_not_exists => TRUE);
