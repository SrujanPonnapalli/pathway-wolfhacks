"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ComponentType } from "react";
import { BarChart3, BookOpen, House, RotateCcw, Users } from "lucide-react";
import { LiquidSelect } from "@/components/LiquidSelect";
import { VivaGlyph } from "@/components/Viva";
import { usePathway } from "@/lib/store";

const VivaIcon = ({ size }: { size?: number; strokeWidth?: number }) => <VivaGlyph size={size} />;

type NavLink = { href: string; label: string; icon: ComponentType<{ size?: number; strokeWidth?: number }> };
const nav: NavLink[] = [
  { href: "/", label: "Home", icon: House },
  { href: "/study", label: "Study", icon: BookOpen },
  { href: "/insights", label: "Insights", icon: BarChart3 },
  { href: "/viva", label: "Viva", icon: VivaIcon },
];
const extra: NavLink = { href: "/buddies", label: "Buddies", icon: Users };

export function Wordmark() {
  return (
    <Link href="/" className="flex items-center gap-2 text-teal" aria-label="Pathway home">
      <svg width="30" height="30" viewBox="0 0 30 30" aria-hidden>
        <path d="M8 26c0-6 14-5 14-11S8 10 8 4" fill="none" stroke="currentColor" strokeWidth="4" strokeLinecap="round" strokeDasharray="0.1 7" />
        <circle cx="8" cy="4" r="3.5" fill="var(--color-sun)" />
        <circle cx="8" cy="26" r="3.5" fill="currentColor" />
      </svg>
      <span className="text-[1.65rem] font-black tracking-tight">pathway</span>
    </Link>
  );
}

function ProfileSwitcher({ compact = false }: { compact?: boolean }) {
  const { profiles, profile, setProfile, reset } = usePathway();
  if (!profile) return null;
  return (
    <div className={compact ? "flex items-center gap-2" : "space-y-2"}>
      <label className={compact ? "sr-only" : "block px-1 text-sm font-bold text-muted"} htmlFor={compact ? "who-m" : "who"}>
        Demo profile
      </label>
      <select
        id={compact ? "who-m" : "who"}
        value={profile.id}
        onChange={(e) => setProfile(e.target.value)}
        className="w-full rounded-xl border-2 border-b-4 border-line bg-white px-3 py-2 font-extrabold"
      >
        {profiles.map((p) => (
          <option key={p.id} value={p.id}>
            {p.sample ? `${p.name} (sample)` : "You (judge, live)"}
          </option>
        ))}
      </select>
      {!compact && (
        <button onClick={reset} className="flex items-center gap-1.5 px-1 text-sm font-bold text-muted hover:text-ink">
          <RotateCcw size={14} aria-hidden /> Reset demo data
        </button>
      )}
    </div>
  );
}

function NavItem({ href, label, icon: Icon, on }: NavLink & { on: boolean }) {
  return (
    <Link
      href={href}
      aria-current={on ? "page" : undefined}
      data-liquid-key={href}
      className={`flex items-center gap-4 rounded-xl border-2 px-3 py-2.5 text-[0.9375rem] font-extrabold uppercase tracking-wider transition-colors max-md:flex-col max-md:gap-0.5 max-md:px-1.5 max-md:py-1.5 max-md:text-xs max-md:tracking-normal max-md:normal-case ${
        on ? "border-transparent text-teal-lip" : "border-transparent text-muted hover:text-ink"
      }`}
    >
      <Icon size={26} strokeWidth={2.4} />
      {label}
    </Link>
  );
}

export function Sidebar() {
  const path = usePathname();
  const on = (href: string) => (href === "/" ? path === "/" : path.startsWith(href));

  return (
    <>
      <header className="flex items-center justify-between gap-3 border-b-2 border-line px-4 py-3 md:hidden">
        <Wordmark />
        <div className="max-w-[55%]">
          <ProfileSwitcher compact />
        </div>
      </header>
      <nav
        aria-label="Main"
        className="fixed z-20 flex bg-white max-md:inset-x-0 max-md:bottom-0 max-md:border-t-2 max-md:border-line md:inset-y-0 md:left-0 md:w-64 md:flex-col md:border-r-2 md:border-line md:px-4 md:py-6"
      >
        <div className="hidden px-3 pb-8 md:block">
          <Wordmark />
        </div>
        <LiquidSelect active={[...nav, extra].find((n) => on(n.href))?.href ?? ""} fill="#ddf4ef" shadow="inset 0 0 0 2px rgba(10,127,114,0.35), inset 0 -4px 0 rgba(10,127,114,0.25)" className="flex-1">
        <ul className="flex max-md:justify-around md:flex-col md:gap-1.5">
          {nav.map((n) => (
            <li key={n.href}>
              <NavItem {...n} on={on(n.href)} />
            </li>
          ))}
          <li className="md:mt-4 md:border-t-2 md:border-line md:pt-4">
            <NavItem {...extra} on={on(extra.href)} />
          </li>
        </ul>
        </LiquidSelect>
        <div className="hidden md:block">
          <ProfileSwitcher />
        </div>
      </nav>
    </>
  );
}
