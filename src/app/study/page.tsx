import { PageHeader, Todo } from "@/components/ui";

export default function Page() {
  return (
    <main className="mx-auto max-w-3xl px-4 py-6 md:px-10 md:py-10">
      <PageHeader title="Study" lead="Quizzes, flashcards and focus sessions. Every one updates your status." />
      <div className="space-y-4">
        <Todo what="Practice quiz from your slides" wire="/api/syllabus → Gemini quiz generation; log to /api/events (kind: quiz)" />
        <Todo what="Flashcards" wire="Gemini-generated deck; log reviews to /api/events" />
        <Todo what="Viva: answer out loud" wire="/api/tts + /api/stt (ElevenLabs)" />
        <Todo what="Focus timer" wire="start/stop → /api/events (kind: study, minutes). The puck posts here too." />
      </div>
    </main>
  );
}
