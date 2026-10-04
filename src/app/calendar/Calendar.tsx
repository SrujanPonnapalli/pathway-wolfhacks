"use client";

// The week, and what Pathway would change about it. Demo classes always; your Google
// Calendar on top once connected. Approving a suggestion applies it here and in Google.

import { useRef, useState } from "react";
import { Check, Link2, X } from "lucide-react";
import { PageHeader } from "@/components/ui";
import { localIso, mondayOf, type CalEvent } from "@/lib/schedule";
import { downloadIcs } from "@/lib/calendar";
import { fmtTime, usePathway } from "@/lib/store";

const HOURS = { from: 8, to: 22 };
const PX_PER_HOUR = 44;

const look: Record<CalEvent["kind"], string> = {
  class: "bg-polar text-ink",
  work: "bg-line/70 text-ink",
  other: "bg-white border-2 border-line text-muted",
  study: "bg-teal-soft text-teal-lip",
  exam: "bg-sun-soft text-sun-ink",
};

export function Calendar() {
  const { now, events, suggestions, approveSuggestion, dismissSuggestion, googleOn, connectGoogle, disconnectGoogle, state, googleWho, googleShared, notices, dismissNotice, moveEvent, removeEvent } = usePathway();
  const [busy, setBusy] = useState<string | null>(null);
  const [err, setErr] = useState("");
  const mon = mondayOf(now);
  const days = Array.from({ length: 7 }, (_, i) => {
    const d = new Date(mon);
    d.setDate(mon.getDate() + i);
    return d;
  });
  const key = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  const todayKey = key(now);
  const top = (iso: string) => {
    const d = new Date(iso);
    return (d.getHours() + d.getMinutes() / 60 - HOURS.from) * PX_PER_HOUR;
  };
  const height = (a: string, b: string) => Math.max(18, ((new Date(b).getTime() - new Date(a).getTime()) / 3_600_000) * PX_PER_HOUR - 2);

  // ---- editing: drag an event to a new day/time (15-minute snap); click for details and delete
  const gridRef = useRef<HTMLDivElement>(null);
  const [drag, setDrag] = useState<{ id: string; start: string; end: string; moved: boolean; dx: number; dy: number } | null>(null);
  const [open, setOpen] = useState<CalEvent | null>(null);
  const pointer = useRef<{ x: number; y: number } | null>(null);
  const dragging = useRef<{ ev: CalEvent; grabOffsetMin: number } | null>(null);

  const slotAt = (clientX: number, clientY: number, ev: CalEvent, grabOffsetMin: number) => {
    const el = gridRef.current;
    if (!el) return null;
    const r = el.getBoundingClientRect();
    const colW = (r.width - 48) / 7;
    const dayIdx = Math.min(6, Math.max(0, Math.floor((clientX - r.left - 48) / colW)));
    const minutesFromTop = ((clientY - r.top) / PX_PER_HOUR) * 60 - grabOffsetMin;
    const snapped = Math.round(minutesFromTop / 15) * 15;
    const dur = (new Date(ev.end).getTime() - new Date(ev.start).getTime()) / 60_000;
    const startMin = Math.min((HOURS.to - HOURS.from) * 60 - dur, Math.max(0, snapped));
    const d = new Date(days[dayIdx]);
    d.setHours(HOURS.from, startMin, 0, 0);
    const e = new Date(d.getTime() + dur * 60_000);
    return { start: localIso(d), end: localIso(e) };
  };
  const onDown = (e: React.PointerEvent, ev: CalEvent) => {
    e.preventDefault();
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
    const grabOffsetMin = ((e.clientY - rect.top) / PX_PER_HOUR) * 60;
    dragging.current = { ev, grabOffsetMin };
    pointer.current = { x: e.clientX, y: e.clientY };
    setDrag({ id: ev.id, start: ev.start, end: ev.end, moved: false, dx: 0, dy: 0 });
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
  };
  const onMove = (e: React.PointerEvent) => {
    if (!dragging.current || !pointer.current) return;
    const dx = e.clientX - pointer.current.x;
    const dy = e.clientY - pointer.current.y;
    if (!drag?.moved && Math.hypot(dx, dy) < 4) return;
    const slot = slotAt(e.clientX, e.clientY, dragging.current.ev, dragging.current.grabOffsetMin);
    if (slot) setDrag({ id: dragging.current.ev.id, ...slot, moved: true, dx, dy });
  };
  const onUp = async (e: React.PointerEvent) => {
    const d = dragging.current;
    const cur = drag;
    dragging.current = null;
    pointer.current = null;
    setDrag(null);
    if (!d) return;
    if (!cur?.moved) {
      setOpen(d.ev);
      return;
    }
    if (cur.start !== d.ev.start) await moveEvent(d.ev.id, cur.start, cur.end);
    void e;
  };
  const shown = (ev: CalEvent) => (drag && drag.id === ev.id && drag.moved ? { ...ev, start: drag.start, end: drag.end } : ev);

  const connect = async () => {
    setErr("");
    setBusy("google");
    try {
      await connectGoogle();
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setBusy(null);
    }
  };

  return (
    <main className="mx-auto max-w-[980px] px-4 py-6 md:px-10 md:py-10">
      <PageHeader title="This week" lead="Classes and due dates from Moodle, your study blocks from Pathway, all on your calendar.">
        {googleOn ? (
          <p className="flex items-center gap-2 text-sm font-bold text-muted">
            <Check size={15} strokeWidth={3} className="text-teal" aria-hidden /> {googleShared ? "Google Calendar synced" : googleWho?.email ?? "Google Calendar"}
            {!googleShared && <button onClick={disconnectGoogle} className="underline underline-offset-4 hover:text-ink">disconnect</button>}
          </p>
        ) : (
          <div className="flex items-center gap-3">
            <button onClick={connect} disabled={busy === "google"} className="btn btn-primary min-h-10 px-4 text-xs"><Link2 size={15} aria-hidden /> {busy === "google" ? "Connecting…" : "Connect Google Calendar"}</button>
            {state.blocks.length > 0 && <button onClick={() => downloadIcs(state.blocks)} className="text-sm font-bold text-teal underline underline-offset-4">.ics</button>}
          </div>
        )}
      </PageHeader>
      {err && <p role="alert" className="-mt-4 mb-6 text-sm font-bold text-sun-ink">{err}</p>}

      {notices.length > 0 && (
        <ul className="mb-6 space-y-2" aria-live="polite">
          {notices.map((n) => (
            <li key={n.id} className="flex items-start gap-3 rounded-2xl border-2 border-sky/30 bg-sky-soft px-4 py-3 text-sm font-bold">
              <span className="min-w-0 flex-1">{n.text}</span>
              <button onClick={() => dismissNotice(n.id)} aria-label="Dismiss" className="text-muted hover:text-ink"><X size={16} /></button>
            </li>
          ))}
        </ul>
      )}
      {suggestions.length > 0 && (
        <section aria-labelledby="sugg" className="panel mb-8 border-sky/30 p-5">
          <h2 id="sugg" className="font-extrabold">Viva noticed</h2>
          <ul className="mt-2 divide-y-2 divide-line">
            {suggestions.map((sg) => (
              <li key={sg.id} className="flex flex-col gap-2 py-3 sm:flex-row sm:items-center sm:gap-4">
                <div className="min-w-0 flex-1">
                  <p className="font-bold leading-snug">{sg.title}</p>
                  <p className="text-sm text-muted">{sg.why}</p>
                </div>
                <div className="flex shrink-0 gap-2">
                  <button onClick={async () => { setBusy(sg.id); await approveSuggestion(sg); setBusy(null); }} disabled={busy === sg.id} className="btn btn-primary min-h-10 px-4 text-xs">{busy === sg.id ? "Applying…" : "Approve"}</button>
                  <button onClick={() => dismissSuggestion(sg.id)} className="btn btn-ghost min-h-10 px-3 text-xs" aria-label={`Not now: ${sg.title}`}><X size={15} aria-hidden /> Not now</button>
                </div>
              </li>
            ))}
          </ul>
          <p className="mt-2 text-xs text-muted">Nothing changes until you approve it.</p>
        </section>
      )}

      <div className="overflow-x-auto">
        <div ref={gridRef} className="grid min-w-[700px] select-none grid-cols-[48px_repeat(7,1fr)]" onPointerMove={onMove}>
          <div />
          {days.map((d) => (
            <div key={key(d)} className="pb-2 text-center">
              <span className="block text-xs font-bold text-muted">{d.toLocaleDateString("en-US", { weekday: "short" })}</span>
              <span className={`mx-auto grid size-7 place-items-center rounded-full text-sm font-extrabold tabular-nums ${key(d) === todayKey ? "bg-ink text-white" : ""}`}>{d.getDate()}</span>
            </div>
          ))}
          <div className="relative" style={{ height: (HOURS.to - HOURS.from) * PX_PER_HOUR }}>
            {Array.from({ length: HOURS.to - HOURS.from }, (_, i) => (
              <span key={i} className="absolute right-2 -translate-y-1/2 text-[11px] font-bold tabular-nums text-muted" style={{ top: i * PX_PER_HOUR }}>{((HOURS.from + i + 11) % 12) + 1}{HOURS.from + i < 12 ? "a" : "p"}</span>
            ))}
          </div>
          {days.map((d) => {
            const k = key(d);
            const es = events.map(shown).filter((e) => e.start.slice(0, 10) === k);
            return (
              <div key={k} className={`relative border-l-2 border-line ${k === todayKey ? "bg-polar/40" : ""}`} style={{ height: (HOURS.to - HOURS.from) * PX_PER_HOUR }}>
                {Array.from({ length: HOURS.to - HOURS.from }, (_, i) => (
                  <span key={i} className="absolute inset-x-0 border-t border-line/70" style={{ top: i * PX_PER_HOUR }} aria-hidden />
                ))}
                {es.map((e) => (
                  <div
                    key={e.id}
                    onPointerDown={(pe) => onDown(pe, e)}
                    onPointerUp={onUp}
                    className={`absolute inset-x-1 cursor-grab touch-none overflow-hidden rounded-lg px-1.5 py-0.5 text-[11px] font-bold leading-tight active:cursor-grabbing ${look[e.kind]} ${drag?.id === e.id && drag.moved ? "z-10 shadow-[0_6px_16px_rgb(0_0_0/0.18)] ring-2 ring-sky" : ""}`}
                    style={{ top: top(e.start), height: height(e.start, e.end) }}
                    title={`${e.title} · ${fmtTime(e.start)}–${fmtTime(e.end)}`}
                  >
                    <span className="block truncate">{e.title}</span>
                    <span className="block truncate font-semibold opacity-80">{fmtTime(e.start)}</span>
                  </div>
                ))}
              </div>
            );
          })}
        </div>
      </div>
      {open && (
        <div role="dialog" aria-label={open.title} className="fixed inset-x-4 bottom-24 z-30 mx-auto max-w-md rounded-2xl border-2 border-line bg-white p-4 shadow-[0_12px_32px_rgb(0_0_0/0.18)] md:bottom-8">
          <p className="font-extrabold leading-snug">{open.title}</p>
          <p className="mt-0.5 text-sm text-muted">{new Date(open.start).toLocaleDateString("en-US", { weekday: "long", month: "short", day: "numeric" })} · {fmtTime(open.start)} to {fmtTime(open.end)}{open.source === "google" ? " · from Google Calendar" : ""}</p>
          <p className="mt-2 text-xs text-muted">Drag it on the grid to move it. Changes go to Google Calendar too.</p>
          <div className="mt-3 flex gap-2">
            <button onClick={async () => { const id = open.id; setOpen(null); await removeEvent(id); }} className="btn btn-ghost min-h-10 px-4 text-xs text-sun-ink">Delete</button>
            <button onClick={() => setOpen(null)} className="btn btn-ghost min-h-10 px-4 text-xs">Close</button>
          </div>
        </div>
      )}
      <p className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-xs font-bold text-muted">
        <span><span className="mr-1 inline-block size-2.5 rounded-sm bg-polar align-middle ring-1 ring-line" /> class</span>
        <span><span className="mr-1 inline-block size-2.5 rounded-sm bg-line align-middle" /> work</span>
        <span><span className="mr-1 inline-block size-2.5 rounded-sm bg-teal-soft align-middle" /> study</span>
        <span><span className="mr-1 inline-block size-2.5 rounded-sm bg-sun-soft align-middle" /> exam</span>
        <span>· drag to move, click for details</span>
        {googleOn && <span>· synced with Google Calendar</span>}
      </p>
    </main>
  );
}
