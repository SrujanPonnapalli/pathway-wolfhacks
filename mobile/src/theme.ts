// Pathway palette, ported from src/app/globals.css. One job per color:
// teal = actions and "on track", sun = "worth a check-in" only, sky = Viva (the AI),
// flame = streak, grape = study buddies, ink/muted/line/polar = everything else.
export const colors = {
  ground: "#ffffff",
  polar: "#f6f7f4",
  line: "#e3e6e2",
  ink: "#33383d",
  muted: "#5e646b",

  teal: "#0a7f72",
  tealInk: "#053d36",
  tealLip: "#075e55",
  tealFace: "#1cc7b1",
  tealSoft: "#ddf4ef",

  sun: "#ffc531",
  sunInk: "#6b4500",
  sunSoft: "#fff4d6",

  sky: "#1a6fd1",
  skyLip: "#12509a",
  skySoft: "#e6f1fd",

  flame: "#ff8a1f",
  flameInk: "#7a3a00",
  flameSoft: "#ffebd6",

  grape: "#7c4ddb",
  grapeSoft: "#f0e9fd",
} as const;

export const radius = { tile: 16, card: 20, pill: 999 };

export const font = {
  // iOS system font (SF Pro) — the native-feeling choice; bold weights carry the Nunito-esque friendliness.
  regular: "600" as const,
  bold: "700" as const,
  heavy: "800" as const,
  black: "900" as const,
};
