"use client";

import { AskLine, Files, Greeting, InboxPanel, Onboarding, Route, WeekPanel } from "@/components/home";
import { useState } from "react";
import { Health } from "@/components/Health";
import { PotLine } from "@/components/PotLine";
import { SemesterSetup, setupKey } from "@/components/SemesterSetup";
import { Gate } from "@/components/ui";
import { DEMO_PROFILE } from "@/lib/demo";
import { usePathway } from "@/lib/store";

export default function Home() {
  return (
    <Gate>
      <HomeFor />
    </Gate>
  );
}

// Keyed by profile, so per-profile state (like finishing setup) starts fresh on a switch.
function HomeFor() {
  const { profile } = usePathway();
  return <HomeBody key={profile.id} />;
}

function HomeBody() {
  const { courses, profile } = usePathway();
  // A Google account sets up its real semester (Drive syllabi, calendar) until it says it's done.
  // The demo account signs in as the demo student, whose semester is already loaded.
  const [setupDone, setSetupDone] = useState(() => {
    try {
      return localStorage.getItem(setupKey(profile.id)) === "done";
    } catch {
      return false;
    }
  });
  if (profile.account && profile.id !== DEMO_PROFILE && (courses.length === 0 || !setupDone))
    return (
      <main className="px-4 py-6 md:px-10 md:py-10">
        <SemesterSetup
          onDone={() => {
            try {
              localStorage.setItem(setupKey(profile.id), "done");
            } catch {}
            setSetupDone(true);
          }}
        />
      </main>
    );
  if (courses.length === 0)
    return (
      <main className="px-4 py-6 md:px-10 md:py-10">
        <Onboarding />
      </main>
    );

  // Wide screens: the route and Viva in the main column, the quiet glanceable sections in a rail beside it,
  // so the whole day fits on screen. Narrower screens stack them in the same order: route first.
  return (
    <main className="mx-auto max-w-narrow px-4 py-6 md:px-10 md:py-10 lg:max-w-wide">
      <div className="lg:grid lg:grid-cols-[minmax(0,1fr)_340px] lg:gap-x-12">
        <div className="min-w-0">
          <Greeting />
          <div className="mt-8"><Route /></div>
          <div className="mt-5"><Health /></div>
          <PotLine offer />
          <div className="mt-5"><AskLine /></div>
        </div>
        <aside aria-label="This week, inbox and files" className="mt-12 grid gap-10 md:grid-cols-2 md:gap-x-12 lg:mt-1 lg:grid-cols-1 lg:gap-y-10">
          <WeekPanel />
          <div className="space-y-10">
            <InboxPanel />
            <Files />
          </div>
        </aside>
      </div>
    </main>
  );
}
