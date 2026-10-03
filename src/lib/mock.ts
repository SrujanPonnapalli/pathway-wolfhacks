// Hardcoded demo content. Every screen reads from here, so wiring a backend
// means swapping these exports for fetches (/api/...) or the in-browser tree.

export type Status = "on_track" | "check_in";

export type Course = {
  slug: string;
  code: string;
  name: string;
  status: Status;
  reason: string; // plain-English tree path, from src/lib/tree.ts once wired
  nextExam: string;
};

export const student = { name: "Maya", streakDays: 4 };

export const courses: Course[] = [
  {
    slug: "bio-181",
    code: "BIO 181",
    name: "Intro Biology",
    status: "check_in",
    reason: "You usually start exam prep 2 days out, and attendance is at 68%.",
    nextExam: "Midterm · Fri, Oct 10",
  },
  {
    slug: "st-311",
    code: "ST 311",
    name: "Intro to Statistics",
    status: "on_track",
    reason: "Steady weekly study hours and every deadline submitted on time.",
    nextExam: "Midterm · Tue, Oct 14",
  },
  {
    slug: "csc-216",
    code: "CSC 216",
    name: "Software Development",
    status: "on_track",
    reason: "Practice quiz average is 84% and you start projects early.",
    nextExam: "Exam 1 · Thu, Oct 16",
  },
  {
    slug: "eng-101",
    code: "ENG 101",
    name: "Academic Writing",
    status: "on_track",
    reason: "Attendance is 95% and no missed deadlines.",
    nextExam: "Essay 2 · Mon, Oct 13",
  },
];

export const headsUp = {
  course: "bio-181",
  title: "Heads up: BIO 181 is worth a check-in",
  body: "Your midterm is in 7 days. Students with a similar pattern often do better when they start reviewing a week out.",
  suggestions: ["What should I focus on this week?", "Make me a BIO 181 study plan", "Quiz me on cell respiration"],
};

export const featuredStudy = {
  tool: "quiz",
  course: "BIO 181",
  title: "Cell respiration practice quiz",
  detail: "10 questions from your Week 5 slides",
  minutes: 5,
};

export const studyTools = [
  { tool: "flashcards", title: "Flashcards", detail: "24 cards due" },
  { tool: "viva", title: "Viva", detail: "Answer out loud" },
  { tool: "timer", title: "Focus timer", detail: "Log a session" },
] as const;

export const week = [
  { day: "Mon", date: 6, busy: 2 },
  { day: "Tue", date: 7, busy: 3 },
  { day: "Wed", date: 8, busy: 1 },
  { day: "Thu", date: 9, busy: 3 },
  { day: "Fri", date: 10, busy: 2 },
  { day: "Sat", date: 11, busy: 0 },
  { day: "Sun", date: 12, busy: 1 },
];
export const todayIndex = 0;

export type AgendaItem = { time: string; title: string; kind: "class" | "study" | "due"; href: string };
export const agenda: AgendaItem[] = [
  { time: "9:35", title: "BIO 181 lecture", kind: "class", href: "/courses/bio-181" },
  { time: "1:00", title: "Study block: BIO 181 review", kind: "study", href: "/study?tool=quiz&course=bio-181" },
  { time: "11:59", title: "ST 311 HW 4 due", kind: "due", href: "/courses/st-311" },
];

export type Todo = { id: string; title: string; detail: string; href: string; done: boolean };
export const todos: Todo[] = [
  { id: "t1", title: "Confirm 3 dates from your BIO 181 syllabus", detail: "Found in the PDF you uploaded", href: "/courses/bio-181", done: false },
  { id: "t2", title: "Submit ST 311 HW 4", detail: "Due tonight, 11:59 PM", href: "/courses/st-311", done: false },
  { id: "t3", title: "Review 24 CSC 216 flashcards", detail: "About 10 minutes", href: "/study?tool=flashcards&course=csc-216", done: false },
  { id: "t4", title: "Check in to ENG 101", detail: "Done at 8:30 AM", href: "/courses/eng-101", done: true },
];
