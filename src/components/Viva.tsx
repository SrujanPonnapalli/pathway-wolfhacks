"use client";

import { useEffect, useId, useRef, useState } from "react";
import { Orb, type OrbState } from "orb-ui";

// Viva = orb-ui's cloud shader (the body, in the AI sky palette) + a face we draw on top.
// The face has its own life: it blinks, turns to glance around (or at your cursor), and its
// eye and mouth shapes morph between expressions; listening, thinking and speaking each have a look.

const CLOUD = {
  // Tight range around one blue so the cloud's swirl stays subtle behind the face.
  deepColor: "#2f80e4",
  upperColor: "#4a92ec",
  lowerColor: "#79b1f3",
  highlightColor: "#a3cbf7",
  launchColor: "#12509a",
  spinnerColor: "#3b8eea",
};

type Signal = { state: OrbState; input?: number; output?: number };

// Eyes and mouth are closed shapes built from the same commands, so CSS can morph one
// expression into another (d transitions). Eye: two arcs between a left and right corner;
// `top`/`bottom` are arc heights (a negative bottom bends up into a happy crescent), `tilt`
// raises the outer corner (negative = sad), `w` is half-width.
type Eye = { w: number; top: number; bottom: number; tilt?: number; skew?: number };
type Mouth = { l: [number, number]; r: [number, number]; top: [number, number]; bottom: [number, number]; round?: boolean };
type Look = { left: Eye; right: Eye; mouth: Mouth };

export const eyePath = (cx: number, cy: number, side: -1 | 1, e: Eye) => {
  const t = (e.tilt ?? 0) * side;
  const [lx, ly, rx, ry] = [cx - e.w, cy + t, cx + e.w, cy - t];
  const k = e.w * 0.92; // controls near the corners give rounded sides, not lemon points
  const sk = e.skew ?? 0; // shifts the top of the eye sideways, so it leans toward the gaze
  return `M${lx} ${ly} C${cx - k + sk} ${cy - e.top * 1.33} ${cx + k + sk} ${cy - e.top * 1.33} ${rx} ${ry} C${cx + k} ${cy + e.bottom * 1.33} ${cx - k} ${cy + e.bottom * 1.33} ${lx} ${ly}Z`;
};
export const mouthPath = ({ l: [lx, ly], r: [rx, ry], top, bottom, round }: Mouth) => {
  // `round` puts the controls over the corners so a small mouth becomes an "o", not a diamond.
  const a = round ? lx : lx + (rx - lx) / 3;
  const b = round ? rx : lx + (2 * (rx - lx)) / 3;
  return `M${lx} ${ly} C${a} ${ly + top[0]} ${b} ${ry + top[1]} ${rx} ${ry} C${b} ${ry + bottom[1]} ${a} ${ly + bottom[0]} ${lx} ${ly}Z`;
};

const eye = (w: number, top: number, bottom: number, tilt = 0): Eye => ({ w, top, bottom, tilt });
export const LOOKS: Record<string, Look> = {
  smile: { left: eye(8, 10, 10), right: eye(8, 10, 10), mouth: { l: [34, 64], r: [66, 64], top: [3.5, 3.5], bottom: [10.5, 10.5] } },
  grin: { left: eye(8.5, 8.5, -3), right: eye(8.5, 8.5, -3), mouth: { l: [33, 62], r: [67, 62], top: [2, 2], bottom: [16, 16] } },
  curious: { left: eye(8.5, 12.5, 11.5), right: eye(7.5, 7, 9, 1), mouth: { l: [45, 67], r: [55, 67], top: [-6.5, -6.5], bottom: [6.5, 6.5], round: true } },
  smirk: { left: eye(8, 6.5, 9.5, 1), right: eye(8, 8, 10, 2), mouth: { l: [38, 67], r: [65, 61], top: [2.5, 1], bottom: [7, 9] } },
  content: { left: eye(8.5, 3.5, 9, -0.5), right: eye(8.5, 3.5, 9, -0.5), mouth: { l: [37, 65], r: [63, 65], top: [3, 3], bottom: [8, 8] } },
};
export const STATE_LOOKS: Partial<Record<OrbState, Look>> = {
  listening: { left: eye(8.5, 12, 11.5), right: eye(8.5, 12, 11.5), mouth: { l: [38, 65], r: [62, 65], top: [3, 3], bottom: [9, 9] } },
  thinking: { left: eye(8, 11.5, 6), right: eye(7.5, 7.5, 5, 1.5), mouth: { l: [42, 68], r: [58, 66], top: [-1.5, 1.5], bottom: [3, 4] } },
  connecting: { left: eye(8, 11.5, 6), right: eye(7.5, 7.5, 5, 1.5), mouth: { l: [42, 68], r: [58, 66], top: [-1.5, 1.5], bottom: [3, 4] } },
  error: { left: eye(8, 7.5, 9, -2.5), right: eye(8, 7.5, 9, -2.5), mouth: { l: [38, 71], r: [62, 71], top: [-8, -8], bottom: [-3, -3] } },
};
export const speakingLook = (out: number): Look => ({
  left: eye(8, 10.5, 10),
  right: eye(8, 10.5, 10),
  mouth: { l: [42, 65], r: [58, 65], top: [-2 - out * 3, -2 - out * 3], bottom: [4 + out * 11, 4 + out * 11], round: true },
});
const BLINK = (e: Eye): Eye => ({ ...e, top: 0.7, bottom: 0.7 });

