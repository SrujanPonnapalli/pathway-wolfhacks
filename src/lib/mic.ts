"use client";

// One place to open the microphone. On the Beacon kiosk (Raspberry Pi + Chromium) the
// default input isn't always the desk mic, so we enumerate audio inputs and prefer the
// Logitech Brio 101 by label, opening it with an exact deviceId. If it isn't there (or
// labels are still hidden until permission lands) we fall back to plain { audio: true }
// and, once the stream is open, upgrade to the Brio if its label is now visible.
// Only audioinput devices are ever considered — speakers/headphones can't be picked here.
// Everything is console.debug'd under [mic]; the last result feeds the /device debug
// pill through useMicStatus().
import { useSyncExternalStore } from "react";

const PREFERRED_MIC = /brio|b101|logitech|usb audio/i;

export type MicStatus = { label: string | null; error: string | null };
let status: MicStatus = { label: null, error: null };
const subs = new Set<() => void>();
const emit = (s: MicStatus) => {
  status = s;
  subs.forEach((cb) => cb());
};

/** The last microphone selection, for the /device "MIC:" debug line. */
export function useMicStatus() {
  return useSyncExternalStore(
    (cb) => {
      subs.add(cb);
      return () => {
        subs.delete(cb);
      };
    },
    () => status,
    () => status,
  );
}

const log = (m: string) => console.debug(`[mic] ${m}`);
const errText = (e: unknown) => (e instanceof Error ? `${e.name}: ${e.message}` : String(e));

// Every audio input the browser can see, and which one we'd rather use.
async function preferredInput(): Promise<MediaDeviceInfo | undefined> {
  const inputs = (await navigator.mediaDevices.enumerateDevices()).filter((d) => d.kind === "audioinput");
  for (const d of inputs) log(`audioinput: "${d.label || "(label hidden until mic permission is granted)"}"`);
  return inputs.find((d) => PREFERRED_MIC.test(d.label));
}

const openExact = (deviceId: string) =>
  navigator.mediaDevices.getUserMedia({
    audio: { deviceId: { exact: deviceId }, echoCancellation: true, noiseSuppression: true, autoGainControl: true },
  });

/** Open the microphone, preferring the Logitech Brio on the kiosk. Returns null if no mic could be opened. */
export async function openMic(): Promise<MediaStream | null> {
  if (!navigator.mediaDevices?.getUserMedia) {
    log("navigator.mediaDevices unavailable (page needs HTTPS or localhost)");
    emit({ label: null, error: "mediaDevices unavailable" });
    return null;
  }

  let wanted: MediaDeviceInfo | undefined;
  try {
    wanted = await preferredInput();
  } catch (e) {
    log(`enumerateDevices failed: ${errText(e)}`);
  }

  let stream: MediaStream | null = null;
  if (wanted) {
    log(`selected mic: "${wanted.label}" deviceId=${wanted.deviceId}`);
    try {
      stream = await openExact(wanted.deviceId);
    } catch (e) {
      log(`getUserMedia(exact "${wanted.label}") failed: ${errText(e)} — falling back to the default input`);
    }
  }
  if (!stream) {
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    } catch (e) {
      log(`getUserMedia(default) failed: ${errText(e)}`);
      emit({ label: null, error: errText(e) });
      return null;
    }
    // Permission may have just been granted, unhiding labels: if the default input
    // isn't the preferred mic, switch to it now that we can see its name.
    if (!stream.getAudioTracks().some((t) => PREFERRED_MIC.test(t.label))) {
      try {
        const better = await preferredInput();
        if (better) {
          log(`switching to preferred mic: "${better.label}" deviceId=${better.deviceId}`);
          const upgraded = await openExact(better.deviceId);
          stream.getTracks().forEach((t) => t.stop());
          stream = upgraded;
        }
      } catch (e) {
        log(`preferred-mic switch failed, keeping the default: ${errText(e)}`);
      }
    }
  }

  const track = stream.getAudioTracks()[0];
  log(`mic open: "${track?.label ?? "unknown"}" readyState=${track?.readyState ?? "none"}`);
  emit({ label: track?.label ?? null, error: null });
  return stream;
}
