"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useRef, useState, type ComponentType, type FocusEvent } from "react";
import {
  BarChart3,
  BookOpen,
  CalendarDays,
  GraduationCap,
  House,
  Mail,
  RotateCcw,
  Users,
} from "lucide-react";
import { LiquidSelect } from "@/components/LiquidSelect";
import { VivaGlyph } from "@/components/Viva";
import { useViva, VivaCard } from "@/components/VivaDock";
import { usePathway } from "@/lib/store";

const VivaIcon = ({ size }: { size?: number; strokeWidth?: number }) => (
  <VivaGlyph size={size} />
);

type NavLink = {
  href: string;
  label: string;
  icon: ComponentType<{ size?: number; strokeWidth?: number }>;
};
const NAV: NavLink[] = [
  { href: "/", label: "Home", icon: House },
  { href: "/courses", label: "Courses", icon: GraduationCap },
  { href: "/study", label: "Study", icon: BookOpen },
  { href: "/calendar", label: "Week", icon: CalendarDays },
  { href: "/insights", label: "Insights", icon: BarChart3 },
  { href: "/inbox", label: "Inbox", icon: Mail },
  { href: "/viva", label: "Viva", icon: VivaIcon },
];
const EXTRA: NavLink = { href: "/buddies", label: "Buddies", icon: Users };

/** Width of the collapsed rail on desktop; Chrome.tsx pads the page by the same amount. */
export const RAIL = "4.5rem";

export function Wordmark({ compact = false }: { compact?: boolean }) {
  return (
    <Link
      href="/"
      className="flex items-center gap-2 text-teal"
      aria-label="Pathway home"
    >
      <svg
        width="30"
        height="30"
        viewBox="0 0 30 30"
        aria-hidden
        className="shrink-0"
      >
        <path
          d="M8 26c0-6 14-5 14-11S8 10 8 4"
          fill="none"
          stroke="currentColor"
          strokeWidth="4"
          strokeLinecap="round"
          strokeDasharray="0.1 7"
        />
        <circle cx="8" cy="4" r="3.5" fill="var(--color-sun)" />
        <circle cx="8" cy="26" r="3.5" fill="currentColor" />
      </svg>
      <span
        className={`text-[1.65rem] font-black tracking-tight transition-opacity duration-150 ${compact ? "opacity-0" : "opacity-100 delay-75"}`}
      >
        pathway
      </span>
    </Link>
  );
}

function ProfileSwitcher({ compact = false }: { compact?: boolean }) {
  const { profiles, profile, setProfile, reset } = usePathway();
  if (!profile) return null;
  return (
    <div className={compact ? "flex items-center gap-2" : "space-y-2"}>
      <label
        className={
          compact ? "sr-only" : "block px-1 text-sm font-bold text-muted"
        }
        htmlFor={compact ? "who-m" : "who"}
      >
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
        <button
          onClick={reset}
          className="flex items-center gap-1.5 px-1 text-sm font-bold text-muted hover:text-ink"
        >
          <RotateCcw size={14} aria-hidden /> Reset demo data
        </button>
      )}
    </div>
  );
}

function NavItem({
  href,
  label,
  icon: Icon,
  on,
  open,
  onPick,
}: NavLink & { on: boolean; open: boolean; onPick: (href: string) => void }) {
  return (
    <Link
      href={href}
      onClick={() => onPick(href)}
      aria-current={on ? "page" : undefined}
      data-liquid-key={href}
      title={open ? undefined : label}
      className={`flex items-center gap-4 rounded-xl px-3 py-2.5 text-[0.9375rem] font-extrabold uppercase tracking-wider transition-colors max-md:min-w-[2.75rem] max-md:flex-col max-md:gap-0.5 max-md:px-0.5 max-md:py-1.5 max-md:text-[10px] max-md:tracking-normal max-md:normal-case ${
        on ? "text-teal-lip" : "text-muted hover:text-ink"
      }`}
    >
      <span className="grid shrink-0 place-items-center" aria-hidden>
        <Icon size={22} strokeWidth={2.4} />
      </span>
      {/* Always in the DOM for screen readers; on desktop it fades in as the rail opens. */}
      <span
        className={`whitespace-nowrap transition-opacity duration-150 ${open ? "md:opacity-100 md:delay-75" : "md:opacity-0"}`}
      >
        {label}
      </span>
    </Link>
  );
}

