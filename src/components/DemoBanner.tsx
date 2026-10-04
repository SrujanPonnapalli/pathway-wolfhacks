"use client";

// Shown on every app page while you're viewing a sample student (demo mode, entered through /demo):
// says it's sample data, switches students, resets, and leads out (to your own account, or to sign in).
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ChevronDown, LogOut, RotateCcw } from "lucide-react";
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
    <div role="region" aria-label="Demo mode" className="demo-banner flex min-h-11 flex-wrap items-center gap-x-3 gap-y-2 border-b-2 border-line bg-polar px-4 py-1 text-sm font-bold md:min-h-20 md:px-10 md:py-2">
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
      <details className="relative ml-auto md:hidden">
        <summary className="flex min-h-11 cursor-pointer list-none items-center gap-1 text-muted">Options <ChevronDown size={14} aria-hidden /></summary>
        <div className="absolute right-0 top-full z-40 w-60 rounded-xl border-2 border-line bg-white p-3 shadow-lg">
          <p className="mb-2 text-sm text-muted">Synthetic data for trying Pathway.</p>
          <button onClick={reset} className="flex min-h-11 w-full items-center gap-2 text-left text-muted"><RotateCcw size={16} aria-hidden /> Reset demo</button>
          {mine ? <button onClick={() => setProfile(mine.id)} className="min-h-11 w-full text-left text-teal">Back to my semester</button> : <Link href="/landing" className="flex min-h-11 items-center text-teal">Sign in to start yours</Link>}
          <button onClick={exit} className="flex min-h-11 w-full items-center gap-2 text-left text-muted"><LogOut size={16} aria-hidden /> Exit demo</button>
        </div>
      </details>
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
