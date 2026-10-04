"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState, type ComponentType, type FocusEvent } from "react";
import { BarChart3, BookOpen, CalendarDays, GraduationCap, House, Mail, Mic, MonitorSmartphone, Users } from "lucide-react";
import { AccountMenu } from "@/components/Account";
import { LiquidSelect } from "@/components/LiquidSelect";
import { VivaGlyph } from "@/components/Viva";
import { useViva } from "@/components/VivaDock";
import { usePathway } from "@/lib/store";

const VivaIcon = ({ size }: { size?: number; strokeWidth?: number }) => <VivaGlyph size={size} />;

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
  { href: "/device", label: "Device", icon: MonitorSmartphone },
];
const EXTRA: NavLink = { href: "/buddies", label: "Buddies", icon: Users };

/** Width of the collapsed rail on desktop; Chrome.tsx pads the page by the same amount. */
export const RAIL = "4.5rem";
/** Width of the open sidebar. The content inside is always laid out at this width, so opening only reveals it. */
const OPEN = "16rem";

export function Wordmark({ compact = false }: { compact?: boolean }) {
  return (
    <Link href="/" className="flex items-center gap-2 text-teal" aria-label="Pathway home">
      <svg width="30" height="30" viewBox="0 0 30 30" aria-hidden className="shrink-0">
        <path d="M8 26c0-6 14-5 14-11S8 10 8 4" fill="none" stroke="currentColor" strokeWidth="4" strokeLinecap="round" strokeDasharray="0.1 7" />
        <circle cx="8" cy="4" r="3.5" fill="var(--color-sun)" />
        <circle cx="8" cy="26" r="3.5" fill="currentColor" />
      </svg>
      <span className={`text-[1.65rem] font-black tracking-tight transition-[opacity,transform] duration-200 ease-out ${compact ? "-translate-x-1 opacity-0" : "translate-x-0 opacity-100 delay-75"}`}>pathway</span>
    </Link>
  );
}

function NavItem({ href, label, icon: Icon, on, open, onPick }: NavLink & { on: boolean; open: boolean; onPick: (href: string) => void }) {
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
      {/* Always in the DOM for screen readers; on desktop it fades and slides in as the rail opens. */}
      <span className={`whitespace-nowrap transition-[opacity,transform] duration-200 ease-out ${open ? "md:translate-x-0 md:opacity-100 md:delay-75" : "md:-translate-x-1 md:opacity-0"}`}>{label}</span>
    </Link>
  );
}

