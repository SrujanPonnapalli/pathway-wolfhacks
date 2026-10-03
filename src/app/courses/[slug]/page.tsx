import Link from "next/link";
import { notFound } from "next/navigation";
import { ChevronLeft } from "lucide-react";
import { StatusMark, Todo } from "@/components/ui";
import { WhatWouldHelp } from "@/components/WhatWouldHelp";
import { courses } from "@/lib/mock";

export function generateStaticParams() {
  return courses.map((c) => ({ slug: c.slug }));
}

export default async function Course(props: PageProps<"/courses/[slug]">) {
  const { slug } = await props.params;
  const c = courses.find((x) => x.slug === slug);
  if (!c) notFound();

  return (
    <main className="mx-auto max-w-4xl px-4 py-6 md:px-10 md:py-10">
      <Link href="/courses" className="inline-flex items-center gap-1 font-extrabold uppercase tracking-wider text-sm text-sky">
        <ChevronLeft size={18} aria-hidden /> Courses
      </Link>
      <header className="mt-4 mb-8">
        <h1 className="text-[2rem] md:text-[2.5rem] font-black leading-tight tracking-tight">{c.code} <span className="text-muted">· {c.name}</span></h1>
        <div className="mt-2 text-lg"><StatusMark status={c.status} /></div>
        <p className="mt-2 max-w-[60ch] text-lg">{c.reason}</p>
        <p className="mt-1 text-muted">{c.nextExam}</p>
      </header>

      <div className="grid gap-6 lg:grid-cols-2">
        <section className="panel p-6" aria-labelledby="help">
          <h2 id="help" className="mb-4 text-xl font-black">What would help</h2>
          <WhatWouldHelp />
          <button className="btn btn-primary mt-6 w-full" disabled title="Coming soon: writes dated study blocks to your calendar">
            Make it real
          </button>
        </section>
        <section className="space-y-4">
          <Todo what="Decision tree with your path lit (D3)" wire="src/lib/tree.ts predict().path + tree_early.json / tree_mid.json" />
          <Todo what="Locked context features (course, class year, work hours)" wire="feature roles from the notebook export" />
          <Todo what="Make it real → dated blocks + .ics export" wire="/api/calendar" />
        </section>
      </div>
    </main>
  );
}
