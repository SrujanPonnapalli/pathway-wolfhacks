"use client";

import Image from "next/image";
import Link from "next/link";
import { useEffect, useState } from "react";
import {
  ArrowDownRight, ArrowRight, BookOpen, CalendarDays, Check, ChevronRight,
  Headphones, LockKeyhole, MapPinned, MessageCircleMore, Sparkles,
} from "lucide-react";

const turns = [
  {
    label: "Notice",
    heading: "Catch the turn early.",
    body: "Quizzes, check-ins, deadlines, and study sessions add up to a clearer picture of each course.",
    detail: "One course is worth a check-in",
    tone: "sun",
  },
  {
    label: "Understand",
    heading: "See the exact reason.",
    body: "Follow the decision tree's path in plain language. Explore habits you can change, without treating a prediction like a promise.",
    detail: "Here's the path behind it",
    tone: "sky",
  },
  {
    label: "Act",
    heading: "Give the next step a time.",
    body: "Turn a useful suggestion into a study block in your week. Adjust it, approve it, and get on with your day.",
    detail: "Tuesday, 4:30 PM: practice quiz",
    tone: "teal",
  },
] as const;

function Mark({ size = 38 }: { size?: number }) {
  return (
    <svg className="landing-mark" width={size} height={size} viewBox="0 0 40 40" fill="none" aria-hidden="true">
      <path d="M10 35C10 27 30 27 30 20S10 13 10 5" stroke="currentColor" strokeWidth="4.5" strokeLinecap="round" strokeDasharray="1 8" />
      <circle cx="10" cy="5" r="4.5" fill="#FFC531" />
      <circle cx="10" cy="35" r="4.5" fill="currentColor" />
    </svg>
  );
}

function RouteStory() {
  const [active, setActive] = useState(0);
  const turn = turns[active];

  return (
    <div className="landing-route-story">
      <div className="landing-route-steps" role="tablist" aria-label="How Pathway works">
        {turns.map((item, index) => (
          <button
            key={item.label}
            id={`route-tab-${index}`}
            role="tab"
            aria-selected={active === index}
            aria-controls="route-panel"
            className={`landing-route-step ${active === index ? "is-active" : ""}`}
            onClick={() => setActive(index)}
          >
            <span className="landing-route-index">{index + 1}</span>
            <span>{item.label}</span>
          </button>
        ))}
      </div>
      <div className="landing-route-line" aria-hidden="true"><span style={{ width: `${(active + 1) * 33.333}%` }} /></div>
      <div id="route-panel" role="tabpanel" aria-labelledby={`route-tab-${active}`} className="landing-route-panel" key={active}>
        <div className="landing-route-copy">
          <h3>{turn.heading}</h3>
          <p>{turn.body}</p>
        </div>
        <div className={`landing-route-signal landing-route-signal-${turn.tone}`}>
          {active === 0 ? <MapPinned size={30} strokeWidth={2} /> : active === 1 ? <BookOpen size={30} strokeWidth={2} /> : <CalendarDays size={30} strokeWidth={2} />}
          <span>{turn.detail}</span>
          <Check size={18} strokeWidth={3} className="landing-route-check" />
        </div>
      </div>
    </div>
  );
}