export function Sidebar() {
  const path = usePathname();
  const { googleOn } = usePathway();
  const { show, open: dockOpen, view, voice } = useViva();
  const vivaLabel = voice.active ? (({ listening: "Listening…", thinking: "Thinking…", speaking: "Speaking…", connecting: "Connecting…" } as Record<string, string>)[voice.state] ?? "On a call") : "Ask, plan, or talk";
  // Move the highlight on click, not when the next page finishes loading. The pick only
  // counts while we're still on the page it was made from, so it clears itself after navigation.
  const [picked, setPicked] = useState<{ href: string; from: string } | null>(null);
  const pending = picked && picked.from === path ? picked.href : null;
  const on = (href: string) => (pending ? pending === href : href === "/" ? path === "/" : path.startsWith(href));

  // Desktop: a quiet icon rail that opens into the full sidebar while the pointer rests on it or
  // keyboard focus is inside it (so Tab users get the labels too). It overlays the page rather
  // than pushing it, so nothing shifts.
  //
  // How it moves: the nav is always the open width; a clip-path hides everything right of the
  // rail and the clip animates. That is a compositor-only change (no layout, no repaint of the
  // gooey highlight), so it stays smooth. Labels fade and slide in. Nothing mounts or unmounts.
  //
  // Hover has intent (a short pause before opening, a short grace before closing), and the rail
  // gets out of the way on its own: picking a page, or opening Viva's chat, closes it and keeps it
  // closed until the pointer leaves and comes back.
  const [hover, setHover] = useState(false);
  const [focus, setFocus] = useState(false);
  const [parked, setParked] = useState(false);
  const navRef = useRef<HTMLElement>(null);
  const inside = useRef(false);
  const timers = useRef<{ open?: number; close?: number }>({});
  const enter = () => {
    inside.current = true;
    window.clearTimeout(timers.current.close);
    window.clearTimeout(timers.current.open);
    timers.current.open = window.setTimeout(() => setHover(true), 70);
  };
  const leave = () => {
    inside.current = false;
    window.clearTimeout(timers.current.open);
    window.clearTimeout(timers.current.close);
    timers.current.close = window.setTimeout(() => {
      setHover(false);
      setParked(false);
    }, 140);
  };
  useEffect(() => () => {
    window.clearTimeout(timers.current.open);
    window.clearTimeout(timers.current.close);
  }, []);
  /** Close now and stay closed while the pointer is still here; drop keyboard focus so it can't hold the rail open. */
  const park = () => {
    if (inside.current) setParked(true);
    setFocus(false);
    const a = document.activeElement as HTMLElement | null;
    if (a && navRef.current?.contains(a)) a.blur();
  };
  const pick = (href: string) => {
    setPicked({ href, from: path });
    park();
  };
  // Chat opened (from here or anywhere): the rail folds away so the dock has the room.
  const parkRef = useRef(park);
  useEffect(() => {
    parkRef.current = park;
  });
  useEffect(() => {
    if (dockOpen) parkRef.current();
  }, [dockOpen]);
  const open = (hover || focus) && !parked;
  const onBlur = (e: FocusEvent) => {
    if (!navRef.current?.contains(e.relatedTarget as Node | null)) setFocus(false);
  };
  const fade = (shown: boolean, delay = true) => `transition-opacity duration-200 ${shown ? `opacity-100 ${delay ? "delay-100" : ""}` : "pointer-events-none opacity-0"}`;

  return (
    <>
      <header className="flex items-center justify-between gap-3 border-b-2 border-line px-4 py-3 md:hidden">
        <Wordmark />
        <AccountMenu />
      </header>
      <nav
        ref={navRef}
        aria-label="Main"
        data-open={open || undefined}
        onMouseEnter={enter}
        onMouseMove={() => !inside.current && enter()}
        onMouseLeave={leave}
        onFocus={() => setFocus(true)}
        onBlur={onBlur}
        style={{
          ["--rail" as string]: RAIL,
          ["--open" as string]: OPEN,
          // Closed: show the rail only. Open: the whole panel plus room for its shadow.
          ["--clip" as string]: open ? "inset(-64px -64px -64px 0)" : "inset(0 calc(var(--open) - var(--rail)) 0 0)",
        }}
        className="fixed z-40 flex bg-white max-md:inset-x-0 max-md:bottom-0 max-md:border-t-2 max-md:border-line md:inset-y-0 md:left-0 md:w-[var(--open)] md:flex-col md:overflow-hidden md:rounded-r-3xl md:px-3 md:py-5 md:shadow-[16px_0_40px_-20px_rgb(51_56_61/0.35)] md:transition-[clip-path] md:duration-300 md:ease-[cubic-bezier(0.45,0,0.15,1)] md:[clip-path:var(--clip)] md:[will-change:clip-path]"
      >
        <div className="hidden px-3 pb-6 md:block">
          <Wordmark compact={!open} />
        </div>
        <LiquidSelect active={[...NAV, EXTRA].find((n) => on(n.href))?.href ?? ""} fill="#ddf4ef" shadow="inset 0 0 0 2px rgba(10,127,114,0.35), inset 0 -4px 0 rgba(10,127,114,0.25)" className="flex-1 max-md:overflow-x-auto">
          <ul className="flex max-md:min-w-max max-md:justify-around max-md:px-1 md:flex-col md:gap-1.5">
            {NAV.map((n) => (
              <li key={n.href}>
                <NavItem {...n} on={on(n.href)} open={open} onPick={pick} />
              </li>
            ))}
            <li className="md:mt-3 md:border-t-2 md:border-line md:pt-3">
              <NavItem {...EXTRA} on={on(EXTRA.href)} open={open} onPick={pick} />
            </li>
          </ul>
        </LiquidSelect>

        {/* Bottom of the rail: Viva and the account. The same two rows in both states, so the glyph you aim
            at while the rail is still closed is the one you click once it has opened: the rail opening only
            reveals the words and buttons beside them. Demo profiles switch in the demo banner, not here. */}
        <div className="hidden md:block">
          <div className={`flex items-start gap-2 rounded-2xl transition-colors ${open ? "bg-polar" : ""}`}>
            <button onClick={() => show("chat")} aria-label="Open Viva" title="Viva" className="grid size-12 shrink-0 place-items-center rounded-xl text-sky hover:bg-sky-soft">
              <span className="relative">
                <VivaGlyph size={30} />
                {voice.active && <span className="absolute -right-0.5 -top-0.5 h-3 w-3 rounded-full border-2 border-white bg-teal" aria-hidden />}
              </span>
            </button>
            <div className={`min-w-0 flex-1 py-1.5 pr-2 ${fade(open)}`}>
              <span className="block text-sm font-black leading-tight text-ink">Viva</span>
              <span className="block truncate text-xs font-bold text-muted" aria-live="polite">{vivaLabel}</span>
              <div className="mt-1.5 flex gap-1.5">
                <button onClick={() => show("chat")} tabIndex={open ? 0 : -1} className={`btn min-h-8 px-2.5 text-xs ${dockOpen && view === "chat" ? "btn-sky" : "btn-ghost"}`}>
                  Chat
                </button>
                <button onClick={() => show("voice")} tabIndex={open ? 0 : -1} className={`btn min-h-8 px-2.5 text-xs ${dockOpen && view === "voice" ? "btn-sky" : "btn-ghost"}`}>
                  <Mic size={14} aria-hidden /> Voice
                </button>
              </div>
            </div>
          </div>
          <div className="mt-2 px-1.5">
            <AccountMenu placement="above" label labelClassName={fade(open)} />
          </div>
          <p className={`mt-3 px-1.5 text-xs font-bold leading-relaxed text-muted ${fade(open)}`}>
            Sample Moodle, Gradescope and Gmail data
            {googleOn ? " · Google Calendar connected" : ""}
          </p>
        </div>
      </nav>
    </>
  );
}
