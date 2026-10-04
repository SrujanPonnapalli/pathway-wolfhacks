import { Ionicons } from "@expo/vector-icons";
import { useLocalSearchParams, useRouter } from "expo-router";
import React, { useState } from "react";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { Card, Eyebrow, Screen, SectionTitle, StatusMark } from "../../src/components/ui";
import { FEATURES, goalText, meta, moveText, reasonFor } from "../../src/model/features";
import { planBlocks } from "../../src/model/plan";
import { COURSES, FOCUS, NOW, fmtDay, fmtTime, type CourseView } from "../../src/data";
import { colors } from "../../src/theme";

export default function Insights() {
  const router = useRouter();
  const params = useLocalSearchParams<{ course?: string }>();
  const c = COURSES.find((x) => x.slug === params.course) ?? FOCUS;
  if (!c) return null;
  return (
    <Screen>
      <Text style={styles.h1}>Insights</Text>
      <Text style={styles.sub}>Where you stand in each class, and the shortest route to on track.</Text>

      {/* Course selector */}
      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.selector} contentContainerStyle={{ gap: 8, paddingVertical: 2 }}>
        {COURSES.map((x) => {
          const active = x.slug === c.slug;
          return (
            <Pressable key={x.slug} onPress={() => router.setParams({ course: x.slug })} style={[styles.selChip, active && styles.selChipActive]}>
              <StatusMark atRisk={x.result.atRisk} label={false} size={15} />
              <Text style={[styles.selText, active && styles.selTextActive]}>{x.code}</Text>
            </Pressable>
          );
        })}
      </ScrollView>

      <CourseCard key={c.slug} c={c} />
    </Screen>
  );
}

