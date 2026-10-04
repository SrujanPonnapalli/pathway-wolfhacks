# Pathway — iOS app (Expo + React Native)

A native iPhone version of Pathway. Four tabs — Home, Plan, Viva, Insights — built with
Expo Router, TypeScript and `react-native-svg`. No WebView.

Course statuses, reasons and recourse are **computed on-device** by the same decision-tree
models the web app ships (`assets/models/tree_early.json`, `tree_mid.json`, ported verbatim
from `src/lib/`). The demo shows Maya's sample profile — the same student and numbers as
the web demo.

## Run in Expo Go (iPhone)

Requirements: Node 18+, the **Expo Go** app from the App Store, and your iPhone on the
same Wi-Fi network as this computer.

```sh
cd mobile
npm install        # first time only
npx expo start
```

Then either:

- scan the QR code in the terminal with the iPhone **Camera** app (it opens Expo Go), or
- press `s` in the terminal to send the link, or
- open Expo Go manually and enter the URL shown (`exp://…`).

To run in the iOS Simulator instead (requires Xcode):

```sh
npx expo start --ios
```

## Viva's voice & the backend

- **Chat works everywhere.** Every message posts to `API_URL/api/coach` — the same Gemini
  backend the web app and the Pi use — with the on-device `vivaReply` as fallback.
- **Voice (real speech-to-text) needs a development build** — Expo Go can't load the
  speech-recognition native module. In Expo Go the mic politely says so and Chat still
  works; replies are still read aloud via TTS either way.
- On a physical iPhone `localhost` means the phone, so `API_URL` defaults to the LAN IP
  of the Mac running Metro, port 3000 — run `npm run dev` in the repo root on the same
  Wi-Fi and it just works. Override if needed:

  ```sh
  EXPO_PUBLIC_API_URL=http://192.168.1.20:3000 npx expo start
  ```

### Want real voice? Build a dev client

```sh
cd mobile
npm install expo-dev-client
npx expo run:ios --device          # pick your iPhone, USB cable, Xcode + free Apple ID
npx expo start --dev-client
```

First launch: **Settings → General → VPN & Device Management → your Apple ID → Trust**.
The speech-recognition code path activates automatically — no other changes needed.

## What's where

```
app/
  _layout.tsx          root stack (headerless)
  (tabs)/
    _layout.tsx        bottom tab bar: Home · Plan · Viva · Insights
    index.tsx          Home: greeting, standing, route, week strip, checkpoints, Viva entry
    plan.tsx           Plan: week selector, day timeline, assignments, checkpoints
    viva.tsx           Viva: chat + voice modes, orb, mic → STT → coach → TTS
    insights.tsx       Insights: course selector, risk %, route, tree path
src/
  api.ts               POST /api/coach client + coach context (shared brain)
  theme.ts             Pathway palette (ported from globals.css)
  data.ts              Maya's demo profile + on-device scoring
  model/               ports of src/lib: tree.ts, features.ts, plan.ts, viva.ts, rows.json
  components/
    ui.tsx             Screen, Card, StatusMark, SectionTitle
    VivaOrb.tsx        Viva's face/states as SVG (orb-ui is web-only)
assets/models/         tree_early.json, tree_mid.json — same files as public/models/
```

## Not wired yet

Study tools, Google Calendar, and ElevenLabs voices (Viva speaks with the device TTS for
now — the web app's ElevenLabs hookup is a backend change). The demo clock is fixed at
`NOW = 2026-10-06T09:00` in `src/data.ts` so the screens match the web demo.
