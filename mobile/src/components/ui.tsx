import React, { type ReactNode } from "react";
import { ScrollView, StyleSheet, Text, View, type StyleProp, type ViewStyle } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import Svg, { Circle, Path } from "react-native-svg";
import { colors, radius } from "../theme";

// A screen: safe area + scrolling column of cards, generous spacing.
export function Screen({ children, scroll = true }: { children: ReactNode; scroll?: boolean }) {
  return (
    <SafeAreaView style={styles.safe} edges={["top", "left", "right"]}>
      {scroll ? (
        <ScrollView style={styles.scroll} contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
          {children}
        </ScrollView>
      ) : (
        <View style={[styles.content, styles.fill]}>{children}</View>
      )}
    </SafeAreaView>
  );
}

// Flat keylined panel, matching `panel` on web.
export function Card({ children, style }: { children: ReactNode; style?: StyleProp<ViewStyle> }) {
  return <View style={[styles.card, style]}>{children}</View>;
}

// Shape + words, never color alone: filled check = on track, hollow ring = worth a check-in.
export function StatusMark({ atRisk, label = true, size = 20 }: { atRisk: boolean; label?: boolean; size?: number }) {
  const text = atRisk ? "Worth a check-in" : "On track";
  return (
    <View style={styles.statusRow}>
      {atRisk ? (
        <View
          style={{
            width: size,
            height: size,
            borderRadius: size / 2,
            borderWidth: Math.max(3, size / 4),
            borderColor: colors.sun,
          }}
        />
      ) : (
        <View
          style={{
            width: size,
            height: size,
            borderRadius: size / 2,
            backgroundColor: colors.teal,
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <Svg width={size * 0.62} height={size * 0.62} viewBox="0 0 24 24">
            <Path d="M4 12.5l5.2 5L20 7" stroke="#fff" strokeWidth={3.6} fill="none" strokeLinecap="round" strokeLinejoin="round" />
          </Svg>
        </View>
      )}
      {label && <Text style={[styles.statusText, { color: atRisk ? colors.sunInk : colors.teal }]}>{text}</Text>}
    </View>
  );
}

export function SectionTitle({ children, right }: { children: ReactNode; right?: ReactNode }) {
  return (
    <View style={styles.sectionRow}>
      <Text style={styles.sectionTitle}>{children}</Text>
      {right}
    </View>
  );
}

export function Eyebrow({ children, color = colors.muted }: { children: ReactNode; color?: string }) {
  return <Text style={[styles.eyebrow, { color }]}>{children}</Text>;
}

export const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.ground },
  scroll: { flex: 1 },
  fill: { flex: 1 },
  content: { paddingHorizontal: 20, paddingTop: 8, paddingBottom: 32 },
  card: {
    backgroundColor: colors.ground,
    borderWidth: 2,
    borderColor: colors.line,
    borderRadius: radius.tile,
    padding: 18,
  },
  statusRow: { flexDirection: "row", alignItems: "center", gap: 8 },
  statusText: { fontWeight: "800", fontSize: 15 },
  sectionRow: { flexDirection: "row", alignItems: "baseline", justifyContent: "space-between", marginBottom: 10 },
  sectionTitle: { fontSize: 17, fontWeight: "800", color: colors.ink },
  eyebrow: { fontSize: 12, fontWeight: "800", letterSpacing: 1.1, textTransform: "uppercase" },
});
