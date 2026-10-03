"use client";

import { usePathname } from "next/navigation";
import type { ReactNode } from "react";
import { Sidebar } from "@/components/Sidebar";

// Full-screen device surfaces (the Pi kiosk at /device) get no app chrome at all:
// no sidebar, no bottom nav, none of the padding that makes room for them.
export function Chrome({ children }: { children: ReactNode }) {
  if (usePathname().startsWith("/device")) return <>{children}</>;
  return (
    <>
      <Sidebar />
      <div className="pb-24 md:pb-0 md:pl-64">{children}</div>
    </>
  );
}
