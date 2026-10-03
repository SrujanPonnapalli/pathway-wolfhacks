"use client";

import { AskLine, Files, Greeting, InboxPanel, Onboarding, Route, WeekPanel } from "@/components/home";
import { Gate } from "@/components/ui";
import { usePathway } from "@/lib/store";

export default function Home() {
  return (
    <Gate>
      <HomeBody />
    </Gate>
  );
}

function HomeBody() {
  const { courses } = usePathway();
  if (courses.length === 0)
    return (
      <main className="px-4 py-6 md:px-10 md:py-10">
        <Onboarding />
      </main>
    );

  // One column: greeting, the route, one line to Viva. Then the quiet sections.
  return (
    <main className="mx-auto max-w-[760px] px-4 py-6 md:px-10 md:py-10">
      <Greeting />
      <div className="mt-8"><Route /></div>
      <div className="mt-5"><AskLine /></div>
      <div className="mt-12 grid gap-10 md:grid-cols-2 md:gap-x-12">
        <WeekPanel />
        <div className="space-y-10">
          <InboxPanel />
          <Files />
        </div>
      </div>
    </main>
  );
}
