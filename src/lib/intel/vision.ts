// Device camera awareness: one still frame from the kiosk webcam -> one small structured
// observation. Scene-level facts only — what is plainly visible, never anything inferred
// about the person (no identity, emotion, stress, age, gender, race, health, intelligence,
// or attention guessed from a face). Frames are analyzed and dropped; nothing is stored.

import { Type, type Schema } from "@google/genai";
import { filePart, generateJSON, textPart } from "../gemini";

export type Activity = "studying" | "on_phone" | "idle" | "away" | "unknown";

export type Observation = {
  personPresent: boolean;
  studyMaterialsVisible: boolean;
  phoneVisible: boolean;
  activity: Activity;
};

const schema: Schema = {
  type: Type.OBJECT,
  required: ["personPresent", "studyMaterialsVisible", "phoneVisible", "activity"],
  properties: {
    personPresent: { type: Type.BOOLEAN, description: "a person is at the desk in this frame" },
    studyMaterialsVisible: {
      type: Type.BOOLEAN,
      description: "study materials are visible: open books, notebooks, papers, or a laptop being used",
    },
    phoneVisible: { type: Type.BOOLEAN, description: "a phone is visible in the frame" },
    activity: {
      type: Type.STRING,
      enum: ["studying", "on_phone", "idle", "away", "unknown"],
      description: "the plainly observable activity: studying, on_phone, idle (present but neither), away (no person), unknown",
    },
  },
};

const SYSTEM = `You are the ambient camera on a study-companion device. From a single frame,
report only plainly observable scene-level facts: whether a person is at the desk, whether
study materials are visible, whether a phone is visible, and a one-word activity label.
Never infer or describe identity, emotion, stress, age, gender, race, health, intelligence,
or attention from a face or posture. If something is not clearly visible, answer false or
"unknown" rather than guessing.`;

export function observeScene(frame: Buffer, mimeType: string) {
  return generateJSON<Observation>({
    parts: [filePart(frame, mimeType), textPart("Report what is plainly visible in this frame.")],
    schema,
    system: SYSTEM,
    tier: "fast",
  });
}
