// Calendar out. Two paths that need no OAuth and work in a demo:
//   googleCalendarUrl(block)  -> opens Google Calendar with the event prefilled (one click to save)
//   downloadIcs(blocks)       -> an .ics file for Apple/Outlook/Google import
// A connected-Google-account path can replace both later without touching callers.

import type { Block } from "./store";

const pad = (n: number) => String(n).padStart(2, "0");
const stamp = (d: Date) => `${d.getUTCFullYear()}${pad(d.getUTCMonth() + 1)}${pad(d.getUTCDate())}T${pad(d.getUTCHours())}${pad(d.getUTCMinutes())}00Z`;

export const BLOCK_MINUTES = 50;

export function googleCalendarUrl(b: Pick<Block, "title" | "at">, minutes = BLOCK_MINUTES, details = "Planned in Pathway") {
  const start = new Date(b.at);
  const end = new Date(start.getTime() + minutes * 60_000);
  const q = new URLSearchParams({
    action: "TEMPLATE",
    text: b.title,
    dates: `${stamp(start)}/${stamp(end)}`,
    details,
  });
  return `https://calendar.google.com/calendar/render?${q.toString()}`;
}

export function icsFor(blocks: Pick<Block, "id" | "title" | "at" | "course">[], minutes = BLOCK_MINUTES) {
  const now = stamp(new Date());
  const esc = (s: string) => s.replace(/[\\;,]/g, (m) => `\\${m}`).replace(/\n/g, "\\n");
  const events = blocks.map((b) => {
    const start = new Date(b.at);
    const end = new Date(start.getTime() + minutes * 60_000);
    return [
      "BEGIN:VEVENT",
      `UID:pathway-${b.id}@pathway.app`,
      `DTSTAMP:${now}`,
      `DTSTART:${stamp(start)}`,
      `DTEND:${stamp(end)}`,
      `SUMMARY:${esc(b.title)}`,
      `DESCRIPTION:${esc(`Planned in Pathway for ${b.course}`)}`,
      "END:VEVENT",
    ].join("\r\n");
  });
  return ["BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//Pathway//EN", "CALSCALE:GREGORIAN", ...events, "END:VCALENDAR"].join("\r\n") + "\r\n";
}

export function downloadIcs(blocks: Pick<Block, "id" | "title" | "at" | "course">[], filename = "pathway-plan.ics") {
  const blob = new Blob([icsFor(blocks)], { type: "text/calendar;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