export default function LandingPage() {
  useEffect(() => {
    const root = document.querySelector(".landing");
    if (!root) return;
    const nodes = root.querySelectorAll<HTMLElement>("[data-reveal]");
    if (!("IntersectionObserver" in window) || window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      nodes.forEach((node) => node.classList.add("is-visible"));
      return;
    }
    root.classList.add("motion-ready");
    const observer = new IntersectionObserver((entries) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting) {
          entry.target.classList.add("is-visible");
          observer.unobserve(entry.target);
        }
      });
    }, { threshold: 0.14 });
    nodes.forEach((node) => observer.observe(node));
    return () => observer.disconnect();
  }, []);

  return (
    <main className="landing">
      <header className="landing-header">
        <div className="landing-shell landing-nav">
          <Link href="/landing" className="landing-wordmark" aria-label="Pathway landing page"><Mark /> <span>pathway</span></Link>
          <nav aria-label="Landing page">
            <a href="#how-it-works">How it works</a>
            <a href="#viva">Meet Viva</a>
            <a href="#inside">Inside Pathway</a>
          </nav>
          <Link className="landing-nav-cta" href="/">Open the app <ArrowRight size={17} aria-hidden="true" /></Link>
        </div>
      </header>

      <section className="landing-hero landing-shell" aria-labelledby="landing-title">
        <div className="landing-hero-copy">
          <p className="landing-eyebrow">A clearer way through the semester</p>
          <h1 id="landing-title">Know your<br /><em>next move.</em></h1>
          <p className="landing-hero-description">When a class starts to slip, Pathway shows you why and helps put a plan on the calendar.</p>
          <div className="landing-hero-actions">
            <Link href="/" className="landing-button landing-button-primary">Open Pathway <ArrowRight size={21} aria-hidden="true" /></Link>
            <a href="#how-it-works" className="landing-text-link">See how it works <ArrowDownRight size={20} aria-hidden="true" /></a>
          </div>
        </div>
        <div className="landing-hero-photo">
          <Image src="/landing/desk-route.jpg" alt="Open notes and a weekly planner connected by a teal line on a sunlit study desk" fill priority sizes="(max-width: 850px) 100vw, 56vw" />
        </div>
      </section>

      <section id="how-it-works" className="landing-way landing-shell" aria-labelledby="way-title">
        <div className="landing-way-intro" data-reveal>
          <p className="landing-eyebrow">A route, not a verdict</p>
          <h2 id="way-title">From “something feels off”<br />{" "}to “I know what to do.”</h2>
          <p>Pathway connects the dots between your course activity, the reason for a check-in, and a next step you can actually take.</p>
        </div>
        <div data-reveal><RouteStory /></div>
      </section>

      <section className="landing-week" aria-labelledby="week-title">
        <div className="landing-shell landing-week-grid">
          <div className="landing-week-head" data-reveal>
            <h2 id="week-title">The advice lands<br /><em>in your week.</em></h2>
            <p>No more vague “study more.” Pathway can help place practice, review, and prep around the commitments already on your calendar.</p>
            <Link href="/calendar" className="landing-inline-link">Explore the week <ArrowRight size={20} aria-hidden="true" /></Link>
          </div>
          <div className="landing-week-art" data-reveal aria-label="Illustration of a study plan moving into a weekly calendar">
            <div className="landing-week-art-top"><span>MAKE IT REAL</span><span>ILLUSTRATIVE WEEK</span></div>
            <div className="landing-week-art-grid" aria-hidden="true">
              {["M", "T", "W", "T", "F"].map((d, i) => <span className="landing-week-day" key={i}>{d}</span>)}
              <span className="landing-week-blank" /><span className="landing-week-block study">Practice quiz<br /><small>4:30 PM</small></span><span className="landing-week-blank" /><span className="landing-week-block class">BIO 181<br /><small>11:00 AM</small></span><span className="landing-week-blank" />
              <span className="landing-week-block class">CSC 216<br /><small>9:30 AM</small></span><span className="landing-week-blank" /><span className="landing-week-block study">Review notes<br /><small>5:00 PM</small></span><span className="landing-week-blank" /><span className="landing-week-block sun">Exam prep<br /><small>3:00 PM</small></span>
            </div>
            <div className="landing-week-art-bottom"><span className="landing-week-pulse" /> A place for the next step</div>
          </div>
        </div>
      </section>

      <section id="viva" className="landing-viva landing-shell" aria-labelledby="viva-title">
        <div className="landing-viva-photo" data-reveal>
          <Image src="/landing/viva-study.jpg" alt="A student talking through notes during a study session" fill sizes="(max-width: 800px) 100vw, 43vw" />
        </div>
        <div className="landing-viva-copy" data-reveal>
          <span className="landing-viva-orb" aria-hidden="true"><span /></span>
          <p className="landing-eyebrow">Meet Viva</p>
          <h2 id="viva-title">A study partner<br />who knows the course.</h2>
          <p>Talk through a tough concept, practice out loud, or ask what to tackle first. Viva can draw on your course materials and show where an answer came from.</p>
          <div className="landing-viva-points">
            <span><MessageCircleMore size={20} aria-hidden="true" /> Chat when you need a nudge</span>
            <span><Headphones size={20} aria-hidden="true" /> Speak when typing feels like work</span>
          </div>
          <Link href="/viva" className="landing-inline-link">Meet Viva in the app <ArrowRight size={20} aria-hidden="true" /></Link>
        </div>
      </section>

      <section id="inside" className="landing-inside landing-shell" aria-labelledby="inside-title">
        <div className="landing-inside-heading" data-reveal>
          <h2 id="inside-title">The small things<br />that make a semester easier.</h2>
        </div>
        <div className="landing-features">
          <article className="landing-feature landing-feature-teal" data-reveal>
            <BookOpen size={30} strokeWidth={1.8} aria-hidden="true" />
            <h3>Study tools that listen back.</h3>
            <p>Quizzes, flashcards, and study sessions update your course picture as you work.</p>
          </article>
          <article className="landing-feature landing-feature-sky" data-reveal>
            <Sparkles size={30} strokeWidth={1.8} aria-hidden="true" />
            <h3>Course context, together.</h3>
            <p>Bring in syllabi and course materials. Review extracted facts before they become part of the plan.</p>
          </article>
          <article className="landing-feature landing-feature-white" data-reveal>
            <CalendarDays size={30} strokeWidth={1.8} aria-hidden="true" />
            <h3>One week you can work with.</h3>
            <p>See classes, due dates, and study blocks in one place. Calendar changes wait for your approval.</p>
          </article>
        </div>
      </section>

      <section className="landing-trust landing-shell" aria-labelledby="trust-title" data-reveal>
        <div className="landing-trust-icon"><LockKeyhole size={26} aria-hidden="true" /></div>
        <div>
          <h2 id="trust-title">A little more clarity. A lot less judgment.</h2>
          <p>Your course status is calculated on your device. The decision path is visible, and Pathway keeps advice focused on choices you can make. The current model was evaluated on synthetic data; its results are a prototype, not a guarantee.</p>
        </div>
      </section>

      <section className="landing-final" aria-labelledby="final-title">
        <div className="landing-shell landing-final-content" data-reveal>
          <div className="landing-final-mark"><Mark size={64} /></div>
          <h2 id="final-title">You have a way forward.</h2>
          <p>See where you stand. Understand why. Make the next move yours.</p>
          <Link href="/" className="landing-button landing-button-light">Open Pathway <ArrowRight size={21} aria-hidden="true" /></Link>
        </div>
      </section>

      <footer className="landing-footer landing-shell">
        <Link href="/landing" className="landing-wordmark"><Mark size={30} /><span>pathway</span></Link>
        <p>One step at a time.</p>
        <Link href="/">Go to the app <ChevronRight size={16} aria-hidden="true" /></Link>
      </footer>
    </main>
  );
}