function CourseCard({ c }: { c: CourseView }) {
  const [planned, setPlanned] = useState(false);
  const [showPath, setShowPath] = useState(false);
  const moves = c.rec?.moves ?? [];
  const blocks = moves.length ? planBlocks(c, moves, NOW) : [];
  const pRisk = Math.round(c.result.pRisk * 100);
  const n = c.result.n;
  const slipped = Math.round(c.result.pRisk * n);

  return (
    <View>
      {/* Standing */}
      <Card style={{ marginTop: 18 }}>
        <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start" }}>
          <View style={{ flex: 1, paddingRight: 12 }}>
            <Text style={styles.courseCode}>{c.code}</Text>
            <Text style={styles.courseName}>{c.name}</Text>
            <View style={{ marginTop: 8 }}><StatusMark atRisk={c.result.atRisk} size={22} /></View>
          </View>
          <View style={styles.riskWrap}>
            <Text style={[styles.riskPct, { color: c.result.atRisk ? colors.sunInk : colors.teal }]}>{pRisk}%</Text>
            <View style={styles.riskBarTrack}>
              <View style={[styles.riskBarFill, { width: `${pRisk}%`, backgroundColor: c.result.atRisk ? colors.sun : colors.tealFace }]} />
            </View>
            <Text style={styles.riskNote}>{slipped} of {n} similar students slipped</Text>
          </View>
        </View>
        <Text style={styles.reason}>{reasonFor(c.steps)}</Text>
        <Text style={styles.metaLine}>
          {c.exam.title} {fmtDay(c.exam.date)}, {fmtTime(c.exam.date)} · in {c.daysToExam} {c.daysToExam === 1 ? "day" : "days"} · scored on this device by the {c.horizon === "mid" ? "mid-semester" : "early-semester"} model
        </Text>
      </Card>

      {/* Route / recourse */}
      <View style={{ marginTop: 16 }}>
        <SectionTitle>Your route to on track</SectionTitle>
        <Card>
          {c.result.atRisk && moves.length ? (
            <>
              <Text style={styles.bodyMuted}>The smallest change the model found. Students with similar patterns who made it usually ended up on track.</Text>
              <View style={{ marginTop: 12, gap: 12 }}>
                {moves.map((m, i) => (
                  <View key={m.feature} style={{ flexDirection: "row", gap: 10 }}>
                    <View style={styles.stepNum}><Text style={styles.stepNumText}>{i + 1}</Text></View>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.stepGoal}>{cap(goalText(m))}</Text>
                      <Text style={styles.stepMove}>{moveText(m)}</Text>
                    </View>
                  </View>
                ))}
                {blocks.length > 0 && (
                  <View style={{ flexDirection: "row", gap: 10 }}>
                    <View style={[styles.stepNum, { backgroundColor: colors.skySoft }]}>
                      <Ionicons name="calendar" size={14} color={colors.sky} />
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.stepGoal}>On your calendar</Text>
                      <Text style={styles.stepMove}>{blocks.map((b) => `${b.title} · ${fmtDay(b.at)} ${fmtTime(b.at)}`).join("\n")}</Text>
                    </View>
                  </View>
                )}
              </View>
              <Pressable style={[styles.makeReal, planned && styles.makeRealDone]} onPress={() => setPlanned(true)} disabled={planned}>
                {planned ? (
                  <>
                    <Ionicons name="checkmark" size={18} color={colors.tealLip} />
                    <Text style={[styles.makeRealText, { color: colors.tealLip }]}>Added to your week</Text>
                  </>
                ) : (
                  <Text style={styles.makeRealText}>Make it real</Text>
                )}
              </Pressable>
              <Text style={styles.makeRealNote}>
                {planned ? "Find the blocks on your Plan tab." : `Adds ${blocks.length} dated study ${blocks.length === 1 ? "block" : "blocks"} before ${fmtDay(c.exam.date)}.`}
              </Text>
            </>
          ) : c.result.atRisk ? (
            <Text style={styles.bodyMuted}>The on-track paths all need something you can't change on your own. Talk to your advisor.</Text>
          ) : (
            <View>
              <Text style={styles.onTrackTitle}>You're on track</Text>
              <Text style={styles.bodyMuted}>Keep it up: showing up, submitting on time, starting early. Every quiz, check-in and study block you log re-scores this class on the spot.</Text>
            </View>
          )}
        </Card>
      </View>

      {/* Where you stand */}
      <View style={{ marginTop: 20 }}>
        <SectionTitle>Where you stand</SectionTitle>
        <View style={styles.tiles}>
          {(["attendance_rate", "on_time_submission_rate", "practice_quizzes_taken", "avg_days_started_before_exam"] as const).map((f) => {
            const m = FEATURES[f];
            const v = c.x[f] ?? 0;
            const ok =
              f === "attendance_rate" ? v >= 0.8 :
              f === "on_time_submission_rate" ? v >= 0.85 :
              f === "practice_quizzes_taken" ? v >= 10 :
              v >= 3;
            return (
              <View key={f} style={styles.tile}>
                <View style={styles.tileHead}>
                  <Text style={styles.tileLabel}>{m.label}</Text>
                  <View style={[styles.tileDot, { backgroundColor: ok ? colors.tealFace : colors.sun }]} />
                </View>
                <Text style={styles.tileValue}>{m.fmt(v)}</Text>
                <Text style={styles.tileDetail}>{m.fact(v)}</Text>
              </View>
            );
          })}
        </View>
      </View>

      {/* Model explanation */}
      <Pressable style={styles.pathToggle} onPress={() => setShowPath((v) => !v)}>
        <View style={{ flex: 1 }}>
          <Text style={styles.pathToggleTitle}>How the model decided</Text>
          <Text style={styles.pathToggleSub}>Your path through the decision tree, question by question.</Text>
        </View>
        <Ionicons name={showPath ? "chevron-up" : "chevron-down"} size={20} color={colors.muted} />
      </Pressable>
      {showPath && (
        <Card style={{ marginTop: 10 }}>
          {c.steps.map((s, i) => (
            <View key={i} style={[styles.pathStep, i > 0 && styles.pathStepBorder]}>
              <View style={[styles.pathIcon, { backgroundColor: s.above ? colors.tealSoft : colors.polar }]}>
                <Ionicons name={s.above ? "arrow-forward" : "arrow-down"} size={13} color={s.above ? colors.teal : colors.muted} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.pathQ}>{meta(s.feature).ask(s.threshold)}</Text>
                <Text style={styles.pathA}>
                  {s.above ? "Yes —" : "No —"} {meta(s.feature).fact(s.value)}
                </Text>
              </View>
            </View>
          ))}
          <View style={styles.pathEnd}>
            <StatusMark atRisk={c.result.atRisk} size={16} />
            <Text style={styles.pathEndText}>{n} students in the dataset followed this same path.</Text>
          </View>
          <View style={styles.caveat}>
            <Text style={styles.caveatTitle}>Why this might be wrong</Text>
            <Text style={styles.caveatText}>
              The model learned from end-of-semester totals, so early-semester numbers are projected to a full term. It can't see a hard week, an illness, or a great study group.
            </Text>
          </View>
        </Card>
      )}
    </View>
  );
}

const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

