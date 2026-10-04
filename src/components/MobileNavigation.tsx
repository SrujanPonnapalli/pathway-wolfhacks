"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { BarChart3, BookOpen, CalendarDays, GraduationCap, House, Mail, MoreHorizontal, Users, X } from "lucide-react";
import { VivaGlyph } from "@/components/Viva";

const PRIMARY = [
  { href: "/", label: "Home", icon: House },
  { href: "/study", label: "Study", icon: BookOpen },
  { href: "/calendar", label: "Week", icon: CalendarDays },
  { href: "/viva", label: "Viva", icon: VivaGlyph },
];
const SECONDARY = [
  { href: "/courses", label: "Courses", detail: "Materials and grades", icon: GraduationCap },
  { href: "/insights", label: "Insights", detail: "Your standing and next steps", icon: BarChart3 },
  { href: "/inbox", label: "Inbox", detail: "Messages from your classes", icon: Mail },
  { href: "/buddies", label: "Buddies", detail: "Study together", icon: Users },
];

export function MobileNavigation() {
  const path = usePathname();
  const [openedFrom, setOpenedFrom] = useState<string | null>(null);
  const open = openedFrom === path;
  const toggle = useRef<HTMLButtonElement>(null);
  const pages = useRef<HTMLElement>(null);
  const active = (href: string) => href === "/" ? path === "/" : path.startsWith(href);
  const secondaryActive = SECONDARY.some(({ href }) => active(href));

  useEffect(() => {
    if (!open) return;
    pages.current?.querySelector<HTMLAnchorElement>("a")?.focus();
    const dismiss = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setOpenedFrom(null);
        toggle.current?.focus();
      }
    };
    window.addEventListener("keydown", dismiss);
    return () => window.removeEventListener("keydown", dismiss);
  }, [open]);

  return (
    <div className="mobile-navigation md:hidden">
      {open && (
        <>
          <button className="fixed inset-0 z-40 bg-ink/20" aria-label="Close more navigation" onClick={() => setOpenedFrom(null)} tabIndex={-1} />
          <section id="mobile-more" aria-label="More pages" className="mobile-more fixed inset-x-3 z-50 rounded-2xl border-2 border-line bg-white p-3 shadow-xl">
            <div className="mb-1 flex items-center justify-between pl-3">
              <h2 className="text-lg font-black">More</h2>
              <button onClick={() => { setOpenedFrom(null); toggle.current?.focus(); }} className="grid size-11 place-items-center rounded-xl text-muted" aria-label="Close more pages"><X size={20} /></button>
            </div>
            <nav ref={pages} aria-label="More">
              {SECONDARY.map(({ href, label, detail, icon: Icon }) => (
                <Link key={href} href={href} onClick={() => setOpenedFrom(null)} aria-current={active(href) ? "page" : undefined} className={`flex min-h-16 items-center gap-3 rounded-xl px-3 py-2 ${active(href) ? "bg-teal-soft text-teal-lip" : "text-ink active:bg-polar"}`}>
                  <Icon size={23} aria-hidden />
                  <span><span className="block font-extrabold">{label}</span><span className="block text-sm font-semibold text-muted">{detail}</span></span>
                </Link>
              ))}
            </nav>
          </section>
        </>
      )}
      <nav aria-label="Mobile main" className="mobile-tabbar fixed inset-x-0 bottom-0 z-50 border-t-2 border-line bg-white">
        {PRIMARY.map(({ href, label, icon: Icon }) => (
          <Link key={href} href={href} onClick={() => setOpenedFrom(null)} aria-current={active(href) ? "page" : undefined} className={`mobile-tab ${active(href) ? "text-teal-lip" : "text-muted"}`}>
            <span className={`grid h-8 w-12 place-items-center rounded-xl ${active(href) ? "bg-teal-soft" : ""}`}><Icon size={23} aria-hidden /></span>
            <span>{label}</span>
          </Link>
        ))}
        <button ref={toggle} onClick={() => setOpenedFrom(open ? null : path)} aria-expanded={open} aria-controls={open ? "mobile-more" : undefined} className={`mobile-tab ${open || secondaryActive ? "text-teal-lip" : "text-muted"}`}>
          <span className={`grid h-8 w-12 place-items-center rounded-xl ${open || secondaryActive ? "bg-teal-soft" : ""}`}><MoreHorizontal size={23} aria-hidden /></span>
          <span>More</span>
        </button>
      </nav>
    </div>
  );
}
