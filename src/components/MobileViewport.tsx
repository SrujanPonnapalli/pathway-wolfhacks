"use client";

import { useEffect } from "react";

/** Safari's keyboard changes the visual viewport without resizing the layout viewport. */
export function MobileViewport() {
  useEffect(() => {
    const viewport = window.visualViewport;
    if (!viewport) return;
    const root = document.documentElement;
    const update = () => {
      const editing = document.activeElement?.matches('input:not([type="checkbox"]):not([type="radio"]):not([type="range"]), textarea, [contenteditable="true"]');
      const inset = Math.max(0, window.innerHeight - viewport.height - viewport.offsetTop);
      const keyboard = window.innerWidth < 768 && editing && inset > 100;
      root.toggleAttribute("data-mobile-keyboard", !!keyboard);
      root.style.setProperty("--keyboard-inset", `${keyboard ? inset : 0}px`);
      root.style.setProperty("--visual-height", `${viewport.height}px`);
    };
    update();
    viewport.addEventListener("resize", update);
    viewport.addEventListener("scroll", update);
    document.addEventListener("focusin", update);
    document.addEventListener("focusout", update);
    return () => {
      viewport.removeEventListener("resize", update);
      viewport.removeEventListener("scroll", update);
      document.removeEventListener("focusin", update);
      document.removeEventListener("focusout", update);
      root.removeAttribute("data-mobile-keyboard");
      root.style.removeProperty("--keyboard-inset");
      root.style.removeProperty("--visual-height");
    };
  }, []);
  return null;
}
