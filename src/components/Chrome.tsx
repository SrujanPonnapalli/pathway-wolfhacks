"use client";

import { usePathname, useRouter } from "next/navigation";
import { useEffect, type ReactNode } from "react";
import { DemoBanner } from "@/components/DemoBanner";
import { Sidebar } from "@/components/Sidebar";
import { VivaDock, VivaProvider } from "@/components/VivaDock";
import { usePathway } from "@/lib/store";

// Standalone surfaces (the Pi kiosk, landing page, demo door) get no app sidebar or dock.
// VivaProvider still wraps them so the kiosk can keep its voice session across pages.
// The app is accounts-only: with no profile to show (not signed in, not in demo mode), every app
// page sends you to the landing page to sign in. The demo door is /demo (see src/lib/demo.ts).
export function Chrome({ children }: { children: ReactNode }) {
  const path = usePathname();
  const router = useRouter();
  const { entry } = usePathway();
  const fullscreen = path.startsWith("/device") || path === "/landing" || path.startsWith("/demo");
  useEffect(() => {
    if (entry && path !== "/landing" && !path.startsWith("/demo")) router.replace("/landing");
  }, [entry, path, router]);
  return (
    <VivaProvider>
      {fullscreen ? (
        children
      ) : (
        <>
          <Sidebar />
          {/* Desktop pads for the collapsed icon rail only; the open sidebar overlays the page.
              The account menu lives in the sidebar (and the phone header), not over page headers. */}
          <div className="relative pb-24 md:pb-0 md:pl-[4.5rem]">
            <DemoBanner />
            {children}
          </div>
          <VivaDock />
        </>
      )}
    </VivaProvider>
  );
}
