import React from "react";
import { KeyboardAvoidingView, Platform, ScrollView, StyleSheet, Text, View } from "react-native";

import { useTheme } from "@/lib/theme";

interface CalcScreenProps {
  children: React.ReactNode;
  /** Название расчёта — показывается в шапке экрана */
  title?: string;
}

/** Общая обёртка экрана калькулятора: скролл + клавиатура + шапка с названием расчёта */
export default function CalcScreen({ children, title }: CalcScreenProps) {
  const { colors } = useTheme();

  const dateStr = new Date().toLocaleDateString("ru-RU", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });

  return (
    <KeyboardAvoidingView
      style={[styles.flex, { backgroundColor: colors.background }]}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
      keyboardVerticalOffset={Platform.OS === "ios" ? 96 : 0}
    >
      <ScrollView
        style={styles.flex}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        <View style={[styles.content, { backgroundColor: colors.background }]}>
        <View style={styles.brandStrip}>
          <View style={styles.brandTextWrap}>
            <Text style={[styles.brandTitle, { color: colors.text }]} numberOfLines={1}>
              {title ?? "Инженерный расчёт"}
            </Text>
            <Text style={[styles.brandMeta, { color: colors.muted }]} numberOfLines={1}>
              Инженерные расчёты · deallsoft.ru · {dateStr}
            </Text>
          </View>
          <View style={[styles.brandDot, { backgroundColor: colors.accent }]} />
        </View>
        {children}
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  flex: {
    flex: 1,
  },
  content: {
    padding: 16,
    paddingBottom: 48,
  },
  brandStrip: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 10,
    marginBottom: 12,
    paddingHorizontal: 2,
  },
  brandTextWrap: {
    flex: 1,
  },
  brandTitle: {
    fontSize: 17,
    fontWeight: "800" as const,
  },
  brandMeta: {
    fontSize: 12,
    fontWeight: "600" as const,
    marginTop: 1,
  },
  brandDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
  },
});
