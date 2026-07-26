import * as Haptics from "expo-haptics";
import { LinearGradient } from "expo-linear-gradient";
import { useRouter, type Href } from "expo-router";
import { Archive, ArrowRight, FileText, Globe, Moon, Smartphone, Sun } from "lucide-react-native";
import React from "react";
import { Image, Linking, Platform, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { useSavedCalcs } from "@/lib/savedCalcs";
import { useTheme, type ThemeMode } from "@/lib/theme";

interface Module {
  title: string;
  description: string;
  icon: number;
  href: Href;
}

const modules: Module[] = [
  {
    title: "Цементирование ОК",
    description: "Объёмы затруба, цемент, вода, продавка, давления",
    icon: require("../assets/images/modules/icon_cementing.png") as number,
    href: "/cementing",
  },
  {
    title: "Цементный мост",
    description: "Сбалансированный мост: объёмы, высоты, время",
    icon: require("../assets/images/modules/icon_plug.png") as number,
    href: "/plug",
  },
  {
    title: "Глушение скважины",
    description: "Плотность, объём, давления, рецептура солей",
    icon: require("../assets/images/modules/icon_kill.png") as number,
    href: "/kill",
  },
  {
    title: "Гидростатика и ЭЦП",
    description: "Давление, градиент, репрессия/депрессия",
    icon: require("../assets/images/modules/icon_hydro.png") as number,
    href: "/hydro",
  },
  {
    title: "Срыв пакера (КРС)",
    description: "Удержание, усилие срыва, предел колонны",
    icon: require("../assets/images/modules/icon_packer.png") as number,
    href: "/packer",
  },
];

const themeModes: { value: ThemeMode; icon: React.ComponentType<{ size?: number; color?: string }> }[] = [
  { value: "system", icon: Smartphone },
  { value: "light", icon: Sun },
  { value: "dark", icon: Moon },
];

export default function HomeScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { colors, mode, setMode } = useTheme();
  const { items: savedItems } = useSavedCalcs();

  return (
    <View style={[styles.root, { backgroundColor: colors.background }]}>
      <LinearGradient
        colors={[colors.heroFrom, colors.heroVia, colors.heroTo]}
        start={{ x: 0, y: 0 }}
        end={{ x: 0, y: 1 }}
        style={[styles.hero, { paddingTop: insets.top + 24 }]}
      >
        <View style={styles.heroTopRow}>
          <Image
            source={require("../assets/images/modules/deall_logo.png")}
            style={styles.heroLogo}
            resizeMode="contain"
          />
          <View style={styles.themeSwitch}>
            {themeModes.map((m) => {
              const Icon = m.icon;
              const active = mode === m.value;
              return (
                <Pressable
                  key={m.value}
                  onPress={() => {
                    if (Platform.OS !== "web") Haptics.selectionAsync();
                    setMode(m.value);
                  }}
                  style={[styles.themeBtn, active && styles.themeBtnActive]}
                  testID={`theme-${m.value}`}
                >
                  <Icon size={16} color={active ? "#232A2E" : "rgba(255,255,255,0.75)"} />
                </Pressable>
              );
            })}
          </View>
        </View>

        <View style={styles.heroAccentBar} />
        <Text style={styles.heroTitle}>Инженерные{"\n"}расчёты</Text>
        <Text style={styles.heroSupport}>При поддержке:</Text>
        <Text style={styles.heroSupportCompanies} numberOfLines={1} adjustsFontSizeToFit>
          <Text style={styles.heroSupportStrong}>ООО «Геолад-СТ»</Text> и <Text style={styles.heroSupportStrong}>ООО «Нефтесервис»</Text>
        </Text>
      </LinearGradient>

      <ScrollView
        style={styles.list}
        contentContainerStyle={[styles.listContent, { paddingBottom: insets.bottom + 32 }]}
        showsVerticalScrollIndicator={false}
      >
        <Text style={[styles.sectionLabel, { color: colors.muted }]}>Модули</Text>
        {modules.map((m) => (
          <Pressable
            key={m.title}
            style={({ pressed }) => [
              styles.card,
              { backgroundColor: colors.card },
              pressed && styles.cardPressed,
            ]}
            onPress={() => {
              if (Platform.OS !== "web") Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
              router.push(m.href);
            }}
            testID={`module-${m.title}`}
          >
            <View style={styles.iconWrap}>
              <Image source={m.icon} style={styles.iconImage} resizeMode="contain" />
            </View>
            <View style={styles.cardBody}>
              <Text style={[styles.cardTitle, { color: colors.text }]}>{m.title}</Text>
              <Text style={[styles.cardDesc, { color: colors.muted }]}>{m.description}</Text>
            </View>
            <ArrowRight size={22} color={colors.text} />
          </Pressable>
        ))}

        <Pressable
          style={({ pressed }) => [styles.archiveRow, pressed && styles.cardPressed]}
          onPress={() => {
            if (Platform.OS !== "web") Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
            router.push("/archive");
          }}
          testID="archive-card"
        >
          <Archive size={17} color={colors.accent} />
          <Text style={[styles.archiveRowText, { color: colors.text }]}>Архив расчётов</Text>
          {savedItems.length > 0 ? (
            <View style={[styles.archiveBadge, { backgroundColor: colors.accentSoft }]}>
              <Text style={[styles.archiveBadgeText, { color: colors.accent }]}>{savedItems.length}</Text>
            </View>
          ) : null}
          <ArrowRight size={16} color={colors.muted} />
        </Pressable>

        <Pressable
          style={({ pressed }) => [styles.legalLink, pressed && styles.cardPressed]}
          onPress={() => {
            if (Platform.OS !== "web") Haptics.selectionAsync();
            router.push("/terms");
          }}
          testID="legal-link"
        >
          <FileText size={16} color={colors.muted} />
          <Text style={[styles.legalLinkText, { color: colors.muted }]}>
            Пользовательское соглашение и политика конфиденциальности
          </Text>
        </Pressable>

        <Pressable
          style={({ pressed }) => [styles.legalLink, styles.siteLink, pressed && styles.cardPressed]}
          onPress={() => {
            if (Platform.OS !== "web") Haptics.selectionAsync();
            Linking.openURL("https://deallsoft.ru").catch(() => undefined);
          }}
          testID="site-link"
        >
          <Globe size={16} color={colors.accent} />
          <Text style={[styles.legalLinkText, styles.siteLinkText, { color: colors.accent }]}>
            deallsoft.ru
          </Text>
        </Pressable>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
  },
  hero: {
    paddingHorizontal: 22,
    paddingBottom: 30,
  },
  heroTopRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  heroLogo: {
    width: 132,
    height: 44,
  },
  themeSwitch: {
    flexDirection: "row",
    backgroundColor: "rgba(255,255,255,0.12)",
    borderRadius: 20,
    padding: 3,
    gap: 2,
  },
  themeBtn: {
    width: 34,
    height: 34,
    borderRadius: 17,
    alignItems: "center",
    justifyContent: "center",
  },
  themeBtnActive: {
    backgroundColor: "#FFFFFF",
  },
  heroAccentBar: {
    width: 44,
    height: 5,
    borderRadius: 3,
    backgroundColor: "#33958B",
    marginTop: 26,
  },
  heroTitle: {
    fontSize: 38,
    fontWeight: "600" as const,
    color: "#FFFFFF",
    letterSpacing: -0.3,
    lineHeight: 42,
    marginTop: 12,
  },
  heroSupport: {
    fontSize: 13,
    color: "rgba(255,255,255,0.55)",
    marginTop: 14,
    lineHeight: 18,
  },
  heroSupportCompanies: {
    fontSize: 15,
    color: "rgba(255,255,255,0.75)",
    marginTop: 4,
    lineHeight: 21,
  },
  heroSupportStrong: {
    color: "#7FD1C7",
    fontWeight: "700" as const,
  },
  list: {
    flex: 1,
  },
  listContent: {
    padding: 18,
  },
  sectionLabel: {
    fontSize: 14,
    fontWeight: "800" as const,
    textTransform: "uppercase" as const,
    letterSpacing: 1.2,
    marginBottom: 14,
    marginTop: 10,
  },
  card: {
    flexDirection: "row",
    alignItems: "center",
    gap: 16,
    borderRadius: 20,
    padding: 16,
    marginBottom: 12,
    shadowColor: "#0C1112",
    shadowOpacity: 0.06,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 4 },
    elevation: 2,
  },
  cardPressed: {
    opacity: 0.85,
    transform: [{ scale: 0.985 }],
  },
  iconWrap: {
    width: 64,
    height: 64,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "transparent",
  },
  iconImage: {
    width: 60,
    height: 60,
  },
  cardBody: {
    flex: 1,
  },
  cardTitle: {
    fontSize: 18,
    fontWeight: "800" as const,
  },
  cardDesc: {
    fontSize: 14,
    marginTop: 3,
    lineHeight: 19,
  },
  archiveRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    alignSelf: "center",
    paddingVertical: 10,
    paddingHorizontal: 6,
    marginTop: 2,
  },
  archiveRowText: {
    fontSize: 14,
    fontWeight: "700" as const,
  },
  archiveBadge: {
    minWidth: 20,
    height: 20,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 5,
  },
  archiveBadgeText: {
    fontSize: 11,
    fontWeight: "800" as const,
  },
  legalLink: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    paddingVertical: 16,
    paddingHorizontal: 12,
  },
  legalLinkText: {
    fontSize: 13,
    fontWeight: "600" as const,
    textAlign: "center" as const,
    flexShrink: 1,
  },
  siteLink: {
    paddingVertical: 4,
    marginTop: -14,
    marginBottom: 10,
  },
  siteLinkText: {
    fontWeight: "700" as const,
  },
});
