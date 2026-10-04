import { Ionicons } from "@expo/vector-icons";
import React, { useMemo, useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { Card, Eyebrow, Screen, SectionTitle, StatusMark } from "../../src/components/ui";
import {
  COURSES, INITIAL_BLOCKS, NOW, PROFILE,
  fmtDay, fmtTime, sameDay,
} from "../../src/data";
import { colors } from "../../src/theme";

type Item = {
  at: string;
  kind: "class" | "study" | "due" | "exam";
  title: string;
  detail?: string;
  id?: string;
};

export default function Plan() {
  const [selected, setSelected] = useState(NOW);
  const [doneBlocks, setDoneBlocks] = useState<Record<string, boolean>>({});
  const [doneTodos, setDoneTodos] = useState<Record<string, boolean>>({});
  const [checkedIn, setCheckedIn] = useState<Record<string, boolean>>({});

  const week = useMemo(() => {
    const monday = new Date(NOW);
    monday.setDate(NOW.getDate() - ((NOW.getDay() + 6) % 7));
    return Array.from({ length: 7 }, (_, i) => {
      const d = new Date(monday);
      d.setDate(monday.getDate() + i);
      return d;
    });
  }, []);

  // Everything on the selected day: class meetings, study blocks, exams, due dates.
  const items: Item[] = useMemo(() => {
    const out: Item[] = [];
    for (const m of PROFILE.classes) if (sameDay(new Date(m.at), selected)) out.push({ at: m.at, kind: "class", title: m.title });
    for (const b of INITIAL_BLOCKS) if (sameDay(new Date(b.at), selected)) out.push({ at: b.at, kind: "study", title: b.title, id: b.id });
    for (const c of COURSES) if (sameDay(new Date(c.exam.date), selected)) out.push({ at: c.exam.date, kind: "exam", title: `${c.code} ${c.exam.title}` });
    for (const t of PROFILE.todos) if (t.due && sameDay(new Date(t.due), selected)) out.push({ at: t.due, kind: "due", title: t.title, id: t.id });
    return out.sort((a, b) => a.at.localeCompare(b.at));
  }, [selected]);

  const checkpoints = [...COURSES].sort((a, b) => +new Date(a.exam.date) - +new Date(b.exam.date));
  const isToday = sameDay(selected, NOW);

  return (
    <Screen>
      <Text style={styles.h1}>Plan</Text>
      <Text style={styles.sub}>Week of {week[0].toLocaleDateString("en-US", { month: "short", day: "numeric" })} — your blocks, deadlines and checkpoints.</Text>

      {/* Day selector */}
      <View style={styles.weekRow}>
        {week.map((d) => {
          const active = sameDay(d, selected);
          const today = sameDay(d, NOW);
          const count = INITIAL_BLOCKS.filter((b) => sameDay(new Date(b.at), d)).length;
          const exam = COURSES.some((c) => sameDay(new Date(c.exam.date), d));
          return (
            <Pressable key={d.toISOString()} onPress={() => setSelected(d)} style={[styles.dayBtn, active && styles.dayBtnActive]}>
              <Text style={[styles.dayName, active && styles.dayNameActive]}>{d.toLocaleDateString("en-US", { weekday: "narrow" })}</Text>
              <Text style={[styles.dayNum, active && styles.dayNumActive]}>{d.getDate()}</Text>
              <View style={styles.dayDots}>
                {exam && <View style={[styles.dot, { backgroundColor: colors.sun }]} />}
                {Array.from({ length: Math.min(3, count) }).map((_, i) => (
                  <View key={i} style={[styles.dot, { backgroundColor: colors.tealFace }]} />
                ))}
              </View>
              {today && <View style={styles.todayPip} />}
            </Pressable>
          );
        })}
      </View>

      {/* Day timeline */}
      <View style={{ marginTop: 20 }}>
        <SectionTitle right={<Text style={styles.muted12}>{items.length} {items.length === 1 ? "thing" : "things"}</Text>}>
          {isToday ? "Today" : fmtDay(selected.toISOString())}
        </SectionTitle>
        {items.length === 0 ? (
          <Card><Text style={styles.emptyText}>Nothing scheduled. A good day for a practice quiz.</Text></Card>
        ) : (
          <Card style={{ paddingVertical: 6, paddingHorizontal: 14 }}>
            {items.map((it, i) => (
              <View key={it.at + it.title} style={[styles.item, i > 0 && styles.itemBorder]}>
                <Text style={styles.itemTime}>{fmtTime(it.at)}</Text>
                <View style={{ flex: 1 }}>
                  <Text style={[styles.itemTitle, it.kind === "study" && { color: colors.tealLip }, (it.id && (doneBlocks[it.id] || doneTodos[it.id])) && styles.itemDone]}>
                    {it.title}
                  </Text>
                  <Text style={styles.itemKind}>
                    {it.kind === "class" ? "Class" : it.kind === "study" ? "Study block" : it.kind === "due" ? "Due" : "Checkpoint"}
                  </Text>
                </View>
                {it.kind === "study" && it.id && (
                  <Pressable
                    onPress={() => setDoneBlocks((m) => ({ ...m, [it.id!]: !m[it.id!] }))}
                    style={[styles.check, doneBlocks[it.id!] && styles.checkDone]}
                  >
                    {doneBlocks[it.id!] && <Ionicons name="checkmark" size={14} color={colors.tealInk} />}
                  </Pressable>
                )}
                {it.kind === "due" && it.id && (
                  <Pressable
                    onPress={() => setDoneTodos((m) => ({ ...m, [it.id!]: !m[it.id!] }))}
                    style={[styles.check, doneTodos[it.id!] && styles.checkDone]}
                  >
                    {doneTodos[it.id!] && <Ionicons name="checkmark" size={14} color={colors.tealInk} />}
                  </Pressable>
                )}
                {it.kind === "class" &&
                  (checkedIn[it.at] ? (
                    <View style={styles.herePill}><Ionicons name="checkmark" size={12} color={colors.teal} /><Text style={styles.hereText}>Here</Text></View>
                  ) : (
                    <Pressable onPress={() => setCheckedIn((m) => ({ ...m, [it.at]: true }))} style={styles.checkInBtn}>
                      <Text style={styles.checkInText}>Check in</Text>
                    </Pressable>
                  ))}
                {it.kind === "exam" && <View style={styles.examPill}><Text style={styles.examPillText}>Exam</Text></View>}
              </View>
            ))}
          </Card>
        )}
      </View>

      {/* Assignments */}
      <View style={{ marginTop: 24 }}>
        <SectionTitle>Assignments</SectionTitle>
        <Card style={{ paddingVertical: 6, paddingHorizontal: 14 }}>
          {PROFILE.todos.map((t, i) => {
            const done = !!doneTodos[t.id];
            const course = COURSES.find((c) => c.slug === t.course);
            return (
              <View key={t.id} style={[styles.item, i > 0 && styles.itemBorder]}>
                <Pressable onPress={() => setDoneTodos((m) => ({ ...m, [t.id]: !m[t.id] }))} style={[styles.check, done && styles.checkDone, { marginRight: 4 }]}>
                  {done && <Ionicons name="checkmark" size={14} color={colors.tealInk} />}
                </Pressable>
                <View style={{ flex: 1 }}>
                  <Text style={[styles.itemTitle, done && styles.itemDone]}>{t.title}</Text>
                  <Text style={styles.itemKind}>
                    {t.detail}{course ? ` · ${course.code}` : ""}
                  </Text>
                </View>
                {course && <StatusMark atRisk={course.result.atRisk} label={false} size={14} />}
              </View>
            );
          })}
        </Card>
      </View>

      {/* Checkpoints */}
      <View style={{ marginTop: 24 }}>
        <SectionTitle>Checkpoints</SectionTitle>
        <View style={{ gap: 8 }}>
          {checkpoints.map((c) => (
            <Card key={c.slug} style={styles.checkpoint}>
              <StatusMark atRisk={c.result.atRisk} label={false} size={18} />
              <View style={{ flex: 1 }}>
                <Text style={styles.itemTitle}>{c.code} {c.exam.title}</Text>
                <Text style={styles.itemKind}>{fmtDay(c.exam.date)}, {fmtTime(c.exam.date)}</Text>
              </View>
              <View style={[styles.countdown, c.daysToExam <= 5 && { backgroundColor: colors.sunSoft }]}>
                <Text style={[styles.countdownText, c.daysToExam <= 5 && { color: colors.sunInk }]}>
                  {c.daysToExam}d
                </Text>
              </View>
            </Card>
          ))}
        </View>
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  h1: { fontSize: 30, fontWeight: "900", color: colors.ink, letterSpacing: -0.5 },
  sub: { marginTop: 6, fontSize: 15, fontWeight: "600", color: colors.muted },
  weekRow: { flexDirection: "row", gap: 5, marginTop: 16 },
  dayBtn: {
    flex: 1, alignItems: "center", paddingVertical: 8, borderRadius: 14,
    borderWidth: 2, borderColor: colors.line, backgroundColor: colors.ground, gap: 2,
  },
  dayBtnActive: { backgroundColor: colors.tealSoft, borderColor: colors.tealFace },
  dayName: { fontSize: 11, fontWeight: "700", color: colors.muted },
  dayNameActive: { color: colors.tealLip },
  dayNum: { fontSize: 15, fontWeight: "800", color: colors.ink },
  dayNumActive: { color: colors.tealLip },
  dayDots: { flexDirection: "row", gap: 2.5, height: 7, alignItems: "center" },
  dot: { width: 5, height: 5, borderRadius: 2.5 },
  todayPip: { position: "absolute", top: 4, right: 4, width: 5, height: 5, borderRadius: 2.5, backgroundColor: colors.ink },
  muted12: { fontSize: 12.5, fontWeight: "700", color: colors.muted },
  emptyText: { fontSize: 14, fontWeight: "600", color: colors.muted },
  item: { flexDirection: "row", alignItems: "center", gap: 10, paddingVertical: 12 },
  itemBorder: { borderTopWidth: 1, borderTopColor: colors.line },
  itemTime: { width: 62, fontSize: 12.5, fontWeight: "700", color: colors.muted, fontVariant: ["tabular-nums"] },
  itemTitle: { fontSize: 15, fontWeight: "800", color: colors.ink },
  itemDone: { color: colors.muted, textDecorationLine: "line-through" },
  itemKind: { fontSize: 12.5, fontWeight: "600", color: colors.muted, marginTop: 1 },
  check: {
    width: 26, height: 26, borderRadius: 8, borderWidth: 2, borderColor: colors.line,
    backgroundColor: colors.ground, alignItems: "center", justifyContent: "center",
  },
  checkDone: { backgroundColor: colors.tealFace, borderColor: "#109c8a" },
  herePill: { flexDirection: "row", alignItems: "center", gap: 4 },
  hereText: { fontSize: 12.5, fontWeight: "800", color: colors.teal },
  checkInBtn: {
    paddingHorizontal: 12, paddingVertical: 6, borderRadius: 10,
    borderWidth: 2, borderColor: colors.line, borderBottomWidth: 4, backgroundColor: colors.ground,
  },
  checkInText: { fontSize: 11.5, fontWeight: "800", letterSpacing: 0.3, textTransform: "uppercase", color: colors.teal },
  examPill: { backgroundColor: colors.sunSoft, paddingHorizontal: 9, paddingVertical: 4, borderRadius: 8 },
  examPillText: { fontSize: 11, fontWeight: "800", color: colors.sunInk, textTransform: "uppercase", letterSpacing: 0.4 },
  checkpoint: { flexDirection: "row", alignItems: "center", gap: 12, paddingVertical: 13 },
  countdown: { backgroundColor: colors.polar, borderRadius: 10, paddingHorizontal: 10, paddingVertical: 5 },
  countdownText: { fontSize: 13, fontWeight: "900", color: colors.ink, fontVariant: ["tabular-nums"] },
});
