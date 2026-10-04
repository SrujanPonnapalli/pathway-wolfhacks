import { Ionicons } from "@expo/vector-icons";
// Speech recognition is an optional native module: requireNativeModule throws at
// import time in Expo Go, so lazy-require it — null there, present in dev builds.
const SpeechRec = (() => {
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    return require("@jamsch/expo-speech-recognition") as typeof import("@jamsch/expo-speech-recognition");
  } catch {
    return null;
  }
})();
const ExpoSpeechRecognitionModule = SpeechRec?.ExpoSpeechRecognitionModule ?? null;
import { setAudioModeAsync } from "expo-audio";
import * as Speech from "expo-speech";
import { useRouter } from "expo-router";
import React, { useEffect, useRef, useState } from "react";
import {
  KeyboardAvoidingView, Modal, Platform, Pressable, ScrollView,
  StyleSheet, Text, TextInput, View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { VivaGlyph, VivaOrb, type VivaState } from "../../src/components/VivaOrb";
import { VIVA, sampleChatSessions, type ChatMessage } from "../../src/model/viva";
import { askViva } from "../../src/api";
import { COURSES, NOW, PROFILE } from "../../src/data";
import { colors } from "../../src/theme";

type Mode = "chat" | "voice";
type Msg = ChatMessage & { id: number };

// The package's d.ts types the emitter as the class object, hiding addListener —
// the runtime API is a normal expo EventEmitter, so re-declare the bit we use.
const speechEmitter = SpeechRec?.ExpoSpeechRecognitionModuleEmitter as unknown as {
  addListener(
    event: "start" | "speechend" | "end",
    listener: () => void,
  ): { remove(): void };
  addListener(
    event: "result",
    listener: (e: { isFinal: boolean; results: { transcript: string }[] }) => void,
  ): { remove(): void };
  addListener(event: "error", listener: (e: { message: string }) => void): { remove(): void };
};

let nextId = 1;

export default function Viva() {
  const router = useRouter();
  const [mode, setMode] = useState<Mode>("voice");
  const [messages, setMessages] = useState<Msg[]>([{ id: 0, role: "viva", text: VIVA.greeting(PROFILE.name) }]);
  const [input, setInput] = useState("");
  const [thinking, setThinking] = useState(false);
  const [voiceState, setVoiceState] = useState<VivaState>("idle");
  const [speakingId, setSpeakingId] = useState<number | null>(null);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [liveText, setLiveText] = useState("");
  const [micError, setMicError] = useState<string | null>(null);
  const scroll = useRef<ScrollView>(null);
  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);
  const transcriptRef = useRef("");
  const messagesRef = useRef(messages);
  messagesRef.current = messages;

  useEffect(
    () => () => {
      timers.current.forEach(clearTimeout);
      Speech.stop();
      try {
        ExpoSpeechRecognitionModule?.abort();
      } catch {}
    },
    [],
  );

  // One audio session for the whole turn: plays in silent mode, records for STT, and
  // always routes back to the loudspeaker (never the earpiece) when TTS starts.
  const audioMode = () =>
    setAudioModeAsync({ playsInSilentMode: true, allowsRecording: true, shouldRouteThroughEarpiece: false }).catch(() => {});
  useEffect(() => {
    void audioMode();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const later = (fn: () => void, ms: number) => timers.current.push(setTimeout(fn, ms));

  // Read a Viva reply out loud (device TTS until the ElevenLabs hookup lands). Tapping
  // the same bubble again stops it.
  const speakText = (id: number, text: string) => {
    Speech.stop();
    if (speakingId === id) {
      setSpeakingId(null);
      return;
    }
    setSpeakingId(id);
    const done = () => setSpeakingId((s) => (s === id ? null : s));
    try {
      Speech.speak(text, { rate: 0.55, onDone: done, onStopped: done, onError: done });
    } catch {
      done();
    }
  };

  // One Viva answer, always through POST /api/coach on the same Next.js backend the web
  // app and the Pi use (src/api.ts falls back to the on-device brain when it's down).
  const answer = async (q: string): Promise<string> => (await askViva(q, messagesRef.current)).text;

  const send = (text: string) => {
    const q = text.trim();
    if (!q || thinking) return;
    Speech.stop();
    setSpeakingId(null);
    setMessages((m) => [...m, { id: nextId++, role: "you", text: q }]);
    setInput("");
    setThinking(true);
    void answer(q).then((text) => {
      setMessages((m) => [...m, { id: nextId++, role: "viva", text }]);
      setThinking(false);
    });
  };

  // Say a reply out loud through the speaker and keep the speaking state honest:
  // TTS callbacks end it, the watchdog recovers if they never fire.
  const speakReply = (id: number, text: string) => {
    setVoiceState("speaking");
    setSpeakingId(id);
    const finish = () => (setVoiceState("idle"), setSpeakingId((s) => (s === id ? null : s)));
    later(finish, Math.min(45_000, 6000 + text.split(/\s+/).length * 750));
    try {
      Speech.speak(text, { rate: 0.55, onDone: finish, onStopped: finish, onError: finish });
    } catch {
      finish();
    }
  };

  // The voice turn, after the mic closes: transcript → coach → spoken reply.
  const runVoiceTurn = async (q: string) => {
    setMessages((m) => [...m, { id: nextId++, role: "you", text: q }]);
    setVoiceState("thinking");
    // Recording mode routes audio to the earpiece; flip back before she speaks.
    await audioMode();
    const text = await answer(q);
    const id = nextId++;
    setMessages((m) => [...m, { id, role: "viva", text }]);
    speakReply(id, text);
  };

  // ---- speech recognition: real STT in a dev build, absent in Expo Go -------------
  // In Expo Go the native module never loads — check once so the mic degrades to a
  // hint instead of crashing. In a dev build the emitter events drive the states.
  const sttSupported = ExpoSpeechRecognitionModule != null && speechEmitter != null;

  useEffect(() => {
    if (!sttSupported || !speechEmitter) return;
    const subs = [
      speechEmitter.addListener("start", () => setVoiceState("listening")),
      speechEmitter.addListener("result", (e) => {
        const t = e.results[0]?.transcript;
        if (t) {
          transcriptRef.current = t;
          setLiveText(t);
        }
      }),
      // continuous:false ends recognition on its own after ~3s of silence; stop() nudges it.
      speechEmitter.addListener("speechend", () => ExpoSpeechRecognitionModule?.stop()),
      speechEmitter.addListener("error", (e) => {
        setMicError(e.message);
        setLiveText("");
        setVoiceState("idle");
      }),
      speechEmitter.addListener("end", () => {
        const q = transcriptRef.current.trim();
        transcriptRef.current = "";
        setLiveText("");
        if (!q) {
          setVoiceState("idle");
          setMicError((e) => e ?? "Didn't catch that — tap the mic and try again.");
          return;
        }
        void runVoiceTurn(q);
      }),
    ];
    return () => subs.forEach((s) => s.remove());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const talk = async () => {
    setMicError(null);
    if (voiceState === "speaking") {
      Speech.stop(); // let the user cut her off
      return;
    }
    if (voiceState === "listening") {
      ExpoSpeechRecognitionModule?.stop(); // done talking → finalize this utterance
      return;
    }
    if (voiceState !== "idle") return;
    if (!sttSupported || !ExpoSpeechRecognitionModule) {
      setMicError("Voice needs the iOS dev build — Chat mode still works here.");
      return;
    }
    try {
      const perm = await ExpoSpeechRecognitionModule.requestPermissionsAsync();
      if (!perm.granted) {
        setMicError("Viva needs microphone and speech recognition access — check Settings.");
        return;
      }
      transcriptRef.current = "";
      setLiveText("");
      await audioMode();
      ExpoSpeechRecognitionModule.start({
        lang: "en-US",
        interimResults: true,
        continuous: false, // iOS: auto-ends ~3s after you stop talking
        addsPunctuation: true,
        iosTaskHint: "dictation",
        contextualStrings: ["Pathway", "Viva", "midterm", "check-in", ...COURSES.map((c) => c.code)],
      });
    } catch (e) {
      setMicError((e as Error)?.message ?? "Couldn't start the microphone.");
      setVoiceState("idle");
    }
  };

  const voiceLabel =
    voiceState === "listening" ? "Listening — tap when done" :
    voiceState === "thinking" ? "Thinking…" :
    voiceState === "speaking" ? "Speaking — tap to stop" : "Tap to talk";

  return (
    <SafeAreaView style={styles.safe} edges={["top", "left", "right"]}>
      {/* Header */}
      <View style={styles.header}>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
          <VivaGlyph size={40} />
          <View>
            <Text style={styles.h1}>Viva</Text>
            <Text style={styles.sub}>Your study coach</Text>
          </View>
        </View>
        <Pressable style={styles.historyBtn} onPress={() => setHistoryOpen(true)}>
          <Ionicons name="time-outline" size={16} color={colors.muted} />
          <Text style={styles.historyText}>History</Text>
        </Pressable>
      </View>

      {/* Mode toggle */}
      <View style={styles.segWrap}>
        {(["chat", "voice"] as Mode[]).map((m) => (
          <Pressable key={m} onPress={() => setMode(m)} style={[styles.seg, mode === m && styles.segActive]}>
            <Ionicons name={m === "chat" ? "chatbubble-ellipses" : "mic"} size={15} color={mode === m ? "#fff" : colors.muted} />
            <Text style={[styles.segText, mode === m && styles.segTextActive]}>{m === "chat" ? "Chat" : "Voice"}</Text>
          </Pressable>
        ))}
      </View>

      {mode === "voice" ? (
        /* ---- Voice: orb front and center, one big mic ---- */
        <View style={styles.voiceBody}>
          <VivaOrb size={190} state={voiceState} />
          <Text style={styles.voiceLabel}>{voiceLabel}</Text>
          {voiceState === "listening" && liveText ? (
            <Text style={styles.transcript} numberOfLines={3}>You: {liveText}</Text>
          ) : voiceState !== "idle" && messages.length > 0 ? (
            <Text style={styles.transcript} numberOfLines={3}>
              {messages.at(-1)!.role === "you" ? "You: " : "Viva: "}{messages.at(-1)!.text}
            </Text>
          ) : null}
          {voiceState === "idle" && !micError && (
            <Text style={styles.voiceHint}>Ask about a class, your week, or what's next.</Text>
          )}
          {micError && <Text style={styles.micErrorText}>{micError}</Text>}
          <Pressable
            onPress={() => void talk()}
            disabled={voiceState === "thinking"}
            style={[styles.micBtn, voiceState !== "idle" && styles.micBtnActive]}
            accessibilityLabel={
              voiceState === "idle" ? "Start talking to Viva" :
              voiceState === "listening" ? "Done talking" :
              voiceState === "speaking" ? "Stop Viva" : voiceLabel
            }
          >
            <Ionicons
              name={voiceState === "speaking" ? "stop" : voiceState === "listening" ? "checkmark" : "mic"}
              size={34}
              color={voiceState === "idle" ? "#fff" : colors.skyLip}
            />
          </Pressable>
          <Pressable onPress={() => setMode("chat")} style={styles.switchToChat}>
            <Ionicons name="chatbubble-ellipses-outline" size={14} color={colors.sky} />
            <Text style={styles.switchToChatText}>Type instead</Text>
          </Pressable>
        </View>
      ) : (
        /* ---- Chat ---- */
        <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === "ios" ? "padding" : undefined} keyboardVerticalOffset={0}>
          <ScrollView
            ref={scroll}
            style={{ flex: 1 }}
            contentContainerStyle={{ paddingHorizontal: 20, paddingTop: 8, paddingBottom: 16, gap: 12 }}
            onContentSizeChange={() => scroll.current?.scrollToEnd({ animated: true })}
            showsVerticalScrollIndicator={false}
          >
            {messages.map((m) =>
              m.role === "you" ? (
                <View key={m.id} style={styles.youBubble}>
                  <Text style={styles.youText}>{m.text}</Text>
                </View>
              ) : (
                <View key={m.id} style={styles.vivaRow}>
                  <VivaGlyph size={30} />
                  <View style={styles.vivaBubble}>
                    <Text style={styles.vivaText}>{m.text}</Text>
                    <Pressable
                      style={[styles.speaker, speakingId === m.id && { backgroundColor: colors.sky }]}
                      onPress={() => speakText(m.id, m.text)}
                      accessibilityLabel={speakingId === m.id ? "Stop reading aloud" : "Read aloud"}
                    >
                      <Ionicons
                        name={speakingId === m.id ? "stop" : "volume-high"}
                        size={13}
                        color={speakingId === m.id ? "#fff" : colors.sky}
                      />
                    </Pressable>
                    {m.actions && m.actions.length > 0 && (
                      <View style={styles.actions}>
                        {m.actions.map((a) => (
                          <Pressable key={a.label} style={styles.actionChip} onPress={() => router.push(a.route as never)}>
                            <Text style={styles.actionText}>{a.label}</Text>
                          </Pressable>
                        ))}
                      </View>
                    )}
                  </View>
                </View>
              ),
            )}
            {thinking && (
              <View style={styles.vivaRow}>
                <VivaOrb size={30} state="thinking" />
                <View style={styles.vivaBubble}>
                  <Text style={styles.vivaText}>…</Text>
                </View>
              </View>
            )}
            {/* Suggestion chips on a fresh chat */}
            {messages.length <= 1 && (
              <View style={styles.suggWrap}>
                {VIVA.suggestions.map((s) => (
                  <Pressable key={s} style={styles.sugg} onPress={() => send(s)}>
                    <Text style={styles.suggText}>{s}</Text>
                  </Pressable>
                ))}
              </View>
            )}
          </ScrollView>

          {/* Input bar */}
          <View style={styles.inputBar}>
            <TextInput
              value={input}
              onChangeText={setInput}
              placeholder="Ask Viva anything…"
              placeholderTextColor={colors.muted}
              style={styles.input}
              onSubmitEditing={() => send(input)}
              returnKeyType="send"
            />
            <Pressable onPress={() => send(input)} style={styles.sendBtn} accessibilityLabel="Send">
              <Ionicons name="arrow-up" size={18} color="#fff" />
            </Pressable>
          </View>
        </KeyboardAvoidingView>
      )}

      {/* History sheet */}
      <Modal visible={historyOpen} animationType="slide" transparent onRequestClose={() => setHistoryOpen(false)}>
        <Pressable style={styles.backdrop} onPress={() => setHistoryOpen(false)} />
        <View style={styles.sheet}>
          <View style={styles.sheetHandle} />
          <Text style={styles.sheetTitle}>Previous chats</Text>
          <Text style={styles.sheetSub}>{sampleChatSessions.length + 1} saved conversations</Text>
          <ScrollView style={{ marginTop: 12 }} showsVerticalScrollIndicator={false}>
            {[{ id: "current", title: "This conversation", createdAt: NOW.toISOString(), updatedAt: NOW.toISOString(), messages }, ...sampleChatSessions].map((s) => (
              <Pressable key={s.id} style={styles.session} onPress={() => setHistoryOpen(false)}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.sessionTitle} numberOfLines={1}>{s.title}</Text>
                  <Text style={styles.sessionMeta} numberOfLines={2}>
                    {s.messages.length > 0 ? `${s.messages.at(-1)!.role === "you" ? "You" : "Viva"}: ${s.messages.at(-1)!.text}` : "Fresh conversation"}
                  </Text>
                  <Text style={styles.sessionDate}>
                    {new Date(s.updatedAt).toLocaleDateString("en-US", { month: "short", day: "numeric" })} · {s.messages.length} {s.messages.length === 1 ? "turn" : "turns"}
                  </Text>
                </View>
                <Ionicons name="chevron-forward" size={16} color={colors.muted} />
              </Pressable>
            ))}
          </ScrollView>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.ground },
  header: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 20, paddingTop: 8 },
  h1: { fontSize: 28, fontWeight: "900", color: colors.ink, letterSpacing: -0.4 },
  sub: { fontSize: 13.5, fontWeight: "600", color: colors.muted },
  historyBtn: {
    flexDirection: "row", alignItems: "center", gap: 5,
    borderWidth: 2, borderColor: colors.line, borderRadius: 12, paddingHorizontal: 10, paddingVertical: 7,
    backgroundColor: colors.ground,
  },
  historyText: { fontSize: 12, fontWeight: "800", color: colors.muted },
  segWrap: {
    flexDirection: "row", gap: 4, marginHorizontal: 20, marginTop: 14,
    backgroundColor: colors.polar, borderWidth: 2, borderColor: colors.line, borderRadius: 16, padding: 4,
  },
  seg: { flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6, paddingVertical: 9, borderRadius: 12 },
  segActive: { backgroundColor: colors.sky },
  segText: { fontSize: 13, fontWeight: "800", textTransform: "uppercase", letterSpacing: 0.8, color: colors.muted },
  segTextActive: { color: "#fff" },
  voiceBody: { flex: 1, alignItems: "center", justifyContent: "center", gap: 14, paddingBottom: 40 },
  voiceLabel: { fontSize: 20, fontWeight: "900", color: colors.ink, marginTop: 4 },
  voiceHint: { fontSize: 14, fontWeight: "600", color: colors.muted, textAlign: "center", maxWidth: 280 },
  micErrorText: { fontSize: 13.5, fontWeight: "700", color: colors.sunInk, textAlign: "center", maxWidth: 300, lineHeight: 19 },
  transcript: { fontSize: 14, fontWeight: "600", color: colors.muted, textAlign: "center", maxWidth: 300, lineHeight: 20 },
  micBtn: {
    marginTop: 10, width: 84, height: 84, borderRadius: 42, backgroundColor: colors.sky,
    alignItems: "center", justifyContent: "center",
    borderWidth: 3, borderColor: colors.skyLip, borderBottomWidth: 7,
    shadowColor: colors.sky, shadowOpacity: 0.35, shadowRadius: 18, shadowOffset: { width: 0, height: 8 },
  },
  micBtnActive: { backgroundColor: colors.skySoft },
  switchToChat: { flexDirection: "row", alignItems: "center", gap: 6, marginTop: 6, padding: 8 },
  switchToChatText: { fontSize: 13, fontWeight: "800", color: colors.sky },
  youBubble: {
    alignSelf: "flex-end", maxWidth: "82%", backgroundColor: colors.tealSoft,
    borderRadius: 18, borderBottomRightRadius: 6, paddingHorizontal: 14, paddingVertical: 10,
  },
  youText: { fontSize: 15, fontWeight: "600", color: colors.tealLip, lineHeight: 21 },
  vivaRow: { flexDirection: "row", gap: 10, alignItems: "flex-start", maxWidth: "92%" },
  vivaBubble: {
    flex: 1, backgroundColor: colors.skySoft, borderWidth: 2, borderColor: "rgba(26,111,209,0.25)",
    borderRadius: 18, borderTopLeftRadius: 6, paddingHorizontal: 14, paddingVertical: 10, paddingBottom: 26,
  },
  speaker: {
    position: "absolute", right: 8, bottom: 6, width: 24, height: 24, borderRadius: 8,
    alignItems: "center", justifyContent: "center",
  },
  vivaText: { fontSize: 15, fontWeight: "600", color: colors.ink, lineHeight: 21 },
  actions: { flexDirection: "row", flexWrap: "wrap", gap: 6, marginTop: 10 },
  actionChip: {
    borderWidth: 2, borderColor: colors.line, borderBottomWidth: 4, borderRadius: 10,
    backgroundColor: colors.ground, paddingHorizontal: 10, paddingVertical: 5,
  },
  actionText: { fontSize: 12, fontWeight: "800", color: colors.teal },
  suggWrap: { gap: 8, marginTop: 8 },
  sugg: {
    alignSelf: "flex-start", borderWidth: 2, borderColor: colors.line, borderRadius: 14,
    backgroundColor: colors.ground, paddingHorizontal: 14, paddingVertical: 9,
  },
  suggText: { fontSize: 13.5, fontWeight: "700", color: colors.sky },
  inputBar: {
    flexDirection: "row", alignItems: "center", gap: 8, marginHorizontal: 20, marginBottom: 8,
    borderWidth: 2, borderColor: colors.line, borderRadius: 18, backgroundColor: colors.ground,
    paddingLeft: 16, paddingRight: 6, paddingVertical: 6,
  },
  input: { flex: 1, fontSize: 15, fontWeight: "600", color: colors.ink, paddingVertical: 8 },
  sendBtn: { width: 38, height: 38, borderRadius: 13, backgroundColor: colors.sky, alignItems: "center", justifyContent: "center" },
  backdrop: { flex: 1, backgroundColor: "rgba(51,56,61,0.3)" },
  sheet: {
    backgroundColor: colors.ground, borderTopLeftRadius: 24, borderTopRightRadius: 24,
    paddingHorizontal: 20, paddingTop: 10, paddingBottom: 28, maxHeight: "72%",
    borderTopWidth: 2, borderColor: colors.line,
  },
  sheetHandle: { alignSelf: "center", width: 40, height: 5, borderRadius: 3, backgroundColor: colors.line, marginBottom: 12 },
  sheetTitle: { fontSize: 20, fontWeight: "900", color: colors.ink },
  sheetSub: { fontSize: 13, fontWeight: "700", color: colors.muted, marginTop: 2 },
  session: {
    flexDirection: "row", alignItems: "center", gap: 10, borderWidth: 2, borderColor: colors.line,
    borderRadius: 16, padding: 13, marginBottom: 8, backgroundColor: colors.ground,
  },
  sessionTitle: { fontSize: 14.5, fontWeight: "800", color: colors.ink },
  sessionMeta: { fontSize: 12.5, fontWeight: "600", color: colors.muted, marginTop: 2 },
  sessionDate: { fontSize: 11.5, fontWeight: "700", color: colors.muted, marginTop: 4 },
});