const rand = (a: number, b: number) => a + Math.random() * (b - a);
const pick = <T,>(xs: T[]) => xs[Math.floor(Math.random() * xs.length)];
const prefersReducedMotion = () => typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;

function useLife(state: OrbState, ref: React.RefObject<HTMLDivElement | null>) {
  const [blink, setBlink] = useState(false);
  const [gaze, setGaze] = useState<[number, number]>([0, 0]);
  const [mood, setMood] = useState("smile");
  const tracking = useRef(0); // when we last followed the cursor

  // Blink at random intervals, sometimes twice.
  useEffect(() => {
    if (prefersReducedMotion()) return;
    let t: ReturnType<typeof setTimeout>;
    const loop = () => {
      t = setTimeout(() => {
        setBlink(true);
        setTimeout(() => setBlink(false), 140);
        if (Math.random() < 0.2) setTimeout(() => (setBlink(true), setTimeout(() => setBlink(false), 120)), 300);
        loop();
      }, rand(2400, 5400));
    };
    loop();
    return () => clearTimeout(t);
  }, []);

  // Where to look (the whole face turns): thinking glances up and side to side; idle wanders unless following the cursor.
  useEffect(() => {
    if (prefersReducedMotion()) return;
    let t: ReturnType<typeof setTimeout>;
    const loop = () => {
      const following = performance.now() - tracking.current < 1500;
      if (state === "thinking" || state === "connecting") setGaze(pick([[-4, -3.5], [4, -3.5], [0, -4.5]]));
      else if (state === "listening") setGaze([rand(-1, 1), 1.5]);
      else if (state === "speaking") setGaze([rand(-2, 2), rand(-1, 1)]);
      else if (!following) setGaze(Math.random() < 0.35 ? [0, 0] : [rand(-4.5, 4.5), rand(-3.5, 3)]);
      t = setTimeout(loop, state === "thinking" ? rand(700, 1100) : rand(1300, 3200));
    };
    loop();
    return () => clearTimeout(t);
  }, [state]);

  // Drift between resting expressions.
  useEffect(() => {
    if (prefersReducedMotion() || state !== "idle") return;
    let t: ReturnType<typeof setTimeout>;
    const loop = () => {
      t = setTimeout(() => {
        setMood((m) => pick(Object.keys(LOOKS).filter((k) => k !== m)));
        loop();
      }, rand(3000, 6000));
    };
    loop();
    return () => clearTimeout(t);
  }, [state]);

  // Look toward the cursor when it's nearby (idle only).
  useEffect(() => {
    if (prefersReducedMotion() || state !== "idle") return;
    let raf = 0;
    const onMove = (e: PointerEvent) => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(() => {
        const el = ref.current;
        if (!el) return;
        const r = el.getBoundingClientRect();
        const dx = e.clientX - (r.left + r.width / 2);
        const dy = e.clientY - (r.top + r.height / 2);
        const d = Math.hypot(dx, dy);
        if (d > 520) return;
        tracking.current = performance.now();
        const k = Math.min(1, d / 160) / (d || 1);
        setGaze([dx * k * 4.5, dy * k * 4]);
      });
    };
    window.addEventListener("pointermove", onMove);
    return () => (window.removeEventListener("pointermove", onMove), cancelAnimationFrame(raf));
  }, [state, ref]);

  // Breathing: the eyes slowly swell and settle by a small random amount, so they never sit still.
  const [breath, setBreath] = useState(0);
  useEffect(() => {
    if (prefersReducedMotion()) return;
    let t: ReturnType<typeof setTimeout>;
    const loop = () => {
      t = setTimeout(() => (setBreath(rand(-1, 1.2)), loop()), rand(900, 1800));
    };
    loop();
    return () => clearTimeout(t);
  }, []);

  return { blink, gaze, mood, breath };
}

