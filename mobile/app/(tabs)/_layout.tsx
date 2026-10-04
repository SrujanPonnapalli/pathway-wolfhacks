import { Ionicons } from "@expo/vector-icons";
import { Tabs } from "expo-router";
import React from "react";
import { VivaGlyph } from "../../src/components/VivaOrb";
import { colors } from "../../src/theme";

export default function TabLayout() {
  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: colors.teal,
        tabBarInactiveTintColor: colors.muted,
        tabBarLabelStyle: { fontSize: 11, fontWeight: "800" },
        tabBarStyle: {
          backgroundColor: colors.ground,
          borderTopColor: colors.line,
          borderTopWidth: 1.5,
          paddingTop: 4,
        },
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: "Home",
          tabBarIcon: ({ color, size, focused }) => <Ionicons name={focused ? "map" : "map-outline"} size={size} color={color} />,
        }}
      />
      <Tabs.Screen
        name="plan"
        options={{
          title: "Plan",
          tabBarIcon: ({ color, size, focused }) => <Ionicons name={focused ? "calendar" : "calendar-outline"} size={size} color={color} />,
        }}
      />
      <Tabs.Screen
        name="viva"
        options={{
          title: "Viva",
          tabBarIcon: ({ size, focused }) => <VivaGlyph size={size + 2} color={focused ? colors.sky : "#a9b0b7"} />,
        }}
      />
      <Tabs.Screen
        name="insights"
        options={{
          title: "Insights",
          tabBarIcon: ({ color, size, focused }) => <Ionicons name={focused ? "pulse" : "pulse-outline"} size={size} color={color} />,
        }}
      />
    </Tabs>
  );
}
