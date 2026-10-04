"use client";

// The kiosk stage: the /device screen is designed at exactly 1024×600 (a 7" landscape panel) and
// is drawn at that size whatever the real viewport is, scaled to fit and centered. On the panel in
// kiosk mode the scale is 1; in a windowed browser on the Pi desktop, on an 800×480 7" panel or on
// a monitor it shrinks or grows as a whole, so nothing ever wraps, clips or reflows differently
// from the design. The scale is a transform, so touch targets stay where they look.
import { useSyncExternalStore, type ReactNode } from "react";

export const STAGE = { width: 1024, height: 600 };

const subscribe = (cb: () => void) => {
  window.addEventListener("resize", cb);
  window.addEventListener("orientationchange", cb);
  return () => {
    window.removeEventListener("resize", cb);
    window.removeEventListener("orientationchange", cb);
  };
};
const fit = () => Math.round(Math.min(window.innerWidth / STAGE.width, window.innerHeight / STAGE.height) * 1000) / 1000;

export function Stage({ children }: { children: ReactNode }) {
  const k = useSyncExternalStore(subscribe, fit, () => 1);
  return (
    <div className="fixed inset-0 overflow-hidden bg-polar">
      <div
        className="absolute left-1/2 top-1/2 overflow-hidden"
        style={{ width: STAGE.width, height: STAGE.height, transform: `translate(-50%, -50%) scale(${k})`, transformOrigin: "center" }}
      >
        {children}
      </div>
    </div>
  );
}