function Face({ state, input = 0, output = 0 }: Signal) {
  const ref = useRef<HTMLDivElement>(null);
  const shadowId = `viva-shadow-${useId().replace(/[^a-zA-Z0-9_-]/g, "")}`;
  const { blink, gaze, mood, breath } = useLife(state, ref);
  const speaking = state === "speaking";
  const look = speaking ? speakingLook(output) : (STATE_LOOKS[state] ?? LOOKS[mood]);
  const [gx, gy] = gaze;
  const widen = (state === "listening" ? input * 2.5 : 0) + breath * 0.6;
  // Each eye's top leans toward the gaze and the eye on the looking side opens a touch more.
  const live = (e: Eye, side: -1 | 1): Eye =>
    blink ? BLINK(e) : { ...e, top: Math.max(1, e.top + widen + gx * side * 0.1), bottom: e.bottom + breath * 0.3, skew: gx * 0.4 };
  const L = live(look.left, -1);
  const R = live(look.right, 1);
  const tilt = state === "listening" ? 4 : state === "thinking" ? -3 : mood === "curious" && state === "idle" ? 5 : 0;
  // The face sits on the sphere, so it breathes with the cloud's scale.
  const scale = state === "listening" ? 1 - input * 0.12 : speaking ? 1 + output * 0.12 : 1;
  const ease = "cubic-bezier(.3,.7,.2,1)";
  const springy = "cubic-bezier(.34,1.45,.64,1)"; // slight overshoot so shapes settle like jelly
  const shape = (ms: number, curve = ease) => ({ transition: `d ${ms}ms ${curve}` });

  return (
    <div ref={ref} className="viva-face absolute inset-[9%]" style={{ transform: `scale(${scale})`, transition: "transform 120ms ease-out" }}>
      <svg viewBox="0 0 100 100" className="size-full overflow-visible" aria-hidden>
        <defs>
          {/* Soft navy shadow so the white features read on the light parts of the cloud. */}
          <filter id={shadowId} x="-20%" y="-20%" width="140%" height="140%">
            <feDropShadow dx="0" dy="1.2" stdDeviation="1.6" floodColor="#0b2e5c" floodOpacity="0.45" />
          </filter>
        </defs>
        <g
          filter={`url(#${shadowId})`}
          fill="#ffffff"
          stroke="#ffffff"
          strokeWidth="1.6"
          strokeLinejoin="round"
          style={{ transform: `rotate(${tilt}deg) translate(${gx * 0.8}px, ${gy * 0.7}px)`, transformOrigin: "50px 50px", transition: `transform 450ms ${ease}` }}
        >
          <path d={eyePath(36, 40, -1, L)} style={blink ? shape(100) : shape(520, springy)} />
          <path d={eyePath(64, 40, 1, R)} style={blink ? shape(100) : shape(560, springy)} />
          <path d={mouthPath(look.mouth)} style={speaking ? shape(70) : shape(420, springy)} />
        </g>
      </svg>
    </div>
  );
}

// The animated character. Size in px.
export function VivaAvatar({ size = 200, ...signal }: Signal & { size?: number }) {
  // orb-ui's cloud fades out when idle/connecting/error in passive mode; keep the body
  // in its calm "thinking" look for those and let the face carry the mood.
  const body: OrbState = signal.state === "listening" || signal.state === "speaking" ? signal.state : "thinking";
  return (
    <div className="viva-avatar relative shrink-0" style={{ width: size, height: size }}>
      <Orb
        size={size}
        interactive={false}
        signal={{ state: body, inputVolume: signal.input, outputVolume: signal.output }}
        theme={{ name: "cloud", preset: "calm", appearance: CLOUD, geometry: { diameterRatio: 0.82 } }}
        aria-hidden
      />
      <div className="viva-appear absolute inset-0">
        <Face {...signal} />
      </div>
    </div>
  );
}

// Static face for small places (nav icon, message bubbles) where a live canvas would be overkill.
export function VivaGlyph({ size = 24, className = "" }: { size?: number; className?: string }) {
  const smile = LOOKS.smile;
  return (
    <svg width={size} height={size} viewBox="0 0 100 100" className={className} aria-hidden>
      <circle cx="50" cy="50" r="46" fill="currentColor" />
      <g fill="white" stroke="white" strokeWidth="2" strokeLinejoin="round">
        <path d={eyePath(36, 40, -1, smile.left)} />
        <path d={eyePath(64, 40, 1, smile.right)} />
        <path d={mouthPath(smile.mouth)} />
      </g>
    </svg>
  );
}
