import * as Haptics from "expo-haptics";
import { useRouter, type Href } from "expo-router";
import { Archive, Trash2 } from "lucide-react-native";
import React from "react";
import { Alert, Image, Platform, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { useSavedCalcs, type SavedCalc } from "@/lib/savedCalcs";
import { useTheme } from "@/lib/theme";

const moduleIcons: Record<string, number> = {
  cementing: require("../assets/images/modules/icon_cementing.png") as number,
  plug: require("../assets/images/modules/icon_plug.png") as number,
  kill: require("../assets/images/modules/icon_kill.png") as number,
  hydro: require("../assets/images/modules/icon_hydro.png") as number,
  packer: require("../assets/images/modules/icon_packer.png") as number,
};

const moduleHrefs: Record<string, Href> = {
  cementing: "/cementing",
  plug: "/plug",
  kill: "/kill",
  hydro: "/hydro",
  packer: "/packer",
};

function subtitle(entry: SavedCalc): string {
  const parts = [entry.fieldName, entry.cluster ? `куст ${entry.cluster}` : "", entry.well ? `скв. ${entry.well}` : ""].filter(
    (p) => !!p,
  );
  return parts.length > 0 ? parts.join(" · ") : "Без подписи";
}

export default function ArchiveScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { colors } = useTheme();
  const { items, remove } = useSavedCalcs();

  const openEntry = (entry: SavedCalc) => {
    if (Platform.OS !== "web") Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    const href = moduleHrefs[entry.moduleKey];
    if (!href) return;
    router.push({ pathname: href, params: { loadId: entry.id } } as never);
  };

  const confirmDelete = (entry: SavedCalc) => {
    if (Platform.OS !== "web") Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    Alert.alert("Удалить расчёт?", `${entry.moduleTitle} — ${subtitle(entry)}`, [
      { text: "Отмена", style: "cancel" },
      { text: "Удалить", style: "destructive", onPress: () => remove(entry.id) },
    ]);
  };

  return (
    <View style={[styles.root, { backgroundColor: colors.background }]}>
      <ScrollView
        contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + 32 }]}
        showsVerticalScrollIndicator={false}
      >
        <Text style={[styles.hint, { color: colors.muted }]}>
          Сохранённые расчёты хранятся офлайн на этом устройстве. Нажмите на карточку, чтобы открыть расчёт со всеми
          введёнными данными.
        </Text>

        {items.length === 0 ? (
          <View style={styles.empty}>
            <Archive size={40} color={colors.muted} />
            <Text style={[styles.emptyTitle, { color: colors.text }]}>Архив пуст</Text>
            <Text style={[styles.emptyText, { color: colors.muted }]}>
              Откройте любой калькулятор и нажмите «Сохранить в архив», чтобы расчёт появился здесь с подписью
              месторождение · куст · скважина · дата.
            </Text>
          </View>
        ) : (
          items.map((entry) => (
            <Pressable
              key={entry.id}
              style={({ pressed }) => [styles.card, { backgroundColor: colors.card, borderColor: colors.border }, pressed && styles.cardPressed]}
              onPress={() => openEntry(entry)}
              testID={`archive-item-${entry.id}`}
            >
              <View style={styles.iconWrap}>
                {moduleIcons[entry.moduleKey] ? (
                  <Image source={moduleIcons[entry.moduleKey]} style={styles.iconImage} resizeMode="contain" />
                ) : (
                  <Archive size={28} color={colors.muted} />
                )}
              </View>
              <View style={styles.cardBody}>
                <Text style={[styles.cardTitle, { color: colors.text }]} numberOfLines={1}>
                  {subtitle(entry)}
                </Text>
                <Text style={[styles.cardMeta, { color: colors.muted }]} numberOfLines={1}>
                  {entry.moduleTitle} · {entry.dateLabel}
                </Text>
              </View>
              <Pressable
                hitSlop={10}
                onPress={() => confirmDelete(entry)}
                style={styles.deleteBtn}
                testID={`delete-archive-${entry.id}`}
              >
                <Trash2 size={19} color={colors.error} />
              </Pressable>
            </Pressable>
          ))
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
  },
  content: {
    padding: 18,
  },
  hint: {
    fontSize: 13.5,
    lineHeight: 18,
    marginBottom: 16,
  },
  empty: {
    alignItems: "center",
    paddingTop: 60,
    paddingHorizontal: 24,
    gap: 10,
  },
  emptyTitle: {
    fontSize: 18,
    fontWeight: "800" as const,
    marginTop: 4,
  },
  emptyText: {
    fontSize: 14,
    lineHeight: 20,
    textAlign: "center" as const,
  },
  card: {
    flexDirection: "row",
    alignItems: "center",
    gap: 14,
    borderRadius: 18,
    borderWidth: 1,
    padding: 14,
    marginBottom: 12,
  },
  cardPressed: {
    opacity: 0.85,
    transform: [{ scale: 0.985 }],
  },
  iconWrap: {
    width: 48,
    height: 48,
    alignItems: "center",
    justifyContent: "center",
  },
  iconImage: {
    width: 44,
    height: 44,
  },
  cardBody: {
    flex: 1,
  },
  cardTitle: {
    fontSize: 16,
    fontWeight: "800" as const,
  },
  cardMeta: {
    fontSize: 13,
    marginTop: 2,
  },
  deleteBtn: {
    padding: 6,
  },
});
