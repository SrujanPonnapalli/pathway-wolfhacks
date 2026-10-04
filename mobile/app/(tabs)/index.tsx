import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import React, { useMemo, useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { Card, Eyebrow, Screen, SectionTitle, StatusMark } from "../../src/components/ui";
import { VivaGlyph } from "../../src/components/VivaOrb";
import { moveText, reasonFor } from "../../src/model/features";
import {
  COURSES, FOCUS, INITIAL_BLOCKS, NOW, PROFILE,
  fmtDay, fmtTime, greet, sameDay,
} from "../../src/data";
import { colors } from "../../src/theme";

export default function Home() {
  const router = useRouter();
  const [doneBlocks, setDoneBlocks] = useState<Record<string, boolean>>({});
  const [doneTodos, setDoneTodos] = useState<Record<string, boolean>>({});

  const checkIns = COURSES.filter((c) => c.result.atRisk).length;
  const focus = FOCUS;

  // The route: up to three "turns" — nearest deadline, next study block, a practice quiz.
  const turns = useMemo(() => {
    const out: { when: string; title: string; detail?: string; cta?: { label: string; onPress?: () => void; to?: string; primary?: boolean } }[] = [];
    const due = PROFILE.todos.filter((t) => !doneTodos[t.id] && t.due && new Date(t.due) >= NOW).sort((a, b) => +new Date(a.due!) - +new Date(b.due!))[0];
    if (due) {
      const d = new Date(due.due!);
      out.push({
        when: sameDay(d, NOW) ? `Today, ${fmtTime(due.due!)}` : fmtDay(due.due!),
        title: due.title,
        cta: { label: "Done", onPress: () => setDoneTodos((m) => ({ ...m, [due.id]: true })) },
      });
    }
    const next = INITIAL_BLOCKS.filter((b) => !doneBlocks[b.id]).sort((a, b) => a.at.localeCompare(b.at))[0];
    if (next) {
      out.push({
        when: `${fmtDay(next.at)}, ${fmtTime(next.at)}`,
        title: next.title,
        cta: { label: "Done", primary: true, onPress: () => setDoneBlocks((m) => ({ ...m, [next.id]: true })) },
      });
    }
    if (focus) {
      out.push({ when: "5 minutes, any time", title: `${focus.code} practice quiz`, cta: { label: "Quiz", to: `/plan?course=${focus.slug}` } });
    }
    return out.slice(0, 3);
  }, [doneBlocks, doneTodos, focus]);

  const week = useMemo(() => {
    const monday = new Date(NOW);
    monday.setDate(NOW.getDate() - ((NOW.getDay() + 6) % 7));
    return Array.from({ length: 7 }, (_, i) => {
      const d = new Date(monday);
      d.setDate(monday.getDate() + i);
      return d;
    });
  }, []);

  const blocksOn = (d: Date) => INITIAL_BLOCKS.filter((b) => sameDay(new Date(b.at), d));
  const examsOn = (d: Date) => COURSES.filter((c) => sameDay(new Date(c.exam.date), d));
  const nextExam = [...COURSES].sort((a, b) => +new Date(a.exam.date) - +new Date(b.exam.date))[0];
  const nextClass = PROFILE.classes.filter((m) => new Date(m.at) >= NOW).sort((a, b) => a.at.localeCompare(b.at))[0];

  return (
    <Screen>
      {/* Greeting + overall standing */}
      <Text style={styles.h1}>{greet(NOW.getHours())}, {PROFILE.name}</Text>
      <Text style={styles.sub}>
        {COURSES.length - checkIns} of {COURSES.length} classes on track
        {checkIns > 0 && `, ${checkIns} worth a check-in`}
        {PROFILE.streakDays > 0 && ` · ${PROFILE.streakDays}-day streak`}
      </Text>

      {/* Course chips */}
      <View style={styles.chips}>
        {COURSES.map((c) => (
          <Pressable key={c.slug} onPress={() => router.push(`/insights?course=${c.slug}`)} style={styles.chip}>
            <StatusMark atRisk={c.result.atRisk} label={false} size={15} />
            <Text style={styles.chipText}>{c.code}</Text>
          </Pressable>
        ))}
      </View>

      {/* Viva entry point */}
      <Pressable style={styles.askBar} onPress={() => router.push("/viva")}>
        <VivaGlyph size={34} />
        <Text style={styles.askText}>Ask Viva: what should I do first?</Text>
        <View style={styles.askBtn}>
          <Ionicons name="arrow-up" size={16} color="#fff" />
        </View>
      </Pressable>

      {/* Highest-priority course + route */}
      {focus && (
        <Card style={{ marginTop: 18 }}>
          <View style={{ flexDirection: "row", gap: 10 }}>
            <View style={{ marginTop: 3 }}><StatusMark atRisk={focus.result.atRisk} label={false} size={22} /></View>
            <View style={{ flex: 1 }}>
              <Text style={styles.focusTitle}>
                {focus.code} is {focus.result.atRisk ? "worth a check-in" : "on track"}
              </Text>
              <Text style={styles.focusMeta}>
                {focus.exam.title} {fmtDay(focus.exam.date)} · in {focus.daysToExam} {focus.daysToExam === 1 ? "day" : "days"}
              </Text>
              <Text style={styles.reason}>{reasonFor(focus.steps)}</Text>
            </View>
          </View>

          {/* Compact route: the next three turns */}
          <View style={{ marginTop: 16 }}>
            {turns.map((t, i) => (
              <View key={t.title} style={styles.turn}>
                <View style={styles.turnRail}>
                  <View style={[styles.turnDot, i === 0 && styles.turnDotNow]} />
                  {i < turns.length - 1 && <View style={styles.turnLine} />}
                </View>
                <View style={styles.turnBody}>
                  <Text style={styles.turnWhen}>{t.when}</Text>
                  <Text style={styles.turnTitle}>{t.title}</Text>
                  {t.detail && <Text style={styles.turnDetail}>{t.detail}</Text>}
                </View>
                {t.cta && (
                  <Pressable
                    style={[styles.cta, t.cta.primary && styles.ctaPrimary]}
                    onPress={() => (t.cta!.to ? router.push(t.cta!.to as never) : t.cta!.onPress?.())}
                  >
                    <Text style={[styles.ctaText, t.cta.primary && styles.ctaTextPrimary]}>{t.cta.label}</Text>
                  </Pressable>
                )}
              </View>
            ))}
          </View>

          {focus.rec && (
            <View style={styles.routeFoot}>
              <Text style={styles.routeFootText}>
                Route: {focus.rec.moves.map(moveText).join(" · ")}
              </Text>
              <Pressable onPress={() => router.push(`/insights?course=${focus.slug}`)}>
                <Text style={styles.routeLink}>Why this route</Text>
              </Pressable>
            </View>
          )}
        </Card>
      )}

      {/* This week: compact strip */}
      <View style={{ marginTop: 24 }}>
        <SectionTitle right={<Text style={styles.muted12}>{INITIAL_BLOCKS.filter((b) => doneBlocks[b.id]).length} of {INITIAL_BLOCKS.length} blocks done</Text>}>
          This week
        </SectionTitle>
        <Card style={{ paddingVertical: 14 }}>
          <View style={styles.weekRow}>
            {week.map((d) => {
              const bs = blocksOn(d);
              const ex = examsOn(d);
              const isToday = sameDay(d, NOW);
              return (
                <View key={d.toISOString()} style={styles.dayCol}>
                  <Text style={styles.dayName}>{d.toLocaleDateString("en-US", { weekday: "short" }).slice(0, 2)}</Text>
                  <View style={[styles.dayNum, isToday && styles.dayNumToday]}>
                    <Text style={[styles.dayNumText, isToday && styles.dayNumTextToday]}>{d.getDate()}</Text>
                  </View>
                  <View style={styles.dayDots}>
                    {ex.length > 0 && <View style={[styles.dot, styles.dotExam]} />}
                    {bs.slice(0, 3).map((b) => (
                      <View key={b.id} style={[styles.dot, doneBlocks[b.id] ? styles.dotDone : styles.dotOpen]} />
                    ))}
                  </View>
                </View>
              );
            })}
          </View>
        </Card>
      </View>

      {/* Upcoming checkpoint + next class */}
      <View style={{ marginTop: 24, gap: 10 }}>
        <Card style={styles.nextCard}>
          <View style={styles.nextIconWrap}>
            <Ionicons name="flag" size={18} color={colors.sunInk} />
          </View>
          <View style={{ flex: 1 }}>
            <Eyebrow>Next checkpoint</Eyebrow>
            <Text style={styles.nextTitle}>{nextExam.code} {nextExam.exam.title}</Text>
            <Text style={styles.nextMeta}>{fmtDay(nextExam.exam.date)}, {fmtTime(nextExam.exam.date)} · in {nextExam.daysToExam} days</Text>
          </View>
        </Card>
        {nextClass && (
          <Card style={styles.nextCard}>
            <View style={[styles.nextIconWrap, { backgroundColor: colors.skySoft }]}>
              <Ionicons name="school" size={18} color={colors.sky} />
            </View>
            <View style={{ flex: 1 }}>
              <Eyebrow color={colors.sky}>Up next</Eyebrow>
              <Text style={styles.nextTitle}>{nextClass.title}</Text>
              <Text style={styles.nextMeta}>Today, {fmtTime(nextClass.at)}</Text>
            </View>
          </Card>
        )}
      </View>

      <Text style={styles.footer}>Demo data · status scored on your device by the same tree as the web app</Text>
    </Screen>
  );
}

const styles = StyleSheet.create({
  h1: { fontSize: 30, fontWeight: "900", color: colors.ink, letterSpacing: -0.5 },
  sub: { marginTop: 6, fontSize: 15, fontWeight: "600", color: colors.muted },
  chips: { flexDirection: "row", flexWrap: "wrap", gap: 8, marginTop: 14 },
  chip: {
    flexDirection: "row", alignItems: "center", gap: 7,
    borderWidth: 2, borderColor: colors.line, borderRadius: 12,
    backgroundColor: colors.ground, paddingVertical: 7, paddingLeft: 10, paddingRight: 12,
  },
  chipText: { fontWeight: "800", fontSize: 13.5, color: colors.ink },
  askBar: {
    marginTop: 16, flexDirection: "row", alignItems: "center", gap: 10,
    borderWidth: 2, borderColor: colors.line, borderRadius: 18, backgroundColor: colors.ground,
    paddingVertical: 8, paddingLeft: 10, paddingRight: 8,
  },
  askText: { flex: 1, fontWeight: "700", fontSize: 14, color: colors.muted },
  askBtn: {
    width: 34, height: 34, borderRadius: 12, backgroundColor: colors.sky,
    alignItems: "center", justifyContent: "center",
  },
  focusTitle: { fontSize: 19, fontWeight: "900", color: colors.ink },
  focusMeta: { marginTop: 2, fontSize: 13.5, fontWeight: "700", color: colors.muted },
  reason: { marginTop: 6, fontSize: 14, fontWeight: "600", color: colors.muted, lineHeight: 20 },
  turn: { flexDirection: "row", gap: 12, alignItems: "flex-start" },
  turnRail: { width: 18, alignItems: "center", alignSelf: "stretch" },
  turnDot: {
    marginTop: 5, width: 14, height: 14, borderRadius: 7,
    borderWidth: 3, borderColor: colors.line, backgroundColor: colors.ground,
  },
  turnDotNow: { borderColor: colors.ink },
  turnLine: { flex: 1, width: 0, borderLeftWidth: 2, borderStyle: "dotted", borderColor: colors.line, marginTop: 2 },
  turnBody: { flex: 1, paddingBottom: 16 },
  turnWhen: { fontSize: 12.5, fontWeight: "700", color: colors.muted },
  turnTitle: { fontSize: 15.5, fontWeight: "800", color: colors.ink, marginTop: 1 },
  turnDetail: { fontSize: 13, fontWeight: "600", color: colors.muted, marginTop: 2 },
  cta: {
    minHeight: 34, paddingHorizontal: 14, borderRadius: 10,
    borderWidth: 2, borderColor: colors.line, borderBottomWidth: 4,
    backgroundColor: colors.ground, justifyContent: "center",
  },
  ctaPrimary: { backgroundColor: colors.tealFace, borderColor: "#109c8a" },
  ctaText: { fontSize: 12, fontWeight: "800", letterSpacing: 0.4, textTransform: "uppercase", color: colors.teal },
  ctaTextPrimary: { color: colors.tealInk },
  routeFoot: { borderTopWidth: 2, borderTopColor: colors.line, marginTop: 4, paddingTop: 12, gap: 4 },
  routeFootText: { fontSize: 12.5, fontWeight: "700", color: colors.muted },
  routeLink: { fontSize: 13.5, fontWeight: "800", color: colors.teal, textDecorationLine: "underline" },
  muted12: { fontSize: 12.5, fontWeight: "700", color: colors.muted },
  weekRow: { flexDirection: "row", justifyContent: "space-between" },
  dayCol: { alignItems: "center", gap: 4, flex: 1 },
  dayName: { fontSize: 11, fontWeight: "700", color: colors.muted },
  dayNum: { width: 32, height: 32, borderRadius: 16, alignItems: "center", justifyContent: "center" },
  dayNumToday: { backgroundColor: colors.ink },
  dayNumText: { fontSize: 14, fontWeight: "800", color: colors.ink },
  dayNumTextToday: { color: "#fff" },
  dayDots: { flexDirection: "row", gap: 3, height: 8, alignItems: "center" },
  dot: { width: 6, height: 6, borderRadius: 3 },
  dotOpen: { borderWidth: 1.5, borderColor: colors.tealFace },
  dotDone: { backgroundColor: colors.tealFace },
  dotExam: { backgroundColor: colors.sun },
  nextCard: { flexDirection: "row", alignItems: "center", gap: 12, paddingVertical: 14 },
  nextIconWrap: { width: 38, height: 38, borderRadius: 12, backgroundColor: colors.sunSoft, alignItems: "center", justifyContent: "center" },
  nextTitle: { fontSize: 16, fontWeight: "800", color: colors.ink, marginTop: 1 },
  nextMeta: { fontSize: 13, fontWeight: "600", color: colors.muted, marginTop: 1 },
  footer: { marginTop: 28, fontSize: 12, fontWeight: "600", color: colors.muted, textAlign: "center" },
});
