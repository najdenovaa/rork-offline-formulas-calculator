import * as Haptics from "expo-haptics";
import { FolderPlus, X } from "lucide-react-native";
import React, { useState } from "react";
import {
  Alert,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";

import { Card, SectionTitle } from "@/components/Results";
import { useTheme } from "@/lib/theme";
import { useSavedCalcs } from "@/lib/savedCalcs";

interface SaveCalcCardProps {
  /** Ключ модуля, напр. "cementing" — используется для перехода из архива обратно на экран */
  moduleKey: string;
  /** Название модуля, показывается в архиве */
  moduleTitle: string;
  /** Строит текстовый снимок текущего расчёта для сохранения */
  buildText: () => string;
}

function todayLabel(): string {
  return new Date().toLocaleDateString("ru-RU", { day: "2-digit", month: "2-digit", year: "numeric" });
}

/** Карточка сохранения расчёта в офлайн-архив приложения с подписью месторождение/куст/скважина/дата */
export default function SaveCalcCard({ moduleKey, moduleTitle, buildText }: SaveCalcCardProps) {
  const { colors } = useTheme();
  const { save } = useSavedCalcs();
  const [visible, setVisible] = useState<boolean>(false);
  const [fieldName, setFieldName] = useState<string>("");
  const [cluster, setCluster] = useState<string>("");
  const [well, setWell] = useState<string>("");
  const [dateLabel, setDateLabel] = useState<string>(todayLabel());

  const haptic = () => {
    if (Platform.OS !== "web") Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
  };

  const open = () => {
    haptic();
    setDateLabel(todayLabel());
    setVisible(true);
  };

  const handleSave = () => {
    if (!fieldName.trim() && !cluster.trim() && !well.trim()) {
      Alert.alert("Заполните подпись", "Укажите хотя бы месторождение, куст или скважину, чтобы найти расчёт в архиве.");
      return;
    }
    save({
      moduleKey,
      moduleTitle,
      fieldName: fieldName.trim(),
      cluster: cluster.trim(),
      well: well.trim(),
      dateLabel: dateLabel.trim() || todayLabel(),
      text: buildText(),
    });
    if (Platform.OS !== "web") Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    setVisible(false);
    Alert.alert("Сохранено", "Расчёт добавлен в архив на главном экране.");
  };

  return (
    <Card>
      <SectionTitle>Архив расчётов</SectionTitle>
      <Pressable
        style={({ pressed }) => [styles.btn, { backgroundColor: colors.primarySoft }, pressed && styles.btnPressed]}
        onPress={open}
        testID="save-to-archive-btn"
      >
        <FolderPlus size={17} color={colors.text} />
        <Text style={[styles.btnText, { color: colors.text }]}>Сохранить в архив</Text>
      </Pressable>

      <Modal visible={visible} animationType="slide" transparent onRequestClose={() => setVisible(false)}>
        <KeyboardAvoidingView style={styles.modalBackdrop} behavior={Platform.OS === "ios" ? "padding" : undefined}>
          <View style={[styles.modalCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
            <View style={styles.modalHead}>
              <Text style={[styles.modalTitle, { color: colors.text }]}>Сохранить расчёт</Text>
              <Pressable onPress={() => setVisible(false)} hitSlop={10} testID="close-save-modal">
                <X size={22} color={colors.muted} />
              </Pressable>
            </View>
            <Text style={[styles.label, { color: colors.muted }]}>Месторождение</Text>
            <TextInput
              style={[styles.input, { color: colors.text, borderColor: colors.border, backgroundColor: colors.inputBg }]}
              value={fieldName}
              onChangeText={setFieldName}
              placeholder="напр. Приобское"
              placeholderTextColor={colors.muted}
              testID="save-field-input"
            />
            <Text style={[styles.label, { color: colors.muted }]}>Куст</Text>
            <TextInput
              style={[styles.input, { color: colors.text, borderColor: colors.border, backgroundColor: colors.inputBg }]}
              value={cluster}
              onChangeText={setCluster}
              placeholder="напр. 14"
              placeholderTextColor={colors.muted}
              testID="save-cluster-input"
            />
            <Text style={[styles.label, { color: colors.muted }]}>Скважина</Text>
            <TextInput
              style={[styles.input, { color: colors.text, borderColor: colors.border, backgroundColor: colors.inputBg }]}
              value={well}
              onChangeText={setWell}
              placeholder="напр. 1025"
              placeholderTextColor={colors.muted}
              testID="save-well-input"
            />
            <Text style={[styles.label, { color: colors.muted }]}>Дата</Text>
            <TextInput
              style={[styles.input, { color: colors.text, borderColor: colors.border, backgroundColor: colors.inputBg }]}
              value={dateLabel}
              onChangeText={setDateLabel}
              placeholder="ДД.ММ.ГГГГ"
              placeholderTextColor={colors.muted}
              testID="save-date-input"
            />
            <Pressable
              style={({ pressed }) => [styles.saveBtn, { backgroundColor: colors.accent }, pressed && styles.btnPressed]}
              onPress={handleSave}
              testID="confirm-save-btn"
            >
              <Text style={styles.saveBtnText}>Сохранить</Text>
            </Pressable>
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </Card>
  );
}

const styles = StyleSheet.create({
  btn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    paddingVertical: 12,
    borderRadius: 14,
  },
  btnPressed: {
    opacity: 0.85,
    transform: [{ scale: 0.985 }],
  },
  btnText: {
    fontSize: 14,
    fontWeight: "700" as const,
  },
  modalBackdrop: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.55)",
    justifyContent: "flex-end",
  },
  modalCard: {
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    borderWidth: 1,
    borderBottomWidth: 0,
    padding: 18,
    paddingBottom: 34,
  },
  modalHead: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 12,
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: "800" as const,
  },
  label: {
    fontSize: 12.5,
    fontWeight: "700" as const,
    marginBottom: 6,
    marginTop: 8,
    textTransform: "uppercase" as const,
    letterSpacing: 0.5,
  },
  input: {
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 11,
    fontSize: 15,
  },
  saveBtn: {
    marginTop: 18,
    paddingVertical: 14,
    borderRadius: 14,
    alignItems: "center",
  },
  saveBtnText: {
    fontSize: 15,
    fontWeight: "800" as const,
    color: "#FFFFFF",
  },
});
