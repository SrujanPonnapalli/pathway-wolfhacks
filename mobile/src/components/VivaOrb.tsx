// Viva, on mobile: the same face the web app draws (eyePath/mouthPath/LOOKS ported from
// src/components/Viva.tsx) over a soft blue orb built from layered SVG circles, since
// orb-ui's canvas shader is web-only. States: idle, listening, thinking, speaking.
import React, { useEffect, useRef, useState } from "react";
import { Animated, Easing, View } from "react-native";
import Svg, { Circle, Defs, Path, RadialGradient, Stop } from "react-native-svg";
import { colors } from "../theme";

export type VivaState = "idle" | "listening" | "thinking" | "speaking";

type Eye = { w: number; top: number; bottom: number; tilt?: number; skew?: number };
type Mouth = { l: [number, number]; r: [number, number]; top: [number, number]; bottom: [number, number]; round?: boolean };
type Look = { left: Eye; right: Eye; mouth: Mouth };

const eyePath = (cx: number, cy: number, side: -1 | 1, e: Eye) => {
  const t = (e.tilt ?? 0) * side;
  const [lx, ly, rx, ry] = [cx - e.w, cy + t, cx + e.w, cy - t];
  const k = e.w * 0.92;
  const sk = e.skew ?? 0;
  return `M${lx} ${ly} C${cx - k + sk} ${cy - e.top * 1.33} ${cx + k + sk} ${cy - e.top * 1.33} ${rx} ${ry} C${cx + k} ${cy + e.bottom * 1.33} ${cx - k} ${cy + e.bottom * 1.33} ${lx} ${ly}Z`;
};

const mouthPath = ({ l: [lx, ly], r: [rx, ry], top, bottom, round }: Mouth) => {
  const a = round ? lx : lx + (rx - lx) / 3;
  const b = round ? rx : lx + (2 * (rx - lx)) / 3;
  return `M${lx} ${ly} C${a} ${ly + top[0]} ${b} ${ry + top[1]} ${rx} ${ry} C${b} ${ry + bottom[1]} ${a} ${ly + bottom[0]} ${lx} ${ly}Z`;
};

const eye = (w: number, top: number, bottom: number, tilt = 0): Eye => ({ w, top, bottom, tilt });

const LOOKS: Record<string, Look> = {
  smile: { left: eye(8, 10, 10), right: eye(8, 10, 10), mouth: { l: [34, 64], r: [66, 64], top: [3.5, 3.5], bottom: [10.5, 10.5] } },
  content: { left: eye(8.5, 3.5, 9, -0.5), right: eye(8.5, 3.5, 9, -0.5), mouth: { l: [37, 65], r: [63, 65], top: [3, 3], bottom: [8, 8] } },
};
const STATE_LOOKS: Record<Exclude<VivaState, "speaking" | "idle">, Look> = {
  listening: { left: eye(8.5, 12, 11.5), right: eye(8.5, 12, 11.5), mouth: { l: [38, 65], r: [62, 65], top: [3, 3], bottom: [9, 9] } },
  thinking: { left: eye(8, 11.5, 6), right: eye(7.5, 7.5, 5, 1.5), mouth: { l: [42, 68], r: [58, 66], top: [-1.5, 1.5], bottom: [3, 4] } },
};
const speakingLook = (out: number): Look => ({
  left: eye(8, 10.5, 10),
  right: eye(8, 10.5, 10),
  mouth: { l: [42, 65], r: [58, 65], top: [-2 - out * 3, -2 - out * 3], bottom: [4 + out * 11, 4 + out * 11], round: true },
});
const BLINK = (e: Eye): Eye => ({ ...e, top: 0.7, bottom: 0.7 });

