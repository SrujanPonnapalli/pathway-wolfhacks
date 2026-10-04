"use client";

// Add study buddies by email, answer requests, and manage the list. Google accounts only; the sample
// students in demo mode come with buddies already. Buddies see effort (blocks, streaks), never status.
import { useCallback, useEffect, useState, type FormEvent } from "react";
import { Check, Mail, UserPlus, X } from "lucide-react";
import { DEMO_PROFILE, isDemo } from "@/lib/demo";
import { usePathway } from "@/lib/store";

type Friends = { incoming: { id: number; name: string; email: string; picture?: string | null }[]; outgoing: { id: number; email: string }[]; buddies: { id: string; name: string; picture?: string | null }[] };

/** A friend's Google photo, or their initial. */
function Face({ name, picture, size = "size-8" }: { name: string; picture?: string | null; size?: string }) {
  return (
    <span className={`grid ${size} shrink-0 place-items-center overflow-hidden rounded-full border-2 border-white bg-grape-soft text-xs font-black text-grape`} aria-hidden>
      {picture ? <img src={picture} alt="" referrerPolicy="no-referrer" className="size-full object-cover" /> : name.charAt(0).toUpperCase()}
    </span>
  );
}

const call = async (profile_id: string, body: object) => {
  const r = await fetch("/api/friends", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ ...body, profile_id }) });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(j.error ?? "That didn't work. Try again.");
  return j as { result?: "sent" | "connected" | "already" };
};

