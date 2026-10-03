"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { BarChart3, BookOpen, House, MessageCircle, Route, Users } from "lucide-react";

const nav = [
  { href: "/", label: "Home", icon: House },
  { href: "/courses", label: "Courses", icon: Route },
  { href: "/study", label: "Study", icon: BookOpen },
  { href: "/chat", label: "Chat", icon: MessageCircle },
  { href: "/friends", label: "Friends", icon: Users },
  { href: "/insights", label: "Insights", icon: BarChart3 },
];

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

export function Sidebar() {
  const path = usePathname();
  const active = (href: string) => (href === "/" ? path === "/" : path.startsWith(href));

  return (
    <nav
      aria-label="Main"
      className="fixed z-20 bg-white border-line max-md:inset-x-0 max-md:bottom-0 max-md:border-t-2 md:inset-y-0 md:left-0 md:w-64 md:border-r-2 md:px-4 md:py-6"
    >
      <div className="hidden md:block px-3 pb-8">
        <Wordmark />
      </div>
      <ul className="flex md:flex-col md:gap-1.5 max-md:justify-around">
        {nav.map(({ href, label, icon: Icon }) => {
          const on = active(href);
          return (
            <li key={href}>
              <Link
                href={href}
                aria-current={on ? "page" : undefined}
                className={`flex items-center gap-4 rounded-xl border-2 px-3 py-2.5 text-[0.9375rem] font-extrabold uppercase tracking-wider transition-colors max-md:flex-col max-md:gap-0.5 max-md:px-2 max-md:py-2 max-md:text-[0.625rem] ${
                  on ? "border-teal/40 bg-teal-soft text-teal" : "border-transparent text-muted hover:bg-polar"
                }`}
              >
                <Icon size={26} strokeWidth={2.4} aria-hidden />
                {label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
