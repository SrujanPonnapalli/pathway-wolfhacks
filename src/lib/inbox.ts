// Demo inbox. For the demo, Pathway "has access" to the student's school mail; these are
// the course-related messages it would surface. Swap inboxFor() for a Gmail fetch later.
// Only mail that mentions one of the student's courses is shown; everything else stays out.

export type Mail = {
  id: string;
  course: string; // course code
  from: string;
  subject: string;
  snippet: string;
  body: string;
  at: string; // ISO
  unread: boolean;
  needsReply: boolean;
};

const ALL: Mail[] = [
  {
    id: "m1",
    course: "BIO 181",
    from: "Dr. Lena Ortiz",
    subject: "Midterm Friday: what to bring, and the review session",
    snippet: "Review session Wednesday 5 PM in Bostian 2722. Bring a pencil and your ID.",
    body: "Hi all,\n\nThe midterm covers chapters 1 through 7. There is an optional review session Wednesday at 5 PM in Bostian 2722. Bring a pencil and your student ID.\n\nIf you have a conflict with the exam time, email me by Wednesday.\n\nDr. Ortiz",
    at: "2026-10-06T07:40:00",
    unread: true,
    needsReply: false,
  },
  {
    id: "m2",
    course: "ST 311",
    from: "TA Priya Nair",
    subject: "HW 4 clarification: question 3b",
    snippet: "For 3b use the pooled variance, not the Welch version. Due tonight at 11:59 PM as planned.",
    body: "A few of you asked about 3b. Use the pooled variance formula from lecture 9, not the Welch version. The deadline is unchanged: tonight, 11:59 PM.\n\nPriya",
    at: "2026-10-06T08:15:00",
    unread: true,
    needsReply: false,
  },
  {
    id: "m3",
    course: "CSC 216",
    from: "Prof. Daniel Reyes",
    subject: "Exam 1 location change",
    snippet: "Exam 1 on Oct 16 moves to EB2 1230. Same time.",
    body: "Exam 1 on Thursday Oct 16 will be in EB2 1230 instead of our usual room. Same time, 11:45 AM.\n\nDR",
    at: "2026-10-05T16:02:00",
    unread: false,
    needsReply: false,
  },
  {
    id: "m4",
    course: "MA 241",
    from: "TA Jordan Lee",
    subject: "Missed quiz 3: want to make it up?",
    snippet: "You were marked absent for quiz 3. If you'd like to make it up, reply with a time this week.",
    body: "Hi,\n\nYou were marked absent for quiz 3 last Thursday. If you'd like to make it up, reply with a time this week that works and I'll set it up.\n\nJordan",
    at: "2026-10-05T13:20:00",
    unread: true,
    needsReply: true,
  },
  {
    id: "m5",
    course: "ECE 200",
    from: "Dr. Sun Park",
    subject: "Problem set 5 extension policy",
    snippet: "Late work accepted until Friday with 10% off per day.",
    body: "Reminder: late work is accepted until Friday with 10% off per day. No submissions after that.\n\nDr. Park",
    at: "2026-10-06T06:50:00",
    unread: true,
    needsReply: false,
  },
  {
    id: "m6",
    course: "CH 101",
    from: "TA Maria Gomez",
    subject: "Exam 1 practice set posted",
    snippet: "A practice set is on Moodle. Office hours Tuesday 3 to 5.",
    body: "The practice set for Exam 1 is on Moodle now. I'll hold extra office hours Tuesday 3 to 5 PM.\n\nMaria",
    at: "2026-10-05T18:30:00",
    unread: true,
    needsReply: false,
  },
];

export function inboxFor(courseCodes: string[]): Mail[] {
  const set = new Set(courseCodes);
  return ALL.filter((m) => set.has(m.course)).sort((a, b) => b.at.localeCompare(a.at));
}
