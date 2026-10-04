"use client";

import { useLayoutEffect, useRef, type ReactNode } from "react";
import { Liquid } from "liquid-gooey";

// A "you are here" indicator that slides like liquid between options. Children are the
// options; mark each with data-liquid-key and pass the active key. The (invisible) blob
// glides to the active option with a short CSS transition; liquid-gooey's Move effect makes the
// surface follow it tightly with a slight stretch. No droplet tail, so it stays a clean pill.
export function LiquidSelect({
  active,
  fill,
  shadow,
  className = "",
  children,
}: {
  active: string;
  fill: string;
  shadow?: string;
  className?: string;
  children: ReactNode;
}) {
  const root = useRef<HTMLDivElement>(null);
  const blob = useRef<HTMLDivElement>(null);

  useLayoutEffect(() => {
    const box = root.current;
    const b = blob.current;
    if (!box || !b) return;
    const place = () => {
      const el = box.querySelector<HTMLElement>(`[data-liquid-key="${CSS.escape(active)}"]`);
      if (!el) return void (b.style.opacity = "0");
      const r = el.getBoundingClientRect();
      const c = box.getBoundingClientRect();
      const first = b.style.opacity !== "1";
      b.style.transition = first ? "none" : "transform 220ms cubic-bezier(.2,.8,.2,1), width 220ms, height 220ms";
      b.style.width = `${r.width}px`;
      b.style.height = `${r.height}px`;
      // liquid-gooey renders the SVG layer inside the container's padding box (inset: 0),
      // but measures target frame offsets relative to the container's border-box (r.top - group.top).
      // Because the SVG origin is already offset by clientLeft/clientTop, the dummy blob target must be
      // translated by -2 * clientLeft / -2 * clientTop so the rendered SVG blob lands exactly on `el`.
      b.style.transform = `translate(${r.left - c.left - 2 * box.clientLeft}px, ${r.top - c.top - 2 * box.clientTop}px)`;
      b.style.opacity = "1";
    };
    place();
    const ro = new ResizeObserver(place);
    ro.observe(box);
    // The option itself can resize (e.g. the sidebar rail collapsing it to an icon).
    const el = box.querySelector(`[data-liquid-key="${CSS.escape(active)}"]`);
    if (el) ro.observe(el);
    return () => ro.disconnect();
  }, [active]);

  return (
    <Liquid ref={root} fill={fill} shadow={shadow} blur={7} contrast={18} className={`relative ${className}`}>
      {/* Stiff, well-damped spring: starts the instant you click and tracks the slide closely. */}
      <Liquid.Item effect="move" move={{ advanced: { stiffness: 700, damping: 38, stretch: 0.1, tail: 0 } }}>
        <div ref={blob} aria-hidden className="pointer-events-none absolute left-0 top-0 rounded-xl" style={{ opacity: 0 }} />
      </Liquid.Item>
      {children}
    </Liquid>
  );
}
