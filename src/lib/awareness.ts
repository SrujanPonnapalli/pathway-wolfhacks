// The kiosk camera's latest observation, shared app-wide. /device's CameraAwareness writes
// it (one snapshot loop); coachContext() reads it when a turn is sent, so Viva sees the same
// presence facts on /device and /viva — one brain. Holds only the structured observation and
// the last derived event; camera frames never touch this. Stays in memory only, so a full
// reload or a browser with no camera simply sends no deviceContext.

import type { Observation } from "./intel/vision";

export type DeviceContext = {
  personPresent: boolean;
  studyMaterialsVisible: boolean;
  phoneVisible: boolean;
  activity: string;
  lastEvent: string | null; // last derived event, e.g. PERSON_RETURNED; sticks until the next one
  lastUpdated: string; // ISO — lets Viva judge staleness after the camera tab is gone
};

let latest: DeviceContext | null = null;

type VisionListener = (events: string[], obs: Observation) => void;
const listeners = new Set<VisionListener>();

/** Subscribe to derived transition events (PERSON_RETURNED, …) — never to raw snapshots. */
export function onVisionEvents(fn: VisionListener) {
  listeners.add(fn);
  return () => {
    listeners.delete(fn);
  };
}

export function reportObservation(obs: Observation, events: string[]) {
  latest = {
    personPresent: obs.personPresent,
    studyMaterialsVisible: obs.studyMaterialsVisible,
    phoneVisible: obs.phoneVisible,
    activity: obs.activity,
    lastEvent: events[events.length - 1] ?? latest?.lastEvent ?? null,
    lastUpdated: new Date().toISOString(),
  };
  if (events.length) for (const fn of listeners) fn(events, obs);
}

/** What rides along in the coach/agent context; null until the camera has seen anything. */
export function deviceContext(): DeviceContext | null {
  return latest;
}
