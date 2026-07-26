import React, { memo } from "react";
import { Platform, StyleSheet, Text, TextInput, View } from "react-native";

import { useTheme } from "@/lib/theme";

const monoFont = Platform.select({ ios: "Menlo", android: "monospace", default: "monospace" });

interface NumFieldProps {
  label: string;
  unit?: string;
  value: string;
  onChangeText: (v: string) => void;
  testID?: string;
}

/** Числовое поле: крупная подпись слева, крупное значение с единицей справа */
const NumField = memo(function NumField({ label, unit, value, onChangeText, testID }: NumFieldProps) {
  const { colors } = useTheme();
  return (
    <View style={styles.row}>
      <Text style={[styles.label, { color: colors.text }]} numberOfLines={3}>
        {label}
      </Text>
      <View style={[styles.inputWrap, { backgroundColor: colors.inputBg, borderColor: colors.border }]}>
        <TextInput
          style={[styles.input, { color: colors.text }]}
          value={value}
          onChangeText={onChangeText}
          keyboardType="decimal-pad"
          inputMode="decimal"
          selectTextOnFocus
          placeholder="0"
          placeholderTextColor={colors.muted}
          testID={testID}
        />
        {unit ? <Text style={[styles.unit, { color: colors.muted }]}>{unit}</Text> : null}
      </View>
    </View>
  );
});

export default NumField;

const styles = StyleSheet.create({
  row: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
    paddingVertical: 8,
  },
  label: {
    flex: 1,
    fontSize: 16,
    fontWeight: "500" as const,
    lineHeight: 21,
  },
  inputWrap: {
    flexDirection: "row",
    alignItems: "center",
    borderWidth: 1,
    borderRadius: 14,
    paddingHorizontal: 14,
    height: 58,
    minWidth: 150,
  },
  input: {
    flex: 1,
    fontSize: 22,
    fontWeight: "700" as const,
    fontFamily: monoFont,
    textAlign: "right",
    paddingVertical: 0,
  },
  unit: {
    fontSize: 14,
    fontWeight: "600" as const,
    marginLeft: 8,
    minWidth: 28,
  },
});
