"use client";

import { AskCard, DropZone, Greeting, HeadsUp, Onboarding, TodoPanel, UpNext, WeekPanel } from "@/components/home";
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

  // Mobile reads top to bottom by `order`; on desktop the two wrappers become columns.
  return (
    <main className="mx-auto flex max-w-[1200px] flex-col gap-8 px-4 py-6 md:px-10 md:py-10 lg:grid lg:grid-cols-[minmax(0,1fr)_360px] lg:items-start lg:gap-10">
      <div className="contents lg:flex lg:min-w-0 lg:flex-col lg:gap-8">
        <div className="order-1 lg:order-none"><Greeting /></div>
        <div className="order-2 lg:order-none"><HeadsUp /></div>
        <div className="order-5 lg:order-none"><AskCard /></div>
        <div className="order-6 lg:order-none"><UpNext /></div>
      </div>
      <aside className="contents lg:flex lg:flex-col lg:gap-6">
        <div className="order-3 lg:order-none"><WeekPanel /></div>
        <div className="order-4 lg:order-none"><TodoPanel /></div>
        <div className="order-7 lg:order-none"><DropZone /></div>
      </aside>
    </main>
  );
}
