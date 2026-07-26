import { AlertTriangle, CheckCircle2, Info, XCircle } from "lucide-react-native";
import React from "react";
import { Platform, StyleSheet, Text, View } from "react-native";

import { useTheme } from "@/lib/theme";

const monoFont = Platform.select({ ios: "Menlo", android: "monospace", default: "monospace" });

export function Card({ children }: { children: React.ReactNode }) {
  const { colors } = useTheme();
  return <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}>{children}</View>;
}

export function SectionTitle({ children }: { children: string }) {
  const { colors } = useTheme();
  return <Text style={[styles.sectionTitle, { color: colors.muted }]}>{children}</Text>;
}

interface ResultRowProps {
  label: string;
  value: string;
  unit?: string;
  accent?: boolean;
}

/** Строка результата: подпись — крупное значение (моноширинный шрифт) */
export function ResultRow({ label, value, unit, accent }: ResultRowProps) {
  const { colors } = useTheme();
  return (
    <View style={[styles.resultRow, { borderBottomColor: colors.border }]}>
      <Text style={[styles.resultLabel, { color: colors.muted }]} numberOfLines={3}>
        {label}
      </Text>
      <Text style={[styles.resultValue, { color: accent ? colors.accent : colors.text }]}>
        {value}
        {unit ? <Text style={[styles.resultUnit, { color: colors.muted }]}> {unit}</Text> : null}
      </Text>
    </View>
  );
}

interface HeroResultProps {
  label: string;
  value: string;
  unit: string;
}

/** Крупный главный результат расчёта — большая цифра в стиле Uber */
export function HeroResult({ label, value, unit }: HeroResultProps) {
  const { colors } = useTheme();
  return (
    <View style={[styles.hero, { backgroundColor: colors.primary }]}>
      <Text style={[styles.heroLabel, { color: colors.onPrimary }]}>{label}</Text>
      <View style={styles.heroValueRow}>
        <Text style={[styles.heroValue, { color: colors.onPrimary }]}>{value}</Text>
        <Text style={[styles.heroUnit, { color: colors.onPrimary }]}>{unit}</Text>
      </View>
    </View>
  );
}

export type BannerKind = "error" | "warning" | "success" | "info";

interface BannerProps {
  kind: BannerKind;
  text: string;
}

export function Banner({ kind, text }: BannerProps) {
  const { colors } = useTheme();
  const cfg: Record<BannerKind, { bg: string; fg: string }> = {
    error: { bg: colors.errorBg, fg: colors.error },
    warning: { bg: colors.warningBg, fg: colors.warning },
    success: { bg: colors.successBg, fg: colors.success },
    info: { bg: colors.accentSoft, fg: colors.accent },
  };
  const c = cfg[kind];
  const Icon = kind === "error" ? XCircle : kind === "warning" ? AlertTriangle : kind === "success" ? CheckCircle2 : Info;
  return (
    <View style={[styles.banner, { backgroundColor: c.bg }]}>
      <Icon size={20} color={c.fg} style={styles.bannerIcon} />
      <Text style={[styles.bannerText, { color: c.fg }]}>{text}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    borderRadius: 20,
    borderWidth: 1,
    padding: 18,
    marginBottom: 14,
  },
  sectionTitle: {
    fontSize: 14,
    fontWeight: "800" as const,
    textTransform: "uppercase" as const,
    letterSpacing: 0.8,
    marginBottom: 8,
  },
  resultRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
    paddingVertical: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  resultLabel: {
    flex: 1,
    fontSize: 15,
    lineHeight: 20,
  },
  resultValue: {
    fontSize: 19,
    fontFamily: monoFont,
    fontWeight: "700" as const,
  },
  resultUnit: {
    fontSize: 13,
    fontWeight: "500" as const,
  },
  hero: {
    borderRadius: 18,
    paddingVertical: 18,
    paddingHorizontal: 18,
    marginBottom: 12,
  },
  heroLabel: {
    fontSize: 14,
    fontWeight: "600" as const,
    opacity: 0.75,
    marginBottom: 4,
  },
  heroValueRow: {
    flexDirection: "row",
    alignItems: "baseline",
    gap: 8,
  },
  heroValue: {
    fontSize: 44,
    fontFamily: monoFont,
    fontWeight: "800" as const,
    letterSpacing: -1,
  },
  heroUnit: {
    fontSize: 18,
    fontWeight: "600" as const,
    opacity: 0.75,
  },
  banner: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 10,
    borderRadius: 14,
    padding: 14,
    marginTop: 10,
  },
  bannerIcon: {
    marginTop: 1,
  },
  bannerText: {
    flex: 1,
    fontSize: 14,
    lineHeight: 19,
    fontWeight: "500" as const,
  },
});
