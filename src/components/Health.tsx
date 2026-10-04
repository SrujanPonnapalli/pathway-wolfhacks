"use client";

// Health on Home: last night and the week from Google Fit, what they do to the model, and today's calls.
// Numbers only (src/lib/health.ts); the buttons change the week the same way Viva would.
import { Check } from "lucide-react";
import { SectionHeading } from "@/components/ui";
import { healthCalls, healthSignals, SHORT_NIGHT, SLEEP_GOAL, sleepImpact } from "@/lib/health";
import { fmtTime, usePathway } from "@/lib/store";

const pct = (p: number) => Math.round(p * 100);
const dayLetter = (ymd: string) => new Date(`${ymd}T12:00:00`).toLocaleDateString("en-US", { weekday: "narrow" });

export function Health() {
  const { health, now, courses, healthDone: done, applyHealthCall } = usePathway();
  if (!health) return null;
  const sig = healthSignals(health);
  const calls = healthCalls(health, now);
  // The course where sleep sits on the path: flagged ones first, then the nearest exam.
  const impact = [...courses]
    .sort((a, b) => Number(b.result.atRisk) - Number(a.result.atRisk) || a.daysToExam - b.daysToExam)
    .map((c) => ({ c, r: sleepImpact(c.tree, c.x, health) }))
    .find((x) => x.r);
  const synced = fmtTime(health.syncedAt);

  return (
    <section className="panel p-5 md:p-6" aria-labelledby="health">
      <SectionHeading id="health" note={`Google Fit · synced ${synced}`}>
        Health
      </SectionHeading>

      <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3">
        <Tile label="Sleep" value={`${health.sleep.hours}`} unit="h" sub={`${health.sleep.quality} · score ${health.sleep.score}`} warn={health.sleep.hours < SHORT_NIGHT} />
        <Tile label="Readiness" value={`${health.readiness}`} unit="/100" sub={sig.restDay ? "rest day" : "train"} warn={sig.restDay} />
        <Tile label="Resting HR" value={`${health.restingHr}`} unit="bpm" sub={`${health.restingHrNote ?? "resting"} · HRV ${health.hrv} ms`} warn={health.hrv < 30} />
        <Tile label="Steps" value={health.steps.toLocaleString("en-US")} sub={`${health.distanceMi} mi · ${health.calories.toLocaleString("en-US")} cal`} />
        <Tile label="Cardio" value={`${health.cardio.minutes}`} unit={`/ ${health.cardio.goal} min`} sub="this week" warn={sig.cardioPct < 50} />
        <Tile label="Exercise" value={`${health.exerciseDays.done}`} unit={`/ ${health.exerciseDays.goal} days`} sub={`${health.hourlyActivity.done}/${health.hourlyActivity.goal} active hours today`} />
      </div>

      {/* The week's nights against the goal, the number the model reads as an average. */}
      <div className="mt-5 flex flex-col gap-4 sm:flex-row sm:items-start">
        <div className="shrink-0" aria-label={`Sleep, last 7 nights: ${health.nights.map((n) => `${n.hours} h`).join(", ")}`}>
          <div className="relative flex h-16 items-end gap-1.5">
            <span className="absolute inset-x-0 border-t-2 border-dashed border-line" style={{ bottom: `${(SLEEP_GOAL / 9) * 100}%` }} aria-hidden />
            {health.nights.map((n) => (
              <span key={n.date} className="flex w-6 flex-col items-center justify-end self-stretch" title={`${n.date}: ${n.hours} h, bed ${n.bedtime}`}>
                <span className={`w-full rounded-t-md ${n.hours < SHORT_NIGHT ? "bg-flame" : "bg-teal-face"}`} style={{ height: `${Math.min(100, (n.hours / 9) * 100)}%` }} />
              </span>
            ))}
          </div>
          <div className="mt-1 flex gap-1.5">
            {health.nights.map((n) => (
              <span key={n.date} className="w-6 text-center text-[11px] font-extrabold text-muted">{dayLetter(n.date)}</span>
            ))}
          </div>
        </div>
        <p className="min-w-0 flex-1 text-sm leading-relaxed">
          <span className="font-extrabold">Sleep is one of the model&apos;s inputs.</span> Your 7-night average is <b>{sig.avg} h</b> (goal {SLEEP_GOAL}), {sig.lateNights} of 7 nights past midnight, last night to bed at {health.sleep.bedtime}.{" "}
          {impact ? (
            <>
              On your <b>{impact.c.code}</b> path the line sits at {impact.r!.line ?? "the average"} h: right now {pct(impact.r!.now.pRisk)}% of students with your numbers were worth a check-in
              {impact.r!.shortNight.pRisk > impact.r!.now.pRisk ? (
                <>
                  ; one more night like last night takes the average to {impact.r!.projected} h and that becomes <b className="text-flame-ink">{pct(impact.r!.shortNight.pRisk)}%</b>
                </>
              ) : null}
              {impact.r!.goodWeek.pRisk < impact.r!.now.pRisk ? <>; a week near {SLEEP_GOAL} h brings it to {pct(impact.r!.goodWeek.pRisk)}%</> : <>. Holding the line tonight keeps it there</>}.
            </>
          ) : (
            <>Sleep isn&apos;t on any of your paths this week, but the model reads the average all the same.</>
          )}
        </p>
      </div>

      {calls.length > 0 && (
        <ul className="mt-5 space-y-3" aria-label="Today's calls">
          {calls.map((c) => (
            <li key={c.id} className="flex flex-col gap-2 rounded-xl border-2 border-line p-3 sm:flex-row sm:items-center sm:gap-4">
              <div className="min-w-0 flex-1">
                <p className="font-extrabold leading-snug">{c.title}</p>
                <p className="text-sm text-muted">{c.why}</p>
              </div>
              {done[c.id] ? (
                <span className="inline-flex shrink-0 items-center gap-1 text-sm font-extrabold text-teal">
                  <Check size={16} strokeWidth={3} /> On your week
                </span>
              ) : (
                <button onClick={() => applyHealthCall(c.id)} className="btn btn-primary min-h-10 shrink-0 px-4 text-xs">
                  {c.action}
                </button>
              )}
            </li>
          ))}
        </ul>
      )}

      {health.coach && (
        <p className="mt-4 border-t-2 border-line pt-3 text-sm text-muted">
          <span className="font-extrabold text-ink">Fit coach:</span> {health.coach}
        </p>
      )}
    </section>
  );
}

function Tile({ label, value, unit, sub, warn = false }: { label: string; value: string; unit?: string; sub?: string; warn?: boolean }) {
  return (
    <div className={`rounded-xl border-2 px-3 py-2.5 ${warn ? "border-flame/40 bg-flame-soft" : "border-line bg-polar"}`}>
      <p className="text-[11px] font-extrabold uppercase tracking-wider text-muted">{label}</p>
      <p className="mt-0.5 whitespace-nowrap text-2xl font-black leading-none">
        {value}
        {unit && <span className="text-sm font-bold text-muted"> {unit}</span>}
      </p>
      {sub && <p className={`mt-1 text-xs font-bold ${warn ? "text-flame-ink" : "text-muted"}`}>{sub}</p>}
    </div>
  );
}
