// The shared demo calendar, for everyone who opens the app.
//   GET  ?from=ISO&to=ISO        -> { connected, calendarId, events: [...] }
//   POST { op: "insert", ... }   -> { id }
//   POST { op: "move", id, start, end }
//   POST { op: "remove", id }
//   POST { op: "rename", id, title }
import { NextResponse } from "next/server";
import * as g from "@/lib/gcalServer";
import { sessionProfile } from "@/lib/auth";
import { demoProfileId } from "@/lib/demoAccount";

export const dynamic = "force-dynamic";

const TZ = process.env.GOOGLE_CALENDAR_TZ ?? "America/New_York";

export async function GET(req: Request) {
  if (!g.isConfigured()) return NextResponse.json({ connected: false, calendarId: null, events: [] });
  const url = new URL(req.url);
  const from = url.searchParams.get("from");
  const to = url.searchParams.get("to");
  // The shared calendar is the demo account's own, so when that account is signed in it is already
  // connected for it, whatever form GOOGLE_CALENDAR_ID takes ("primary", an alias, other casing).
  const mine = sessionProfile(req) === demoProfileId();
  if (!from || !to) return NextResponse.json({ connected: true, calendarId: g.calendarId(), mine, events: [] });
  try {
    const items = await g.list(from, to);
    const events = items.map((e) => ({ id: e.id, title: e.summary ?? "(no title)", start: e.start!.dateTime!.slice(0, 19), end: e.end!.dateTime!.slice(0, 19), description: e.description ?? "", updated: e.updated ?? "" }));
    return NextResponse.json({ connected: true, calendarId: g.calendarId(), events });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 502 });
  }
}

export async function POST(req: Request) {
  if (!g.isConfigured()) return NextResponse.json({ error: "Shared calendar is not configured." }, { status: 503 });
  const body = await req.json().catch(() => ({}));
  try {
    if (body.op === "insert") {
      const ev = await g.insert({ title: String(body.title ?? ""), start: String(body.start), end: String(body.end), description: String(body.description ?? ""), timeZone: TZ });
      return NextResponse.json({ id: ev.id });
    }
    if (body.op === "move") {
      await g.move(String(body.id), String(body.start), String(body.end), TZ);
      return NextResponse.json({ ok: true });
    }
    if (body.op === "remove") {
      await g.remove(String(body.id));
      return NextResponse.json({ ok: true });
    }
    if (body.op === "rename") {
      await g.rename(String(body.id), String(body.title ?? "").slice(0, 200));
      return NextResponse.json({ ok: true });
    }
    return NextResponse.json({ error: "unknown op" }, { status: 400 });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 502 });
  }
}
