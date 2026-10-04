// One clock, two forms.
//
// Inside the app every time is a local wall-clock ISO string without a zone ("2026-10-06T09:35:00"):
// the week grid, Google Calendar (sent with a timeZone) and Viva all read that form, and it sorts
// and compares as plain text. The database stores exact UTC instants. `toLocal` is the door in
// (anything the server or a model hands us becomes the local form) and `toUtc` the door out.

const ZONE = "America/New_York";

/** Local wall-clock ISO without a zone, the one form the app keeps. */
export function localIso(d: Date) {
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}:00`;
}

/** Any ISO string (UTC "Z", an offset, or a bare local time) as the app's local form. Date-only strings pass through. */
export function toLocal(s: string) {
  if (!s) return s;
  if (/(Z|[+-]\d\d:?\d\d)$/i.test(s)) {
    const d = new Date(s);
    return isNaN(d.getTime()) ? s : localIso(d);
  }
  if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(s)) return `${s}:00`;
  if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d+$/.test(s)) return s.slice(0, 19);
  return s;
}

/** A local-form string (as this device reads it) as the exact UTC instant the database keeps. */
export function toUtc(s: string) {
  const d = new Date(s);
  return isNaN(d.getTime()) ? s : d.toISOString();
}

// Demo times in mock.ts are written as NC State wall-clock time without a zone
// ("2026-10-06T09:35"). Convert them to an exact UTC ISO string before they reach the database.
export function easternToUtc(local: string) {
  const asUtc = new Date(`${local}Z`);
  const offset = new Intl.DateTimeFormat("en-US", { timeZone: ZONE, timeZoneName: "shortOffset" })
    .formatToParts(asUtc)
    .find((p) => p.type === "timeZoneName")!.value; // e.g. "GMT-4"
  const hours = Number(offset.replace("GMT", "") || 0);
  return new Date(asUtc.getTime() - hours * 3_600_000).toISOString();
}
