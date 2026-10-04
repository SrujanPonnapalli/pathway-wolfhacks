"use client";

// Sign in with Google (Google Identity Services' own button) and the account menu in the top right.
import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { LogOut, Settings, UserRound } from "lucide-react";
import { script } from "@/lib/gcalPersonal";
import { usePathway } from "@/lib/store";

const CLIENT_ID = process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID;

export type Me = { email: string; picture: string | null; created_at: string; profile_id: string; name: string } | null;

export const fetchMe = (): Promise<Me> => fetch("/api/auth").then((r) => r.json(), () => null);

/** Sign out, then fall back to a demo profile. */
export async function signOut(reloadProfiles: (select?: string) => Promise<void>) {
  await fetch("/api/auth", { method: "DELETE" });
  await reloadProfiles();
}

// Google's "G" mark, unmodified, as their branding guidelines ask for custom sign-in buttons.
const GoogleG = () => (
  <svg width="18" height="18" viewBox="0 0 48 48" aria-hidden>
    <path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z" />
    <path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z" />
    <path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z" />
    <path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z" />
  </svg>
);

/** Our own button: Google's account picker opens in a popup, and the server verifies the token. */
export function GoogleSignIn() {
  const { reloadProfiles } = usePathway();
  // The store hands out a new function each render; always call the latest.
  const reload = useRef(reloadProfiles);
  useEffect(() => {
    reload.current = reloadProfiles;
  });
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  // Load Google's script ahead of the click, so the popup opens straight from the tap (browsers block late popups).
  useEffect(() => {
    if (CLIENT_ID) script().catch(() => setErr("Couldn't load Google sign-in."));
  }, []);

  if (!CLIENT_ID) return null;
  const go = () => {
    const oauth = window.google?.accounts?.oauth2;
    if (!oauth) return setErr("Google sign-in is still loading. Try again in a second.");
    setErr("");
    setBusy(true);
    oauth
      .initTokenClient({
        client_id: CLIENT_ID,
        scope: "openid email profile",
        callback: async (r) => {
          if (!r.access_token) return setBusy(false);
          const res = await fetch("/api/auth", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ access_token: r.access_token }) });
          const j = await res.json().catch(() => ({}));
          if (!res.ok) setErr(j.error ?? "Sign-in didn't work. Try again.");
          else await reload.current(j.profile_id);
          setBusy(false);
        },
        error_callback: () => setBusy(false), // popup closed or blocked
      })
      .requestAccessToken({ prompt: "select_account" });
  };
  return (
    <div>
      <button onClick={go} disabled={busy} className="btn btn-ghost min-h-11 w-full text-xs text-ink">
        <GoogleG /> {busy ? "Signing in…" : "Sign in with Google"}
      </button>
      {err && <p role="alert" className="mt-1.5 text-xs font-bold text-sun-ink">{err}</p>}
    </div>
  );
}

/** Top-right account button: your Google photo when signed in, with a small menu. */
export function AccountMenu() {
  const { profile, reloadProfiles } = usePathway();
  const [me, setMe] = useState<Me>(null);
  const [open, setOpen] = useState(false);
  const box = useRef<HTMLDivElement>(null);
  const signedIn = !!profile?.account;

  useEffect(() => {
    let live = true;
    (signedIn ? fetchMe() : Promise.resolve(null)).then((m) => live && setMe(m));
    return () => {
      live = false;
    };
  }, [signedIn, profile?.id]);

  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent | KeyboardEvent) => {
      if (e instanceof KeyboardEvent ? e.key === "Escape" : !box.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", close);
    document.addEventListener("keydown", close);
    return () => {
      document.removeEventListener("mousedown", close);
      document.removeEventListener("keydown", close);
    };
  }, [open]);

  return (
    <div ref={box} className="relative">
      <button
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        aria-haspopup="menu"
        aria-label={me ? `Account: ${me.name}` : "Account and sign in"}
        className="grid size-10 place-items-center overflow-hidden rounded-full border-2 border-line bg-white text-muted hover:text-ink"
      >
        {me?.picture ? <img src={me.picture} alt="" referrerPolicy="no-referrer" className="size-full object-cover" /> : <UserRound size={18} aria-hidden />}
      </button>
      {open && (
        <div role="menu" className="absolute right-0 top-12 z-40 w-72 rounded-2xl border-2 border-line bg-white p-4 shadow-[0_8px_24px_rgb(0_0_0/0.12)]">
          {me ? (
            <>
              <p className="font-black">{me.name}</p>
              <p className="truncate text-sm text-muted">{me.email}</p>
              <div className="mt-3 space-y-1 border-t-2 border-line pt-3">
                <Link role="menuitem" href="/account" onClick={() => setOpen(false)} className="flex items-center gap-2 rounded-xl px-2 py-2 text-sm font-bold hover:bg-polar">
                  <Settings size={16} aria-hidden /> Account &amp; your data
                </Link>
                <button
                  role="menuitem"
                  onClick={async () => (setOpen(false), await signOut(reloadProfiles), setMe(null))}
                  className="flex w-full items-center gap-2 rounded-xl px-2 py-2 text-sm font-bold hover:bg-polar"
                >
                  <LogOut size={16} aria-hidden /> Sign out
                </button>
              </div>
            </>
          ) : (
            <>
              <p className="font-black">Keep your semester</p>
              <p className="mt-1 text-sm text-muted">Sign in to save your courses and study activity to your Google account. Sample profiles stay open to everyone.</p>
              <div className="mt-3">{CLIENT_ID ? <GoogleSignIn /> : <p className="text-sm text-muted">Google sign-in isn&apos;t set up here yet.</p>}</div>
              <Link href="/account" onClick={() => setOpen(false)} className="mt-3 block text-sm font-bold text-teal underline underline-offset-4">
                What Pathway stores
              </Link>
            </>
          )}
        </div>
      )}
    </div>
  );
}
