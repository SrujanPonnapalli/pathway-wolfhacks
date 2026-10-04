"use client";

// The week, and what Pathway would change about it. Demo classes always; your Google
// Calendar on top once connected. Approving a suggestion applies it here and in Google.
//
// Layout: a "Due" row holds deadlines and anything outside the grid's hours (late-night due
// markers used to spill below the grid); the time grid holds timed events, overlapping ones side
// by side. Phones get an agenda instead of a 700px grid. Every event is a button: click or
// Enter opens the details sheet, which can move it by date, time and length without dragging.

import { useMemo, useRef, useState, type KeyboardEvent, type PointerEvent as RPointerEvent } from "react";
import { Check, Link2, Trash2, X } from "lucide-react";
import { PageHeader } from "@/components/ui";
import { localIso, mondayOf, type CalEvent } from "@/lib/schedule";
import { downloadIcs } from "@/lib/calendar";
import { fmtTime, usePathway } from "@/lib/store";

const HOURS = { from: 8, to: 22 };
const PX_PER_HOUR = 44;
const DURATIONS = [15, 30, 50, 60, 90, 120, 180];

// One job per color (globals.css): teal = Pathway's own study blocks, sun = exams, ink/line = fixed commitments.
const look: Record<CalEvent["kind"], string> = {
  class: "bg-polar text-ink border-l-[3px] border-ink/30",
  work: "bg-line/70 text-ink border-l-[3px] border-muted/60",
  other: "bg-white text-muted ring-1 ring-inset ring-line border-l-[3px] border-sky/50",
  study: "bg-teal-soft text-teal-lip border-l-[3px] border-teal-face",
  exam: "bg-sun-soft text-sun-ink border-l-[3px] border-sun",
};
const dot: Record<CalEvent["kind"], string> = { class: "bg-ink/40", work: "bg-muted", other: "bg-sky/60", study: "bg-teal-face", exam: "bg-sun" };

const key = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
const hourOf = (iso: string) => new Date(iso).getHours() + new Date(iso).getMinutes() / 60;
/** Deadlines, and anything starting outside the grid's hours, live in the Due row instead of the grid. */
const inDueRow = (e: CalEvent) => e.title.startsWith("Due:") || hourOf(e.start) < HOURS.from || hourOf(e.start) >= HOURS.to;

/** Side-by-side lanes for events that overlap: each gets a lane index and the number of lanes in its cluster. */
function lanes(events: CalEvent[]): Map<string, { lane: number; of: number }> {
  const sorted = [...events].sort((a, b) => a.start.localeCompare(b.start) || a.end.localeCompare(b.end));
  const out = new Map<string, { lane: number; of: number }>();
  let cluster: CalEvent[] = [];
  let clusterEnd = "";
  const laneEnds: string[] = [];
  const flush = () => {
    const n = laneEnds.length || 1;
    for (const e of cluster) out.set(e.id, { ...out.get(e.id)!, of: n });
    cluster = [];
    laneEnds.length = 0;
  };
  for (const e of sorted) {
    if (cluster.length && e.start >= clusterEnd) flush();
    let lane = laneEnds.findIndex((end) => end <= e.start);
    if (lane === -1) lane = laneEnds.push(e.end) - 1;
    else laneEnds[lane] = e.end;
    out.set(e.id, { lane, of: 1 });
    cluster.push(e);
    if (e.end > clusterEnd) clusterEnd = e.end;
  }
  flush();
  return out;
}

