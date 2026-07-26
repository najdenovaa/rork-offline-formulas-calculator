import * as Clipboard from "expo-clipboard";
import * as DocumentPicker from "expo-document-picker";
import * as FileSystem from "expo-file-system/legacy";
import * as Haptics from "expo-haptics";
import * as Sharing from "expo-sharing";
import {
  Clipboard as ClipboardIcon,
  FileText,
  FileUp,
  Mail,
  RotateCcw,
  Save,
  Send,
} from "lucide-react-native";
import React, { useState } from "react";
import { Alert, Platform, Pressable, StyleSheet, Switch, Text, TextInput, View } from "react-native";

import { useTheme } from "@/lib/theme";
import { useSavedCalcs } from "@/lib/savedCalcs";

export interface ImportResult {
  ok: boolean;
  message: string;
}

type CalcMode = "standard" | "advanced";

interface ActionsBarProps {
  /** Ключ модуля, напр. "cementing" — используется для меток обмена/архива */
  moduleKey: string;
  /** Название модуля, показывается в архиве и в диалогах обмена */
  moduleTitle: string;
  /** Строит текстовый снимок текущего расчёта */
  buildText: () => string;
  /** Разбирает вставленный текст и применяет его к состоянию экрана */
  onImportText: (text: string) => ImportResult;
  /** Обнуляет расчёт целиком до значений по умолчанию */
  onReset: () => void;
  /** Режим расчёта — если передан, показывается компактный тумблер */
  mode?: CalcMode;
  onModeChange?: (m: CalcMode) => void;
}

function todayLabel(): string {
  return new Date().toLocaleDateString("ru-RU", { day: "2-digit", month: "2-digit", year: "numeric" });
}

/**
 * Компактная панель действий калькулятора: конверт (обмен расчётом текстом,
 * раскрывающееся поле), дискета (сохранить в архив, раскрывающаяся форма),
 * тумблер режима расчёта (только 2 названия, без пояснений) и кнопка сброса.
 * Заменяет собой прежние громоздкие карточки обмена/архива/режима.
 */
