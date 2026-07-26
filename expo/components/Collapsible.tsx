import * as Haptics from "expo-haptics";
import { ChevronDown } from "lucide-react-native";
import React, { useState } from "react";
import { LayoutAnimation, Platform, Pressable, StyleSheet, Text, UIManager, View } from "react-native";

import { Card } from "@/components/Results";
import { useTheme } from "@/lib/theme";

if (Platform.OS === "android" && UIManager.setLayoutAnimationEnabledExperimental) {
  UIManager.setLayoutAnimationEnabledExperimental(true);
}

interface CollapsibleProps {
  title: string;
  subtitle?: string;
  children: React.ReactNode;
  /** Открыт ли блок изначально */
  defaultOpen?: boolean;
}

/**
 * Разворачиваемый блок ввода — вместо длинной портянки полей мастер разворачивает
 * только нужный раздел. Заголовок всегда виден, содержимое скрыто, пока не открыт.
 */
export default function Collapsible({ title, subtitle, children, defaultOpen = false }: CollapsibleProps) {
  const { colors } = useTheme();
  const [open, setOpen] = useState<boolean>(defaultOpen);

  const toggle = () => {
    if (Platform.OS !== "web") Haptics.selectionAsync();
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    setOpen((v) => !v);
  };

  return (
    <Card>
      <Pressable style={styles.head} onPress={toggle} testID={`collapsible-${title}`}>
        <View style={styles.headText}>
          <Text style={[styles.title, { color: colors.muted }]}>{title}</Text>
          {subtitle ? (
            <Text style={[styles.subtitle, { color: colors.text }]} numberOfLines={1}>
              {subtitle}
            </Text>
          ) : null}
        </View>
        <View style={[styles.chevronWrap, open && styles.chevronOpen]}>
          <ChevronDown size={20} color={colors.muted} />
        </View>
      </Pressable>
      {open ? <View style={styles.body}>{children}</View> : null}
    </Card>
  );
}

const styles = StyleSheet.create({
  head: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 10,
  },
  headText: {
    flex: 1,
  },
  title: {
    fontSize: 14,
    fontWeight: "800" as const,
    textTransform: "uppercase" as const,
    letterSpacing: 0.8,
  },
  subtitle: {
    fontSize: 13,
    fontWeight: "500" as const,
    marginTop: 2,
  },
  chevronWrap: {
    transform: [{ rotate: "0deg" }],
  },
  chevronOpen: {
    transform: [{ rotate: "180deg" }],
  },
  body: {
    marginTop: 12,
  },
});