export function Calendar() {
  const { now, events, suggestions, approveSuggestion, dismissSuggestion, googleOn, connectGoogle, disconnectGoogle, state, googleWho, googleShared, notices, dismissNotice, moveEvent, removeEvent } = usePathway();
  const [busy, setBusy] = useState<string | null>(null);
  const [err, setErr] = useState("");
  const mon = mondayOf(now);
  const days = useMemo(
    () =>
      Array.from({ length: 7 }, (_, i) => {
        const d = new Date(mon);
        d.setDate(mon.getDate() + i);
        return d;
      }),
    [mon],
  );
  const todayKey = key(now);
  const top = (iso: string) => (hourOf(iso) - HOURS.from) * PX_PER_HOUR;
  const height = (a: string, b: string) => Math.max(18, ((new Date(b).getTime() - new Date(a).getTime()) / 3_600_000) * PX_PER_HOUR - 2);

  // ---- editing: drag an event to a new day/time (15-minute snap); click (or Enter) for details
  const gridRef = useRef<HTMLDivElement>(null);
  const [drag, setDrag] = useState<{ id: string; start: string; end: string; moved: boolean } | null>(null);
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
  const onDown = (e: RPointerEvent, ev: CalEvent) => {
    e.preventDefault();
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
    const grabOffsetMin = ((e.clientY - rect.top) / PX_PER_HOUR) * 60;
    dragging.current = { ev, grabOffsetMin };
    pointer.current = { x: e.clientX, y: e.clientY };
    setDrag({ id: ev.id, start: ev.start, end: ev.end, moved: false });
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
  };
  const onMove = (e: RPointerEvent) => {
    if (!dragging.current || !pointer.current) return;
    const dx = e.clientX - pointer.current.x;
    const dy = e.clientY - pointer.current.y;
    if (!drag?.moved && Math.hypot(dx, dy) < 4) return;
    const slot = slotAt(e.clientX, e.clientY, dragging.current.ev, dragging.current.grabOffsetMin);
    if (slot) setDrag({ id: dragging.current.ev.id, ...slot, moved: true });
  };
  const onUp = async () => {
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
  };
  const onKey = (e: KeyboardEvent, ev: CalEvent) => {
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      setOpen(ev);
    }
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

  const byDay = useMemo(() => {
    const m = new Map<string, CalEvent[]>();
    for (const d of days) m.set(key(d), []);
    for (const e of events.map(shown)) m.get(e.start.slice(0, 10))?.push(e);
    for (const list of m.values()) list.sort((a, b) => a.start.localeCompare(b.start));
    return m;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [events, days, drag]);

  return (
    <main className="mx-auto max-w-[1100px] px-4 py-6 md:px-10 md:py-10">
      <PageHeader title="This week" lead="Classes and due dates from Moodle, your study blocks from Pathway, all on one calendar.">
        {googleOn ? (
          <p className="flex items-center gap-2 text-sm font-bold text-muted">
            <Check size={15} strokeWidth={3} className="text-teal" aria-hidden /> {googleShared ? "Google Calendar synced" : (googleWho?.email ?? "Google Calendar")}
            {!googleShared && (
              <button onClick={disconnectGoogle} className="underline underline-offset-4 hover:text-ink">
                disconnect
              </button>
            )}
          </p>
        ) : (
          <div className="flex items-center gap-3">
            <button onClick={connect} disabled={busy === "google"} className="btn btn-primary min-h-10 px-4 text-xs">
              <Link2 size={15} aria-hidden /> {busy === "google" ? "Connecting…" : "Connect Google Calendar"}
            </button>
            {state.blocks.length > 0 && (
              <button onClick={() => downloadIcs(state.blocks)} className="text-sm font-bold text-teal underline underline-offset-4">
                .ics
              </button>
            )}
          </div>
        )}
      </PageHeader>
      {err && (
        <p role="alert" className="-mt-4 mb-6 text-sm font-bold text-sun-ink">
          {err}
        </p>
      )}

      {notices.length > 0 && (
        <ul className="mb-6 space-y-2" aria-live="polite">
          {notices.map((n) => (
            <li key={n.id} className="flex items-start gap-3 rounded-2xl border-2 border-sky/30 bg-sky-soft px-4 py-3 text-sm font-bold">
              <span className="min-w-0 flex-1">{n.text}</span>
              <button onClick={() => dismissNotice(n.id)} aria-label="Dismiss" className="text-muted hover:text-ink">
                <X size={16} />
              </button>
            </li>
          ))}
        </ul>
      )}
      {suggestions.length > 0 && (
        <section aria-labelledby="sugg" className="panel mb-6 border-sky/30 p-4">
          <h2 id="sugg" className="flex items-baseline justify-between gap-3 font-extrabold">
            Viva noticed <span className="text-xs font-bold text-muted">Nothing changes until you approve it</span>
          </h2>
          <ul className="mt-1 divide-y divide-line/70">
            {suggestions.map((sg) => (
              <li key={sg.id} className="flex flex-col gap-1.5 py-2 sm:flex-row sm:items-center sm:gap-4">
                <div className="min-w-0 flex-1 text-sm">
                  <span className="font-bold leading-snug">{sg.title}</span> <span className="text-muted">· {sg.why}</span>
                </div>
                <div className="flex shrink-0 gap-2">
                  <button
                    onClick={async () => {
                      setBusy(sg.id);
                      await approveSuggestion(sg);
                      setBusy(null);
                    }}
                    disabled={busy === sg.id}
                    className="btn btn-primary min-h-9 px-3 text-xs"
                  >
                    {busy === sg.id ? "Applying…" : "Approve"}
                  </button>
                  <button onClick={() => dismissSuggestion(sg.id)} className="btn btn-ghost min-h-9 px-3 text-xs" aria-label={`Not now: ${sg.title}`}>
                    <X size={14} aria-hidden /> Not now
                  </button>
                </div>
              </li>
            ))}
          </ul>
        </section>
      )}

      {/* Desktop: the grid */}
      <section aria-label="Week grid" className="panel hidden overflow-hidden md:block">
        <div ref={gridRef} className="grid select-none grid-cols-[48px_repeat(7,1fr)]" onPointerMove={onMove}>
          <div className="border-b-2 border-line bg-polar/60" />
          {days.map((d) => (
            <div key={key(d)} className={`border-b-2 border-l border-line bg-polar/60 py-2 text-center ${key(d) === todayKey ? "bg-teal-soft/40" : ""}`}>
              <span className="block text-[11px] font-extrabold uppercase tracking-wider text-muted">{d.toLocaleDateString("en-US", { weekday: "short" })}</span>
              <span className={`mx-auto mt-0.5 grid size-7 place-items-center rounded-full text-sm font-black tabular-nums ${key(d) === todayKey ? "bg-ink text-white" : "text-ink"}`}>{d.getDate()}</span>
            </div>
          ))}

          {/* Due row: deadlines and anything outside the grid's hours */}
          <div className="border-b-2 border-line px-1 py-1.5 text-right text-[10px] font-extrabold uppercase tracking-wider text-muted">Due</div>
          {days.map((d) => {
            const k = key(d);
            const due = (byDay.get(k) ?? []).filter(inDueRow);
            return (
              <div key={`due-${k}`} className={`min-h-9 space-y-1 border-b-2 border-l border-line p-1 ${k === todayKey ? "bg-teal-soft/15" : ""}`}>
                {due.map((e) => (
                  <button
                    key={e.id}
                    type="button"
                    onClick={() => setOpen(e)}
                    title={`${e.title} · ${fmtTime(e.start)}`}
                    className={`block w-full truncate rounded-md px-1.5 py-0.5 text-left text-[11px] font-bold leading-tight ${e.kind === "exam" ? "bg-sun-soft text-sun-ink" : "bg-white text-ink ring-1 ring-inset ring-line hover:ring-sky"}`}
                  >
                    {e.title.replace(/^Due:\s*/, "")} <span className="font-semibold text-muted">{fmtTime(e.start)}</span>
                  </button>
                ))}
              </div>
            );
          })}

          {/* Hour gutter */}
          <div className="relative" style={{ height: (HOURS.to - HOURS.from) * PX_PER_HOUR }}>
            {Array.from({ length: HOURS.to - HOURS.from }, (_, i) => (
              <span key={i} className="absolute right-2 -translate-y-1/2 text-[11px] font-bold tabular-nums text-muted" style={{ top: i * PX_PER_HOUR }}>
                {i === 0 ? "" : `${((HOURS.from + i + 11) % 12) + 1}${HOURS.from + i < 12 ? "a" : "p"}`}
              </span>
            ))}
          </div>
          {days.map((d) => {
            const k = key(d);
            const es = (byDay.get(k) ?? []).filter((e) => !inDueRow(e));
            const lane = lanes(es);
            return (
              <div key={k} className={`relative border-l border-line ${k === todayKey ? "bg-teal-soft/15" : ""}`} style={{ height: (HOURS.to - HOURS.from) * PX_PER_HOUR }}>
                {Array.from({ length: HOURS.to - HOURS.from }, (_, i) => (
                  <span key={i} className="absolute inset-x-0 border-t border-line/70" style={{ top: i * PX_PER_HOUR }} aria-hidden />
                ))}
                {es.map((e) => {
                  const l = lane.get(e.id) ?? { lane: 0, of: 1 };
                  const h = height(e.start, e.end);
                  return (
                    <button
                      key={e.id}
                      type="button"
                      onPointerDown={(pe) => onDown(pe, e)}
                      onPointerUp={onUp}
                      onKeyDown={(ke) => onKey(ke, e)}
                      className={`absolute cursor-grab touch-none overflow-hidden rounded-lg px-1.5 py-0.5 text-left text-[11px] font-bold leading-tight active:cursor-grabbing ${look[e.kind]} ${drag?.id === e.id && drag.moved ? "z-10 shadow-[0_6px_16px_rgb(0_0_0/0.18)] ring-2 ring-sky" : ""}`}
                      style={{ top: top(e.start), height: h, left: `calc(${(l.lane / l.of) * 100}% + 2px)`, width: `calc(${100 / l.of}% - 4px)` }}
                      title={`${e.title} · ${fmtTime(e.start)}–${fmtTime(e.end)}`}
                    >
                      <span className="block truncate">{e.title}</span>
                      {h >= 34 && <span className="block truncate font-semibold opacity-80">{fmtTime(e.start)}</span>}
                    </button>
                  );
                })}
              </div>
            );
          })}
        </div>
      </section>

      {/* Phones: an agenda */}
      <section aria-label="Week agenda" className="space-y-3 md:hidden">
        {days.map((d) => {
          const k = key(d);
          const es = byDay.get(k) ?? [];
          return (
            <div key={k} className={`panel p-3 ${k === todayKey ? "border-teal/40" : ""}`}>
              <p className="flex items-baseline gap-2 font-black">
                {d.toLocaleDateString("en-US", { weekday: "long" })} <span className="text-sm font-bold text-muted">{d.toLocaleDateString("en-US", { month: "short", day: "numeric" })}</span>
                {k === todayKey && <span className="rounded-md bg-ink px-1.5 py-0.5 text-[10px] font-black uppercase text-white">today</span>}
              </p>
              {es.length ? (
                <ul className="mt-2 divide-y divide-line/70">
                  {es.map((e) => (
                    <li key={e.id}>
                      <button type="button" onClick={() => setOpen(e)} className="flex w-full items-center gap-3 py-2 text-left text-sm">
                        <span className={`h-2.5 w-2.5 shrink-0 rounded-full ${dot[e.kind]}`} aria-hidden />
                        <span className="w-16 shrink-0 tabular-nums text-muted">{fmtTime(e.start)}</span>
                        <span className="min-w-0 flex-1 truncate font-bold">{e.title}</span>
                      </button>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="mt-1 text-sm text-muted">Nothing scheduled.</p>
              )}
            </div>
          );
        })}
      </section>

      {open && <Details ev={open} onClose={() => setOpen(null)} onMove={moveEvent} onRemove={removeEvent} googleOn={googleOn} />}

      <p className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-xs font-bold text-muted">
        {(["class", "work", "study", "exam", "other"] as const).map((k) => (
          <span key={k}>
            <span className={`mr-1 inline-block size-2.5 rounded-sm align-middle ${dot[k]}`} /> {k === "other" ? "due / other" : k}
          </span>
        ))}
        <span>· drag to move, click or Enter for details</span>
        {googleOn && <span>· synced with Google Calendar</span>}
      </p>
    </main>
  );
}

// The details sheet: what it is, and move it by date, time and length (no drag needed), or delete it.
function Details({ ev, onClose, onMove, onRemove, googleOn }: { ev: CalEvent; onClose: () => void; onMove: (id: string, start: string, end: string) => Promise<void>; onRemove: (id: string) => Promise<void>; googleOn: boolean }) {
  const start = new Date(ev.start);
  const minutes0 = Math.max(15, Math.round((new Date(ev.end).getTime() - start.getTime()) / 60_000));
  const [date, setDate] = useState(key(start));
  const [time, setTime] = useState(`${String(start.getHours()).padStart(2, "0")}:${String(start.getMinutes()).padStart(2, "0")}`);
  const [minutes, setMinutes] = useState(minutes0);
  const [busy, setBusy] = useState(false);
  const changed = date !== key(start) || time !== `${String(start.getHours()).padStart(2, "0")}:${String(start.getMinutes()).padStart(2, "0")}` || minutes !== minutes0;
  const fixed = ev.kind === "class" || ev.kind === "exam";
  const save = async () => {
    const s = new Date(`${date}T${time}:00`);
    if (isNaN(s.getTime())) return;
    setBusy(true);
    await onMove(ev.id, localIso(s), localIso(new Date(s.getTime() + minutes * 60_000)));
    setBusy(false);
    onClose();
  };
  return (
    <div role="dialog" aria-label={ev.title} className="fixed inset-x-4 bottom-24 z-30 mx-auto max-w-md rounded-2xl border-2 border-line bg-white p-4 shadow-[0_12px_32px_rgb(0_0_0/0.18)] md:bottom-8">
      <div className="flex items-start gap-3">
        <span className={`mt-1.5 h-3 w-3 shrink-0 rounded-full ${dot[ev.kind]}`} aria-hidden />
        <div className="min-w-0 flex-1">
          <p className="font-extrabold leading-snug">{ev.title}</p>
          <p className="mt-0.5 text-sm text-muted">
            {start.toLocaleDateString("en-US", { weekday: "long", month: "short", day: "numeric" })} · {fmtTime(ev.start)} to {fmtTime(ev.end)}
            {ev.source === "google" ? " · from Google Calendar" : ev.source === "pathway" ? " · planned in Pathway" : ""}
          </p>
        </div>
        <button onClick={onClose} aria-label="Close" className="text-muted hover:text-ink">
          <X size={18} />
        </button>
      </div>
      {fixed ? (
        <p className="mt-3 text-xs text-muted">Classes and exams come from Moodle; move your own blocks around them.</p>
      ) : (
        <div className="mt-3 grid grid-cols-[1fr_auto_auto] gap-2 text-sm">
          <label className="min-w-0">
            <span className="block text-xs font-extrabold uppercase tracking-wider text-muted">Day</span>
            <input type="date" value={date} onChange={(e) => setDate(e.target.value)} className="mt-1 w-full rounded-lg border-2 border-line bg-white px-2 py-1 font-bold" />
          </label>
          <label>
            <span className="block text-xs font-extrabold uppercase tracking-wider text-muted">Start</span>
            <input type="time" step={900} value={time} onChange={(e) => setTime(e.target.value)} className="mt-1 rounded-lg border-2 border-line bg-white px-2 py-1 font-bold" />
          </label>
          <label>
            <span className="block text-xs font-extrabold uppercase tracking-wider text-muted">Length</span>
            <select value={minutes} onChange={(e) => setMinutes(+e.target.value)} className="mt-1 rounded-lg border-2 border-line bg-white px-2 py-1 font-bold">
              {[...new Set([...DURATIONS, minutes0])].sort((a, b) => a - b).map((m) => (
                <option key={m} value={m}>
                  {m >= 60 ? `${m / 60} h` : `${m} min`}
                </option>
              ))}
            </select>
          </label>
        </div>
      )}
      <div className="mt-3 flex flex-wrap gap-2">
        {!fixed && (
          <button onClick={save} disabled={!changed || busy} className="btn btn-primary min-h-10 px-4 text-xs">
            {busy ? "Saving…" : "Save"}
          </button>
        )}
        <button
          onClick={async () => {
            setBusy(true);
            await onRemove(ev.id);
            setBusy(false);
            onClose();
          }}
          disabled={busy}
          className="btn btn-ghost min-h-10 px-4 text-xs text-sun-ink"
        >
          <Trash2 size={14} aria-hidden /> Delete
        </button>
      </div>
      <p className="mt-2 text-xs text-muted">{googleOn ? "Changes go to Google Calendar too." : "Drag on the grid works too."}</p>
    </div>
  );
}
