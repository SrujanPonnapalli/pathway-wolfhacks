"use client";

import { useEffect, useState } from "react";
import { Download, LogOut, ShieldCheck, Trash2 } from "lucide-react";
import { fetchMe, GoogleSignIn, signOut, type Me } from "@/components/Account";
import { Gate, PageHeader } from "@/components/ui";
import { usePathway } from "@/lib/store";

export default function Page() {
  return (
    <Gate>
      <Account />
    </Gate>
  );
}

function Account() {
  const { profile, reloadProfiles } = usePathway();
  const [me, setMe] = useState<Me | undefined>(undefined);
  const [busy, setBusy] = useState("");
  useEffect(() => void fetchMe().then(setMe), [profile?.id]); // signing in or out from the menu updates this page too

  const leave = async () => {
    setBusy("out");
    await signOut(reloadProfiles);
    setMe(null);
    setBusy("");
  };
  const remove = async () => {
    if (!confirm("Delete your Pathway account and everything it stores? This can't be undone.")) return;
    setBusy("delete");
    await fetch("/api/account", { method: "DELETE" });
    await reloadProfiles(undefined, me?.profile_id);
    setMe(null);
    setBusy("");
  };

  return (
    <main className="mx-auto max-w-2xl px-4 py-6 md:px-10 md:py-10">
      <PageHeader title="Account" lead="Your Pathway account, what it stores, and how to take it with you or delete it." />

      {me === undefined && <p className="text-muted">Loading…</p>}

      {me === null && (
        <section className="panel p-6">
          <h2 className="text-xl font-black">Sign in to keep your semester</h2>
          <p className="mt-1 text-muted">
            Your courses, study blocks and activity are saved to your Google account, so they follow you to any device. Sample profiles stay open to everyone.
          </p>
          <div className="mt-4 max-w-xs">
            <GoogleSignIn />
          </div>
          {!process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID && <p className="mt-3 text-sm text-muted">Google sign-in isn&apos;t set up on this deployment yet.</p>}
        </section>
      )}

      {me && (
        <>
          <section className="panel flex flex-wrap items-center gap-4 p-6">
            {me.picture && <img src={me.picture} alt="" referrerPolicy="no-referrer" className="size-14 rounded-full" />}
            <div className="min-w-0 flex-1">
              <p className="text-xl font-black">{me.name}</p>
              <p className="truncate text-muted">{me.email} · Google account · since {new Date(me.created_at).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}</p>
            </div>
            <button onClick={leave} disabled={!!busy} className="btn btn-ghost min-h-11 text-xs">
              <LogOut size={16} aria-hidden /> {busy === "out" ? "Signing out…" : "Sign out"}
            </button>
          </section>

          <section className="panel mt-6 p-6" aria-labelledby="stored">
            <h2 id="stored" className="flex items-center gap-2 text-lg font-black">
              <ShieldCheck size={18} className="text-teal" aria-hidden /> What Pathway stores
            </h2>
            <ul className="mt-3 space-y-2 text-sm">
              <li><strong>In Pathway&apos;s database:</strong> your name and email, courses, deadlines, class times, study blocks, to-dos and logged study activity. Inputs only.</li>
              <li><strong>Only on this device:</strong> your status in each class. The model runs in your browser, and Pathway never stores the result.</li>
              <li><strong>Sent for processing, not kept:</strong> files you drop are read by Google Gemini; Viva&apos;s voice goes through ElevenLabs.</li>
              <li><strong>On Solana devnet (public, permanent):</strong> if you join a Study Pot, your app-made wallet address, stakes and block counts. No name or course is ever on-chain.</li>
            </ul>
          </section>

          <section className="panel mt-6 p-6" aria-labelledby="yours">
            <h2 id="yours" className="text-lg font-black">Your data</h2>
            <div className="mt-4 flex flex-wrap gap-3">
              <a href="/api/account" className="btn btn-ghost min-h-11 text-xs">
                <Download size={16} aria-hidden /> Download my data
              </a>
              <button onClick={remove} disabled={!!busy} className="btn btn-danger min-h-11 text-xs">
                <Trash2 size={16} aria-hidden /> {busy === "delete" ? "Deleting…" : "Delete my account"}
              </button>
            </div>
            <p className="mt-3 text-sm text-muted">
              Download is a JSON file of everything listed above. Deleting removes it all from Pathway&apos;s database right away. Solana transactions can&apos;t be erased, but nothing links them to you once your account is gone.
            </p>
          </section>
        </>
      )}
    </main>
  );
}
