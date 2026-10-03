// Demo times in mock.ts are written as NC State wall-clock time without a zone
// ("2026-10-06T09:35"). Convert them to an exact UTC ISO string before they reach the database.
const ZONE = "America/New_York";

export function easternToUtc(local: string) {
  const asUtc = new Date(`${local}Z`);
  const offset = new Intl.DateTimeFormat("en-US", { timeZone: ZONE, timeZoneName: "shortOffset" })
    .formatToParts(asUtc)
    .find((p) => p.type === "timeZoneName")!.value; // e.g. "GMT-4"
  const hours = Number(offset.replace("GMT", "") || 0);
  return new Date(asUtc.getTime() - hours * 3_600_000).toISOString();
}