export function Sidebar() {
  const path = usePathname();
  const { googleOn, profile } = usePathway();
  const { show } = useViva();
  // Move the highlight on click, not when the next page finishes loading. The pick only
  // counts while we're still on the page it was made from, so it clears itself after navigation.
  const [picked, setPicked] = useState<{ href: string; from: string } | null>(
    null,
  );
  const pending = picked && picked.from === path ? picked.href : null;
  const on = (href: string) =>
    pending
      ? pending === href
      : href === "/"
        ? path === "/"
        : path.startsWith(href);
  const pick = (href: string) => setPicked({ href, from: path });

  // Desktop: a quiet icon rail that opens into the full sidebar while the pointer is over it or
  // keyboard focus is inside it (so Tab users get the labels too). It overlays the page rather
  // than pushing it, so nothing shifts.
  const [hover, setHover] = useState(false);
  const [focus, setFocus] = useState(false);
  const navRef = useRef<HTMLElement>(null);
  const open = hover || focus;
  const onBlur = (e: FocusEvent) => {
    if (!navRef.current?.contains(e.relatedTarget as Node | null))
      setFocus(false);
  };
  const initial = profile ? (profile.sample ? profile.name[0] : "Y") : "";

  return (
    <>
      <header className="flex items-center justify-between gap-3 border-b-2 border-line px-4 py-3 md:hidden">
        <Wordmark />
        <div className="max-w-[55%]">
          <ProfileSwitcher compact />
        </div>
      </header>
      <nav
        ref={navRef}
        aria-label="Main"
        data-open={open || undefined}
        onMouseEnter={() => setHover(true)}
        onMouseMove={() => setHover(true)}
        onMouseLeave={() => setHover(false)}
        onFocus={() => setFocus(true)}
        onBlur={onBlur}
        style={{ ["--rail" as string]: RAIL }}
        className={`fixed z-40 flex bg-white max-md:inset-x-0 max-md:bottom-0 max-md:border-t-2 max-md:border-line md:inset-y-0 md:left-0 md:flex-col md:overflow-hidden md:px-3 md:py-5 md:transition-[width,box-shadow,border-radius] md:duration-200 md:ease-out ${
          open
            ? "md:w-64 md:rounded-r-3xl md:shadow-[16px_0_40px_-20px_rgb(51_56_61/0.35)]"
            : "md:w-[var(--rail)] md:shadow-none"
        }`}
      >
        <div className="hidden px-3 pb-6 md:block">
          <Wordmark compact={!open} />
        </div>
        <LiquidSelect
          active={[...NAV, EXTRA].find((n) => on(n.href))?.href ?? ""}
          fill="#ddf4ef"
          shadow="inset 0 0 0 2px rgba(10,127,114,0.35), inset 0 -4px 0 rgba(10,127,114,0.25)"
          className="flex-1 max-md:overflow-x-auto"
        >
          <ul className="flex max-md:min-w-max max-md:justify-around max-md:px-1 md:flex-col md:gap-1.5">
            {NAV.map((n) => (
              <li key={n.href}>
                <NavItem {...n} on={on(n.href)} open={open} onPick={pick} />
              </li>
            ))}
            <li className="md:mt-3 md:border-t-2 md:border-line md:pt-3">
              <NavItem
                {...EXTRA}
                on={on(EXTRA.href)}
                open={open}
                onPick={pick}
              />
            </li>
          </ul>
        </LiquidSelect>

        {/* Bottom of the rail: Viva and the demo profile, as icons until the rail opens. */}
        <div className="hidden md:block">
          {open ? (
            <>
              <div className="mb-4">
                <VivaCard />
              </div>
              <ProfileSwitcher />
              <p className="mt-4 px-1 text-xs font-bold leading-relaxed text-muted">
                Sample Moodle, Gradescope and Gmail data
                {googleOn ? " · Google Calendar connected" : ""}
              </p>
            </>
          ) : (
            <div className="flex flex-col items-center gap-3">
              <button
                onClick={() => show("chat")}
                aria-label="Open Viva"
                title="Viva"
                className="rounded-xl p-2 text-sky hover:bg-sky-soft"
              >
                <VivaGlyph size={30} />
              </button>
              <span
                aria-hidden
                title="Demo profile"
                className="grid h-9 w-9 place-items-center rounded-full border-2 border-line bg-polar text-sm font-black text-ink"
              >
                {initial}
              </span>
            </div>
          )}
        </div>
      </nav>
    </>
  );
}
