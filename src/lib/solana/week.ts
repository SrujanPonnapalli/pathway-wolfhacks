// Pot weeks run Monday 00:00 to Monday 00:00, America/New_York, like the app's week view.
import { easternToUtc } from "../time.ts";

const DAY = 86_400_000;

/** The Monday (YYYY-MM-DD, Eastern) of the week containing `at`. */
export function mondayOf(at: Date): string {
  const [y, m, d] = new Intl.DateTimeFormat("en-CA", { timeZone: "America/New_York" }).format(at).split("-").map(Number);
  const local = new Date(Date.UTC(y, m - 1, d));
  local.setUTCDate(d - ((local.getUTCDay() + 6) % 7));
  return local.toISOString().slice(0, 10);
}

const addDays = (date: string, n: number) => new Date(Date.parse(`${date}T00:00Z`) + n * DAY).toISOString().slice(0, 10);

/** Exact start (lock) and end (settle) instants of the week that starts on `monday`. */
export function weekBounds(monday: string) {
  return { lockAt: new Date(easternToUtc(`${monday}T00:00`)), settleAfter: new Date(easternToUtc(`${addDays(monday, 7)}T00:00`)) };
}

/** New pots are for the next week that hasn't locked yet. */
export function upcomingWeek(now = new Date()) {
  const monday = addDays(mondayOf(now), 7);
  return { weekStart: monday, ...weekBounds(monday) };
}
