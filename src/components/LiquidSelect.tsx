"use client";

import { useLayoutEffect, useRef, type ReactNode } from "react";
import { Liquid } from "liquid-gooey";

// A "you are here" indicator that flows like liquid between options. Children are the
// options; mark each with data-liquid-key and pass the active key. The (invisible) blob
// jumps to the active option; liquid-gooey's shape morph then flows the liquid mass there,
// stretching and settling into the pill instead of sliding a rigid shape with a round tail.
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
      b.style.width = `${r.width}px`;
      b.style.height = `${r.height}px`;
      // Absolute children start inside the border, so subtract its width (clientLeft/Top).
      b.style.transform = `translate(${r.left - c.left - box.clientLeft}px, ${r.top - c.top - box.clientTop}px)`;
      b.style.opacity = "1";
    };
    place();
    const ro = new ResizeObserver(place);
    ro.observe(box);
    return () => ro.disconnect();
  }, [active]);

  return (
    <Liquid ref={root} fill={fill} shadow={shadow} blur={7} contrast={18} className={`relative ${className}`}>
      <Liquid.Item
        morph={{
          shape: true,
          bounce: 0.15,
          contentBlur: 0,
          // Short lead and stiff, well-damped springs: it slides and stretches a little, then settles
          // straight back into the exact rounded pill (no long overshoot, no ball shape).
          advanced: {
            evolve: { roundness: 0.1, travel: 8, anticipation: 30, massStiffness: 420, massDamping: 30, sizeStiffness: 320, sizeDamping: 28, cornerDuration: 200 },
          },
        }}
      >
        <div ref={blob} aria-hidden className="pointer-events-none absolute left-0 top-0 rounded-xl" style={{ opacity: 0 }} />
      </Liquid.Item>
      {children}
    </Liquid>
  );
}
