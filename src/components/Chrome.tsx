"use client";

import { usePathname } from "next/navigation";
import type { ReactNode } from "react";
import { AccountMenu } from "@/components/Account";
import { Sidebar } from "@/components/Sidebar";
import { VivaDock, VivaProvider } from "@/components/VivaDock";

// Full-screen device surfaces (the Pi kiosk at /device) get no app chrome — no sidebar,
// no bottom nav, none of the padding that makes room for them — but VivaProvider still
// wraps them so the kiosk can run the same voice session, and it survives page changes.
export function Chrome({ children }: { children: ReactNode }) {
  const device = usePathname().startsWith("/device");
  return (
    <VivaProvider>
      {device ? (
        children
      ) : (
        <>
          <Sidebar />
          <div className="relative pb-24 md:pb-0 md:pl-64">
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