export default function ActionsBar({
  moduleKey,
  moduleTitle,
  buildText,
  onImportText,
  onReset,
  mode,
  onModeChange,
}: ActionsBarProps) {
  const { colors } = useTheme();
  const { save } = useSavedCalcs();
  const [openPanel, setOpenPanel] = useState<"share" | "save" | null>(null);
  const [pasteText, setPasteText] = useState<string>("");
  const [isBusy, setIsBusy] = useState<boolean>(false);
  const [copyLabel, setCopyLabel] = useState<string>("Скопировать");
  const [fieldName, setFieldName] = useState<string>("");
  const [cluster, setCluster] = useState<string>("");
  const [well, setWell] = useState<string>("");
  const [dateLabel, setDateLabel] = useState<string>(todayLabel());

  const haptic = () => {
    if (Platform.OS !== "web") Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
  };

  const toggleShare = () => {
    haptic();
    setPasteText("");
    setOpenPanel((p) => (p === "share" ? null : "share"));
  };

  const toggleSave = () => {
    haptic();
    setDateLabel(todayLabel());
    setOpenPanel((p) => (p === "save" ? null : "save"));
  };

  const handleReset = () => {
    haptic();
    Alert.alert("Обнулить расчёт?", "Все введённые значения этого расчёта будут удалены безвозвратно.", [
      { text: "Отмена", style: "cancel" },
      {
        text: "Обнулить",
        style: "destructive",
        onPress: () => {
          onReset();
          if (Platform.OS !== "web") Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        },
      },
    ]);
  };

  const handleShareText = async () => {
    haptic();
    if (isBusy) return;
    try {
      setIsBusy(true);
      const text = buildText();
      if (Platform.OS === "web") {
        await Clipboard.setStringAsync(text);
        Alert.alert("Скопировано", "Текст расчёта скопирован в буфер обмена.");
        return;
      }
      const { Share } = require("react-native") as typeof import("react-native");
      await Share.share(
        Platform.OS === "ios" ? { message: text } : { message: text, title: moduleTitle },
        { dialogTitle: `Отправить расчёт: ${moduleTitle}` },
      );
    } catch (e) {
      console.log("[ActionsBar] share text error", e);
      Alert.alert("Ошибка", "Не удалось отправить расчёт. Попробуйте ещё раз или скопируйте текст.");
    } finally {
      setIsBusy(false);
    }
  };

  const handleExportFile = async () => {
    haptic();
    if (Platform.OS === "web") {
      Alert.alert("Недоступно", "Отправка файла доступна в мобильном приложении.");
      return;
    }
    if (isBusy) return;
    try {
      setIsBusy(true);
      const text = buildText();
      const safeName = moduleTitle.replace(/[^\p{L}\p{N}]+/gu, "_").toLowerCase();
      const fileUri = `${FileSystem.cacheDirectory ?? ""}${safeName}_${Date.now()}.txt`;
      await FileSystem.writeAsStringAsync(fileUri, text, { encoding: FileSystem.EncodingType.UTF8 });
      const canShare = await Sharing.isAvailableAsync();
      if (!canShare) {
        Alert.alert("Недоступно", "Отправка файлов недоступна на этом устройстве.");
        return;
      }
      await Sharing.shareAsync(fileUri, {
        mimeType: "text/plain",
        dialogTitle: `Данные расчёта: ${moduleTitle}`,
        UTI: "public.plain-text",
      });
    } catch (e) {
      console.log("[ActionsBar] export error", e);
      Alert.alert("Ошибка", "Не удалось сформировать текстовый файл. Попробуйте ещё раз.");
    } finally {
      setIsBusy(false);
    }
  };

  const handleCopy = async () => {
    haptic();
    await Clipboard.setStringAsync(buildText());
    setCopyLabel("Скопировано!");
    setTimeout(() => setCopyLabel("Скопировать"), 1800);
  };

  const handlePasteFromClipboard = async () => {
    try {
      const content = await Clipboard.getStringAsync();
      if (!content) {
        Alert.alert("Буфер пуст", "Сначала скопируйте текст расчёта из сообщения технолога.");
        return;
      }
      setPasteText(content);
      haptic();
    } catch (e) {
      console.log("[ActionsBar] clipboard read error", e);
    }
  };

  const handlePickFile = async () => {
    try {
      const res = await DocumentPicker.getDocumentAsync({ type: ["text/plain", "*/*"], copyToCacheDirectory: true });
      if (res.canceled || !res.assets?.[0]) return;
      const content = await FileSystem.readAsStringAsync(res.assets[0].uri);
      setPasteText(content);
    } catch (e) {
      console.log("[ActionsBar] pick file error", e);
      Alert.alert("Ошибка", "Не удалось прочитать файл. Вставьте текст расчёта вручную.");
    }
  };

  const handleApply = () => {
    if (!pasteText.trim()) {
      Alert.alert("Пусто", "Вставьте текст расчёта, полученный от технолога.");
      return;
    }
    const res = onImportText(pasteText);
    if (res.ok) {
      haptic();
      setOpenPanel(null);
      Alert.alert("Готово", res.message);
    } else {
      Alert.alert("Не удалось распознать", res.message);
    }
  };

  const handleSaveToArchive = () => {
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
    setOpenPanel(null);
    Alert.alert("Сохранено", "Расчёт добавлен в архив на главном экране.");
  };

  return (
    <View style={[styles.wrap, { backgroundColor: colors.card, borderColor: colors.border }]}>
      <View style={styles.row}>
        <Pressable
          style={({ pressed }) => [
            styles.iconBtn,
            { backgroundColor: openPanel === "share" ? colors.accent : colors.inputBg },
            pressed && styles.pressed,
          ]}
          onPress={toggleShare}
          testID="actions-share-toggle"
        >
          <Mail size={18} color={openPanel === "share" ? "#FFFFFF" : colors.text} />
        </Pressable>
        <Pressable
          style={({ pressed }) => [
            styles.iconBtn,
            { backgroundColor: openPanel === "save" ? colors.accent : colors.inputBg },
            pressed && styles.pressed,
          ]}
          onPress={toggleSave}
          testID="actions-save-toggle"
        >
          <Save size={18} color={openPanel === "save" ? "#FFFFFF" : colors.text} />
        </Pressable>

        {mode && onModeChange ? (
          <View style={styles.modeWrap}>
            <Switch
              value={mode === "advanced"}
              onValueChange={(v) => {
                if (Platform.OS !== "web") Haptics.selectionAsync();
                onModeChange(v ? "advanced" : "standard");
              }}
              trackColor={{ false: colors.border, true: colors.accent }}
              thumbColor="#FFFFFF"
              testID="actions-mode-switch"
              style={styles.modeSwitch}
            />
            <Text style={[styles.modeText, { color: colors.text }]} numberOfLines={1} adjustsFontSizeToFit>
              {mode === "advanced" ? "Углублённый" : "Стандартный"}
            </Text>
          </View>
        ) : (
          <View style={styles.spacer} />
        )}

        <Pressable
          style={({ pressed }) => [styles.iconBtn, { backgroundColor: colors.inputBg }, pressed && styles.pressed]}
          onPress={handleReset}
          testID="actions-reset-btn"
        >
          <RotateCcw size={18} color={colors.error} />
        </Pressable>
      </View>

      {openPanel === "share" ? (
        <View style={styles.panel}>
          <View style={styles.panelRow}>
            <Pressable
              style={({ pressed }) => [styles.btn, { backgroundColor: colors.accent }, pressed && styles.pressed]}
              onPress={handleShareText}
              disabled={isBusy}
              testID="share-text-btn"
            >
              <Send size={15} color="#FFFFFF" />
              <Text style={[styles.btnText, { color: "#FFFFFF" }]}>{isBusy ? "Готовим…" : "Текстом"}</Text>
            </Pressable>
            <Pressable
              style={({ pressed }) => [styles.btn, { backgroundColor: colors.primarySoft }, pressed && styles.pressed]}
              onPress={handleExportFile}
              disabled={isBusy}
              testID="export-txt-btn"
            >
              <FileText size={15} color={colors.text} />
              <Text style={[styles.btnText, { color: colors.text }]}>Файл .txt</Text>
            </Pressable>
          </View>
          <Pressable style={({ pressed }) => [styles.linkBtn, pressed && styles.pressed]} onPress={handleCopy} testID="copy-text-btn">
            <Text style={[styles.linkBtnText, { color: colors.muted }]}>{copyLabel}</Text>
          </Pressable>

          <View style={[styles.divider, { backgroundColor: colors.border }]} />
          <Text style={[styles.panelLabel, { color: colors.muted }]}>Загрузить расчёт из текста</Text>
          <View style={styles.panelRow}>
            <Pressable
              style={({ pressed }) => [styles.pickBtn, { borderColor: colors.border, flex: 1 }, pressed && styles.pressed]}
              onPress={handlePasteFromClipboard}
              testID="paste-clipboard-btn"
            >
              <ClipboardIcon size={14} color={colors.text} />
              <Text style={[styles.pickBtnText, { color: colors.text }]}>Из буфера</Text>
            </Pressable>
            <Pressable
              style={({ pressed }) => [styles.pickBtn, { borderColor: colors.border, flex: 1 }, pressed && styles.pressed]}
              onPress={handlePickFile}
              testID="pick-file-btn"
            >
              <FileUp size={14} color={colors.text} />
              <Text style={[styles.pickBtnText, { color: colors.text }]}>Файл .txt</Text>
            </Pressable>
          </View>
          <TextInput
            style={[styles.textArea, { color: colors.text, borderColor: colors.border, backgroundColor: colors.inputBg }]}
            value={pasteText}
            onChangeText={setPasteText}
            multiline
            scrollEnabled
            placeholder="Вставьте сюда текст расчёта…"
            placeholderTextColor={colors.muted}
            textAlignVertical="top"
            testID="paste-input"
          />
          <Pressable
            style={({ pressed }) => [styles.applyBtn, { backgroundColor: colors.accent }, pressed && styles.pressed]}
            onPress={handleApply}
            testID="apply-import-btn"
          >
            <Text style={styles.applyBtnText}>Применить к расчёту</Text>
          </Pressable>
        </View>
      ) : null}

      {openPanel === "save" ? (
        <View style={styles.panel}>
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
            style={({ pressed }) => [styles.applyBtn, { backgroundColor: colors.accent }, pressed && styles.pressed]}
            onPress={handleSaveToArchive}
            testID="confirm-save-btn"
          >
            <Text style={styles.applyBtnText}>Сохранить в архив</Text>
          </Pressable>
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    borderRadius: 18,
    borderWidth: 1,
    padding: 10,
    marginBottom: 14,
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  iconBtn: {
    width: 40,
    height: 40,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
  },
  pressed: {
    opacity: 0.8,
    transform: [{ scale: 0.97 }],
  },
  spacer: {
    flex: 1,
  },
  modeWrap: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
  },
  modeSwitch: {
    transform: [{ scale: 0.85 }],
  },
  modeText: {
    fontSize: 11,
    fontWeight: "700" as const,
    flexShrink: 1,
  },
  panel: {
    marginTop: 12,
    paddingTop: 12,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: "rgba(128,128,128,0.25)",
  },
  panelRow: {
    flexDirection: "row",
    gap: 8,
  },
  panelLabel: {
    fontSize: 12,
    fontWeight: "700" as const,
    marginTop: 4,
    marginBottom: 8,
    textTransform: "uppercase" as const,
    letterSpacing: 0.4,
  },
  divider: {
    height: StyleSheet.hairlineWidth,
    marginVertical: 12,
  },
  btn: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    paddingVertical: 11,
    borderRadius: 12,
  },
  btnText: {
    fontSize: 13.5,
    fontWeight: "700" as const,
  },
  linkBtn: {
    alignItems: "center",
    paddingVertical: 8,
  },
  linkBtnText: {
    fontSize: 13,
    fontWeight: "700" as const,
  },
  pickBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    borderWidth: 1,
    borderRadius: 12,
    paddingVertical: 9,
    marginBottom: 10,
  },
  pickBtnText: {
    fontSize: 13,
    fontWeight: "600" as const,
  },
  textArea: {
    height: 160,
    borderWidth: 1,
    borderRadius: 14,
    padding: 12,
    fontSize: 13,
    marginBottom: 10,
  },
  applyBtn: {
    paddingVertical: 13,
    borderRadius: 14,
    alignItems: "center",
  },
  applyBtnText: {
    fontSize: 14.5,
    fontWeight: "800" as const,
    color: "#FFFFFF",
  },
  label: {
    fontSize: 12,
    fontWeight: "700" as const,
    marginBottom: 6,
    marginTop: 8,
    textTransform: "uppercase" as const,
    letterSpacing: 0.4,
  },
  input: {
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 10,
    fontSize: 15,
  },
});