const invite = (email: string, from: string) =>
  `mailto:${encodeURIComponent(email)}?subject=${encodeURIComponent("Be my study buddy on Pathway?")}&body=${encodeURIComponent(
    `Hey! I'm using Pathway to plan my studying, and I added you as a study buddy. Buddies see each other's study blocks and streaks (never grades or status).\n\nSign in with this email address and you'll see my request:\n${typeof window !== "undefined" ? window.location.origin : ""}/landing\n\n${from}`,
  )}`;

export function Friends({ onChange }: { onChange: () => void }) {
  const { profile } = usePathway();
  const [data, setData] = useState<Friends | null>(null);
  const [email, setEmail] = useState("");
  const [busy, setBusy] = useState("");
  const [note, setNote] = useState<{ text: string; invite?: string; error?: boolean } | null>(null);

  // The demo student is the demo account's profile, so /demo answers that account's requests too.
  const linked = profile.account || (isDemo() && profile.id === DEMO_PROFILE);
  const load = useCallback(() => fetch(`/api/friends?profile_id=${encodeURIComponent(profile.id)}`).then((r) => (r.ok ? r.json() : null)).then(setData, () => setData(null)), [profile.id]);
  useEffect(() => {
    if (!linked) return;
    void load();
    const t = setInterval(load, 20_000); // pick up requests that arrive while the page is open
    return () => clearInterval(t);
  }, [linked, load]);

  if (!linked)
    return (
      <p className="mb-8 rounded-2xl border-2 border-dashed border-line bg-polar p-4 text-sm font-bold text-muted">
        These are sample buddies. Sign in to add your own study buddies by email.
      </p>
    );

  const act = async (key: string, body: object, done?: (r: Awaited<ReturnType<typeof call>>) => void) => {
    setBusy(key);
    setNote(null);
    try {
      const r = await call(profile.id, body);
      done?.(r);
      await load();
      onChange();
    } catch (e) {
      setNote({ text: (e as Error).message, error: true });
    } finally {
      setBusy("");
    }
  };

  const send = (e: FormEvent) => {
    e.preventDefault();
    const to = email.trim();
    void act("send", { action: "request", email: to }, (r) => {
      setEmail("");
      if (r.result === "connected") setNote({ text: `You're now study buddies with ${to}. They'd already asked you.` });
      else if (r.result === "already") setNote({ text: `You and ${to} are already study buddies.` });
      else setNote({ text: `Request sent to ${to}. They'll see it the next time they open Pathway.`, invite: to });
    });
  };

  return (
    <section className="panel mb-8 p-5" aria-labelledby="friends">
      <h2 id="friends" className="text-xl font-black">
        Your study buddies
      </h2>
      <p className="mt-1 text-sm text-muted">{profile.account ? "Add a friend by the email they use for Google. " : ""}You&apos;ll see each other&apos;s study blocks and streaks, never grades or status.</p>

      {profile.account && (
        <form onSubmit={send} className="mt-4 flex flex-wrap gap-2">
          <label htmlFor="buddy-email" className="sr-only">Friend&apos;s email</label>
          <input
            id="buddy-email"
            type="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="friend@ncsu.edu"
            autoComplete="off"
            className="min-w-0 flex-1 rounded-xl border-2 border-line bg-white px-3 py-2 font-bold outline-none focus:border-grape"
          />
          <button disabled={busy === "send"} className="btn btn-grape min-h-11 text-xs">
            <UserPlus size={16} aria-hidden /> {busy === "send" ? "Sending…" : "Add buddy"}
          </button>
        </form>
      )}
      {note && (
        <p role="status" className={`mt-2 text-sm font-bold ${note.error ? "text-sun-ink" : "text-ink"}`}>
          {note.text}{" "}
          {note.invite && (
            <a href={invite(note.invite, profile.name)} className="inline-flex items-center gap-1 text-grape underline underline-offset-4">
              <Mail size={13} aria-hidden /> Not on Pathway yet? Email them an invite
            </a>
          )}
        </p>
      )}

      {!data && (
        <div className="mt-4 flex gap-2" aria-busy="true" aria-label="Loading your buddies">
          {[0, 1, 2].map((i) => (
            <span key={i} className="h-8 w-24 animate-pulse rounded-full bg-line/70" aria-hidden />
          ))}
        </div>
      )}
      {!!data?.incoming.length && (
        <div className="mt-5">
          <p className="text-xs font-black uppercase tracking-wider text-muted">Requests for you</p>
          <ul className="mt-2 space-y-2">
            {data.incoming.map((r) => (
              <li key={r.id} className="flex flex-wrap items-center justify-between gap-2 rounded-xl bg-grape-soft/60 px-3 py-2">
                <span className="flex min-w-0 items-center gap-2.5">
                  <Face name={r.name} picture={r.picture} size="size-9" />
                  <span className="min-w-0">
                    <span className="font-black">{r.name}</span> <span className="text-sm text-muted">wants to be study buddies</span>
                    <span className="block truncate text-xs text-muted">{r.email}</span>
                  </span>
                </span>
                <span className="flex gap-2">
                  <button onClick={() => act(`a${r.id}`, { action: "accept", id: r.id })} disabled={!!busy} className="btn btn-grape min-h-9 px-3 text-xs">
                    <Check size={14} strokeWidth={3} aria-hidden /> Accept
                  </button>
                  <button onClick={() => act(`d${r.id}`, { action: "decline", id: r.id })} disabled={!!busy} className="btn btn-ghost min-h-9 px-3 text-xs">
                    Decline
                  </button>
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {!!(data?.buddies.length || data?.outgoing.length) && (
        <ul className="mt-5 flex flex-wrap gap-2" aria-label="Buddies and sent requests">
          {data!.buddies.map((b) => (
            <li key={b.id} className="flex items-center gap-1.5 rounded-full bg-polar py-1 pl-1 pr-1 text-sm font-bold">
              <Face name={b.name} picture={b.picture} size="size-6" />
              {b.name}
              <button onClick={() => act(`r${b.id}`, { action: "remove", buddy: b.id })} disabled={!!busy} aria-label={`Remove ${b.name}`} title="Remove buddy" className="grid size-6 place-items-center rounded-full text-muted hover:bg-white hover:text-ink">
                <X size={13} aria-hidden />
              </button>
            </li>
          ))}
          {data!.outgoing.map((r) => (
            <li key={r.id} className="flex items-center gap-1.5 rounded-full border-2 border-dashed border-line py-0.5 pl-3 pr-1 text-sm font-bold text-muted">
              {r.email} · waiting
              <button onClick={() => act(`c${r.id}`, { action: "cancel", id: r.id })} disabled={!!busy} aria-label={`Cancel request to ${r.email}`} title="Cancel request" className="grid size-6 place-items-center rounded-full hover:bg-polar hover:text-ink">
                <X size={13} aria-hidden />
              </button>
            </li>
          ))}
        </ul>
      )}
      {data && !data.buddies.length && !data.outgoing.length && !data.incoming.length && <p className="mt-4 text-sm text-muted">No buddies yet. Add one above to compare study blocks and start a Study Pot together.</p>}
    </section>
  );
}
