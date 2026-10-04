"use client";

import { usePathname } from "next/navigation";
import type { ReactNode } from "react";
import { AccountMenu } from "@/components/Account";
import { Sidebar } from "@/components/Sidebar";
import { VivaDock, VivaProvider } from "@/components/VivaDock";

// Standalone surfaces (the Pi kiosk and landing page) get no app sidebar or dock.
// VivaProvider still wraps them so the kiosk can keep its voice session across pages.
export function Chrome({ children }: { children: ReactNode }) {
  const path = usePathname();
  const fullscreen = path.startsWith("/device") || path === "/landing";
  return (
    <VivaProvider>
      {fullscreen ? (
        children
      ) : (
        <>
          <Sidebar />
          {/* Desktop pads for the collapsed icon rail only; the open sidebar overlays the page. */}
          <div className="relative pb-24 md:pb-0 md:pl-[4.5rem]">
            <div className="absolute right-6 top-5 z-30 hidden md:block">
              <AccountMenu />
            </div>
            {children}
          </div>
          <VivaDock />
        </>
      )}
    </VivaProvider>
  );
}
