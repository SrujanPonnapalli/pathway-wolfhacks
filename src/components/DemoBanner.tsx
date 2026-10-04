"use client";

// Shown on every app page while you're viewing a sample student (demo mode, entered through /demo):
// says it's sample data, switches students, resets, and leads out (to your own account, or to sign in).
import Link from "next/link";
import { useRouter } from "next/navigation";
import { LogOut, RotateCcw } from "lucide-react";
import { setDemo } from "@/lib/demo";
import { usePathway } from "@/lib/store";

export function DemoBanner() {
  const { profiles, profile, setProfile, reset, reloadProfiles } = usePathway();
  const router = useRouter();
  if (!profile || profile.account) return null;
  const mine = profiles.find((p) => p.account);
  const samples = profiles.filter((p) => !p.account);

  const exit = async () => {
    setDemo(false);
    await reloadProfiles(mine?.id);
    if (!mine) router.replace("/landing");
  };

  return (
    <div role="region" aria-label="Demo mode" className="demo-banner hidden min-h-20 flex-wrap items-center gap-x-3 gap-y-2 border-b-2 border-line bg-polar px-10 py-2 text-sm font-bold md:flex">
      <span className="rounded-lg bg-ink px-2 py-0.5 text-xs font-black uppercase tracking-wider text-white">Demo</span>
      {samples.length > 1 ? (
        <label className="flex items-center gap-2">
          <span className="text-muted">Viewing</span>
          <select value={profile.id} onChange={(e) => setProfile(e.target.value)} className="rounded-xl border-2 border-b-4 border-line bg-white px-2.5 py-1 font-extrabold">
            {samples.map((p) => (
              <option key={p.id} value={p.id}>
                {p.sample ? `${p.name} (sample student)` : "Blank student (judge)"}
              </option>
            ))}
          </select>
        </label>
      ) : (
        <span>
          <span className="text-muted">Viewing </span>
          {profile.name}
        </span>
      )}
      <span className="text-muted max-md:hidden">Synthetic data, for trying Pathway out.</span>
      <span className="hidden flex-1 flex-wrap items-center justify-end gap-x-4 gap-y-1 md:flex">
        <button onClick={reset} className="flex items-center gap-1.5 text-muted hover:text-ink">
          <RotateCcw size={14} aria-hidden /> Reset
        </button>
        {mine ? (
          <button onClick={() => setProfile(mine.id)} className="text-teal underline underline-offset-4">
            Back to my semester
          </button>
        ) : (
          <Link href="/landing" className="text-teal underline underline-offset-4">
            Sign in to start yours
          </Link>
        )}
        <button onClick={exit} className="flex items-center gap-1.5 text-muted hover:text-ink">
          <LogOut size={14} aria-hidden /> Exit demo
        </button>
      </span>
    </div>
  );
}
