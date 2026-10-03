import Link from "next/link";
import { ChevronRight } from "lucide-react";
import { PageHeader, StatusMark } from "@/components/ui";
import { courses } from "@/lib/mock";

export default function Courses() {
  return (
    <main className="mx-auto max-w-3xl px-4 py-6 md:px-10 md:py-10">
      <PageHeader title="Courses" lead="Where each class stands, why, and what would help." />
      <ul className="space-y-3">
        {courses.map((c) => (
          <li key={c.slug}>
            <Link href={`/courses/${c.slug}`} className="group flex items-center gap-4 rounded-[var(--radius-tile)] border-2 border-b-[5px] border-line bg-white p-5 hover:bg-polar">
              <span className="min-w-0 flex-1">
                <span className="flex flex-wrap items-baseline gap-x-3">
                  <span className="text-xl font-black">{c.code}</span>
                  <span className="text-muted">{c.name}</span>
                </span>
                <span className="mt-1 block"><StatusMark status={c.status} /></span>
                <span className="mt-1 block text-muted">{c.reason}</span>
              </span>
              <ChevronRight className="shrink-0 text-muted" aria-hidden />
            </Link>
          </li>
        ))}
      </ul>
    </main>
  );
}
