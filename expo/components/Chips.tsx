import * as Haptics from "expo-haptics";
import React from "react";
import { Platform, Pressable, StyleSheet, Text, View } from "react-native";

import { useTheme } from "@/lib/theme";

export interface ChipOption<T extends string> {
  value: T;
  label: string;
}

interface ChipsProps<T extends string> {
  options: readonly ChipOption<T>[];
  value: T;
  onChange: (v: T) => void;
}

/** Ряд переключателей-чипов (одиночный выбор), стиль Uber: чёрный активный чип */
export default function Chips<T extends string>({ options, value, onChange }: ChipsProps<T>) {
  const { colors } = useTheme();
  return (
    <View style={styles.wrap}>
      {options.map((o) => {
        const active = o.value === value;
        return (
          <Pressable
            key={o.value}
            onPress={() => {
              if (Platform.OS !== "web") Haptics.selectionAsync();
              onChange(o.value);
            }}
            style={[
              styles.chip,
              { backgroundColor: active ? colors.primary : colors.inputBg, borderColor: active ? colors.primary : colors.border },
            ]}
            testID={`chip-${o.value}`}
          >
            <Text style={[styles.chipText, { color: active ? colors.onPrimary : colors.text }]}>{o.label}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
    paddingVertical: 6,
  },
  chip: {
    paddingHorizontal: 18,
    height: 44,
    borderRadius: 22,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  chipText: {
    fontSize: 15,
    fontWeight: "700" as const,
  },
});