const styles = StyleSheet.create({
  h1: { fontSize: 30, fontWeight: "900", color: colors.ink, letterSpacing: -0.5 },
  sub: { marginTop: 6, fontSize: 15, fontWeight: "600", color: colors.muted },
  selector: { marginTop: 16, flexGrow: 0 },
  selChip: {
    flexDirection: "row", alignItems: "center", gap: 7,
    borderWidth: 2, borderColor: colors.line, borderRadius: 12,
    backgroundColor: colors.polar, paddingVertical: 8, paddingHorizontal: 12,
  },
  selChipActive: { backgroundColor: colors.tealSoft, borderColor: colors.tealFace },
  selText: { fontWeight: "800", fontSize: 14, color: colors.muted },
  selTextActive: { color: colors.tealLip },
  courseCode: { fontSize: 24, fontWeight: "900", color: colors.ink, letterSpacing: -0.3 },
  courseName: { fontSize: 14, fontWeight: "700", color: colors.muted, marginTop: 1 },
  riskWrap: { alignItems: "center", width: 108 },
  riskPct: { fontSize: 30, fontWeight: "900", fontVariant: ["tabular-nums"] },
  riskBarTrack: { marginTop: 5, width: "100%", height: 8, borderRadius: 4, backgroundColor: colors.line, overflow: "hidden" },
  riskBarFill: { height: 8, borderRadius: 4 },
  riskNote: { marginTop: 6, fontSize: 10.5, fontWeight: "700", color: colors.muted, textAlign: "center", lineHeight: 14 },
  reason: { marginTop: 12, fontSize: 15, fontWeight: "600", color: colors.ink, lineHeight: 22 },
  metaLine: { marginTop: 6, fontSize: 13, fontWeight: "600", color: colors.muted, lineHeight: 19 },
  bodyMuted: { fontSize: 14, fontWeight: "600", color: colors.muted, lineHeight: 20 },
  stepNum: {
    width: 28, height: 28, borderRadius: 14, backgroundColor: colors.tealFace,
    alignItems: "center", justifyContent: "center", marginTop: 1,
  },
  stepNumText: { fontSize: 13, fontWeight: "900", color: colors.tealInk },
  stepGoal: { fontSize: 15, fontWeight: "800", color: colors.ink },
  stepMove: { fontSize: 13, fontWeight: "600", color: colors.muted, marginTop: 1, lineHeight: 18 },
  makeReal: {
    marginTop: 16, minHeight: 50, borderRadius: 14, flexDirection: "row", gap: 6,
    alignItems: "center", justifyContent: "center",
    backgroundColor: colors.tealFace, borderWidth: 2, borderColor: "#109c8a", borderBottomWidth: 5,
  },
  makeRealDone: { backgroundColor: colors.tealSoft, borderColor: colors.tealFace, borderBottomWidth: 2 },
  makeRealText: { fontSize: 14, fontWeight: "800", letterSpacing: 0.5, textTransform: "uppercase", color: colors.tealInk },
  makeRealNote: { marginTop: 8, fontSize: 12.5, fontWeight: "600", color: colors.muted },
  onTrackTitle: { fontSize: 18, fontWeight: "900", color: colors.tealLip },
  tiles: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  tile: {
    flexBasis: "47%", flexGrow: 1, borderWidth: 2, borderColor: colors.line,
    borderRadius: 16, backgroundColor: colors.ground, padding: 12,
  },
  tileHead: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  tileLabel: { fontSize: 12, fontWeight: "800", color: colors.muted, flex: 1, paddingRight: 6 },
  tileDot: { width: 10, height: 10, borderRadius: 5 },
  tileValue: { marginTop: 4, fontSize: 22, fontWeight: "900", color: colors.ink, fontVariant: ["tabular-nums"] },
  tileDetail: { marginTop: 2, fontSize: 11.5, fontWeight: "600", color: colors.muted, lineHeight: 15 },
  pathToggle: {
    marginTop: 22, flexDirection: "row", alignItems: "center", gap: 12,
    borderWidth: 2, borderColor: colors.line, borderRadius: 16, backgroundColor: colors.polar,
    paddingHorizontal: 14, paddingVertical: 13,
  },
  pathToggleTitle: { fontSize: 15, fontWeight: "900", color: colors.ink },
  pathToggleSub: { fontSize: 12.5, fontWeight: "600", color: colors.muted, marginTop: 1 },
  pathStep: { flexDirection: "row", gap: 10, paddingVertical: 10, alignItems: "flex-start" },
  pathStepBorder: { borderTopWidth: 1, borderTopColor: colors.line },
  pathIcon: { width: 26, height: 26, borderRadius: 8, alignItems: "center", justifyContent: "center", marginTop: 1 },
  pathQ: { fontSize: 14, fontWeight: "800", color: colors.ink },
  pathA: { fontSize: 13, fontWeight: "600", color: colors.muted, marginTop: 1, lineHeight: 18 },
  pathEnd: {
    marginTop: 8, borderTopWidth: 2, borderTopColor: colors.line, paddingTop: 12,
    flexDirection: "row", alignItems: "center", gap: 8,
  },
  pathEndText: { fontSize: 12.5, fontWeight: "700", color: colors.muted, flex: 1 },
  caveat: { marginTop: 12, backgroundColor: colors.polar, borderRadius: 12, padding: 12 },
  caveatTitle: { fontSize: 12.5, fontWeight: "900", color: colors.ink },
  caveatText: { fontSize: 12.5, fontWeight: "600", color: colors.muted, marginTop: 3, lineHeight: 18 },
});