export function VivaOrb({ size = 96, state = "idle" }: { size?: number; state?: VivaState }) {
  const [blink, setBlink] = useState(false);
  const [out, setOut] = useState(0);
  const breath = useRef(new Animated.Value(0)).current;
  const pulse = useRef(new Animated.Value(0)).current;

  // Gentle idle breathing.
  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(breath, { toValue: 1, duration: 2200, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
        Animated.timing(breath, { toValue: 0, duration: 2200, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [breath]);

  // Listening pulses outward; speaking oscillates.
  useEffect(() => {
    if (state !== "listening" && state !== "speaking") {
      pulse.setValue(0);
      return;
    }
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, { toValue: 1, duration: state === "listening" ? 900 : 350, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
        Animated.timing(pulse, { toValue: 0, duration: state === "listening" ? 900 : 350, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [state, pulse]);

  // Random blinks, sometimes a double.
  useEffect(() => {
    let t: ReturnType<typeof setTimeout>;
    const loop = () => {
      t = setTimeout(() => {
        setBlink(true);
        setTimeout(() => setBlink(false), 140);
        if (Math.random() < 0.2) setTimeout(() => (setBlink(true), setTimeout(() => setBlink(false), 120)), 300);
        loop();
      }, 2400 + Math.random() * 3000);
    };
    loop();
    return () => clearTimeout(t);
  }, []);

  // Speaking mouth: animate the "o" opening like audio output.
  useEffect(() => {
    if (state !== "speaking") {
      setOut(0);
      return;
    }
    const t0 = Date.now();
    const i = setInterval(() => {
      const s = (Date.now() - t0) / 1000;
      setOut(Math.max(0, Math.min(1, 0.55 + 0.45 * Math.sin(s * 9) * Math.sin(s * 3.7))));
    }, 50);
    return () => clearInterval(i);
  }, [state]);

  const look = state === "speaking" ? speakingLook(out) : state === "idle" ? LOOKS.smile : STATE_LOOKS[state];
  const L = blink ? BLINK(look.left) : look.left;
  const R = blink ? BLINK(look.right) : look.right;
  const tilt = state === "listening" ? 4 : state === "thinking" ? -3 : 0;

  const scale = Animated.multiply(
    breath.interpolate({ inputRange: [0, 1], outputRange: [1, 1.035] }),
    pulse.interpolate({ inputRange: [0, 1], outputRange: [1, state === "listening" ? 1.07 : 1.03] }),
  );

  return (
    <View style={{ width: size, height: size }}>
      <Animated.View style={{ position: "absolute", inset: 0, transform: [{ scale }] }}>
        <Svg width={size} height={size} viewBox="0 0 100 100">
          <Defs>
            <RadialGradient id="viva-body" cx="42%" cy="36%" r="68%">
              <Stop offset="0%" stopColor="#a3cbf7" />
              <Stop offset="45%" stopColor="#4a92ec" />
              <Stop offset="100%" stopColor="#2f80e4" />
            </RadialGradient>
          </Defs>
          {/* soft outer glow ring while listening/speaking */}
          <Circle cx="50" cy="50" r="48" fill={colors.sky} opacity={0.12} />
          <Circle cx="50" cy="50" r="41" fill="url(#viva-body)" />
          {/* cloud-like inner shading */}
          <Circle cx="38" cy="34" r="16" fill="#ffffff" opacity={0.22} />
          <Circle cx="64" cy="66" r="20" fill="#12509a" opacity={0.16} />
          <Face tilt={tilt} left={eyePath(36, 40, -1, L)} right={eyePath(64, 40, 1, R)} mouth={mouthPath(look.mouth)} />
        </Svg>
      </Animated.View>
    </View>
  );
}

function Face({ tilt, left, right, mouth }: { tilt: number; left: string; right: string; mouth: string }) {
  return (
    <>
      <Path d={left} fill="#fff" stroke="#fff" strokeWidth={1.6} strokeLinejoin="round" rotation={tilt} origin="50, 50" />
      <Path d={right} fill="#fff" stroke="#fff" strokeWidth={1.6} strokeLinejoin="round" rotation={tilt} origin="50, 50" />
      <Path d={mouth} fill="#fff" stroke="#fff" strokeWidth={1.6} strokeLinejoin="round" rotation={tilt} origin="50, 50" />
    </>
  );
}

// Static glyph for tab icon and message rows.
export function VivaGlyph({ size = 24, color = colors.sky }: { size?: number; color?: string }) {
  const s = LOOKS.smile;
  return (
    <Svg width={size} height={size} viewBox="0 0 100 100">
      <Circle cx="50" cy="50" r="46" fill={color} />
      <Path d={eyePath(36, 40, -1, s.left)} fill="#fff" stroke="#fff" strokeWidth={2} strokeLinejoin="round" />
      <Path d={eyePath(64, 40, 1, s.right)} fill="#fff" stroke="#fff" strokeWidth={2} strokeLinejoin="round" />
      <Path d={mouthPath(s.mouth)} fill="#fff" stroke="#fff" strokeWidth={2} strokeLinejoin="round" />
    </Svg>
  );
}
