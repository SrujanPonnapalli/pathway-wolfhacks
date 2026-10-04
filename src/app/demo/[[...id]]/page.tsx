"use client";

// The demo door, not linked anywhere in the app: /demo (Maya), /demo/jordan, /demo/priya, /demo/judge.
// Turns on demo mode for this browser, opens that sample student, then goes to ?next= (default Home).
// The Pi kiosk uses /demo/maya?next=/device.
import { useEffect } from "react";
import { useParams, useRouter } from "next/navigation";
import { DEMO_IDS, setDemo } from "@/lib/demo";
import { usePathway } from "@/lib/store";

export default function DemoEntry() {
  const { reloadProfiles } = usePathway();
  const router = useRouter();
  const { id } = useParams<{ id?: string[] }>();
  const who = DEMO_IDS.includes(id?.[0] ?? "") ? id![0] : "maya";

  useEffect(() => {
    setDemo(true);
    const next = new URLSearchParams(window.location.search).get("next");
    void reloadProfiles(who).then(() => router.replace(next?.startsWith("/") && !next.startsWith("//") ? next : "/"));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [who]);

  return <p className="mt-10 text-center text-muted" aria-live="polite">Opening the demo…</p>;
}
