import * as Clipboard from "expo-clipboard";
import * as DocumentPicker from "expo-document-picker";
import * as FileSystem from "expo-file-system/legacy";
import * as Haptics from "expo-haptics";
import * as Sharing from "expo-sharing";
import { Clipboard as ClipboardIcon, FileText, FileUp, Send, X } from "lucide-react-native";
import React, { useState } from "react";
import {
  Alert,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  Share,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";

import { Card, SectionTitle } from "@/components/Results";
import { useTheme } from "@/lib/theme";

export interface ImportResult {
  ok: boolean;
  message: string;
}

interface ImportExportCardProps {
  /** Название расчёта — попадает в заголовок диалога и имя резервного файла */
  title: string;
  /** Строит текстовый документ из текущего состояния экрана */
  buildText: () => string;
  /** Разбирает вставленный текст и применяет его к состоянию экрана */
  onImportText: (text: string) => ImportResult;
}

/**
 * Карточка обмена расчётом обычным текстом — полностью офлайн.
 * Основной способ — поделиться текстовым сообщением (не файлом): оно сразу
 * отображается в любом мессенджере и на Android, и на iPhone, без скачивания
 * вложений. Технолог правит цифры и присылает тот же текст обратно — мастер
 * вставляет его здесь, и поля заполняются автоматически по меткам [ключ].
 * Файл .txt оставлен как резервный вариант для тех, кому удобнее вложением.
 */
export default function ImportExportCard({ title, buildText, onImportText }: ImportExportCardProps) {
  const { colors } = useTheme();
  const [modalVisible, setModalVisible] = useState<boolean>(false);
  const [pasteText, setPasteText] = useState<string>("");
  const [isBusy, setIsBusy] = useState<boolean>(false);
  const [copyLabel, setCopyLabel] = useState<string>("Скопировать");

  const haptic = () => {
    if (Platform.OS !== "web") Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
  };

  // Делимся обычным текстовым сообщением (не файлом) — оно сразу читается в
  // любом мессенджере на Android и iPhone, без открытия/скачивания вложения.
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
      await Share.share(
        Platform.OS === "ios" ? { message: text } : { message: text, title },
        { dialogTitle: `Отправить расчёт: ${title}` },
      );
    } catch (e) {
      console.log("[ImportExportCard] share text error", e);
      Alert.alert("Ошибка", "Не удалось отправить расчёт. Попробуйте ещё раз или скопируйте текст.");
    } finally {
      setIsBusy(false);
    }
  };

  // Резервный вариант — файл .txt, если удобнее переслать вложением
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
      const safeName = title.replace(/[^\p{L}\p{N}]+/gu, "_").toLowerCase();
      const fileUri = `${FileSystem.cacheDirectory ?? ""}${safeName}_${Date.now()}.txt`;
      await FileSystem.writeAsStringAsync(fileUri, text, { encoding: FileSystem.EncodingType.UTF8 });
      const canShare = await Sharing.isAvailableAsync();
      if (!canShare) {
        Alert.alert("Недоступно", "Отправка файлов недоступна на этом устройстве.");
        return;
      }
      await Sharing.shareAsync(fileUri, {
        mimeType: "text/plain",
        dialogTitle: `Данные расчёта: ${title}`,
        UTI: "public.plain-text",
      });
    } catch (e) {
      console.log("[ImportExportCard] export error", e);
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

  const openImport = () => {
    haptic();
    setPasteText("");
    setModalVisible(true);
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
      console.log("[ImportExportCard] clipboard read error", e);
    }
  };

  const handlePickFile = async () => {
    try {
      const res = await DocumentPicker.getDocumentAsync({ type: ["text/plain", "*/*"], copyToCacheDirectory: true });
      if (res.canceled || !res.assets?.[0]) return;
      const content = await FileSystem.readAsStringAsync(res.assets[0].uri);
      setPasteText(content);
    } catch (e) {
      console.log("[ImportExportCard] pick file error", e);
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
      setModalVisible(false);
      Alert.alert("Готово", res.message);
    } else {
      Alert.alert("Не удалось распознать", res.message);
    }
  };

  return (
    <Card>
      <SectionTitle>Обмен расчётом (офлайн)</SectionTitle>
      <Text style={[styles.hint, { color: colors.muted }]}>Нажмите для передачи расчёта</Text>
      <View style={styles.row}>
        <Pressable
          style={({ pressed }) => [styles.btn, { backgroundColor: colors.accent }, pressed && styles.btnPressed]}
          onPress={handleShareText}
          disabled={isBusy}
          testID="share-text-btn"
        >
          <Send size={16} color="#FFFFFF" />
          <Text style={[styles.btnText, { color: "#FFFFFF" }]}>{isBusy ? "Готовим…" : "Текстом"}</Text>
        </Pressable>
        <Pressable
          style={({ pressed }) => [styles.btn, { backgroundColor: colors.primarySoft }, pressed && styles.btnPressed]}
          onPress={handleExportFile}
          disabled={isBusy}
          testID="export-txt-btn"
        >
          <FileText size={16} color={colors.text} />
          <Text style={[styles.btnText, { color: colors.text }]}>Файлом .txt</Text>
        </Pressable>
      </View>
      <View style={styles.rowSecond}>
        <Pressable
          style={({ pressed }) => [styles.linkBtn, pressed && styles.btnPressed]}
          onPress={handleCopy}
          testID="copy-text-btn"
        >
          <Text style={[styles.linkBtnText, { color: colors.muted }]}>{copyLabel}</Text>
        </Pressable>
        <Pressable style={({ pressed }) => [styles.linkBtn, pressed && styles.btnPressed]} onPress={openImport} testID="import-txt-btn">
          <Text style={[styles.linkBtnText, { color: colors.accent }]}>Загрузить расчёт →</Text>
        </Pressable>
      </View>

      <Modal visible={modalVisible} animationType="slide" transparent onRequestClose={() => setModalVisible(false)}>
        <KeyboardAvoidingView
          style={styles.modalBackdrop}
          behavior={Platform.OS === "ios" ? "padding" : undefined}
        >
          <View style={[styles.modalCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
            <View style={styles.modalHead}>
              <Text style={[styles.modalTitle, { color: colors.text }]}>Загрузить расчёт</Text>
              <Pressable onPress={() => setModalVisible(false)} hitSlop={10} testID="close-import-modal">
                <X size={22} color={colors.muted} />
              </Pressable>
            </View>
            {/* Кнопка применения закреплена сверху — всегда видна и нажимаема, даже при
                длинном тексте или открытой клавиатуре, когда низ экрана скрыт. */}
            <Pressable
              style={({ pressed }) => [styles.applyBtn, { backgroundColor: colors.accent }, pressed && styles.btnPressed]}
              onPress={handleApply}
              testID="apply-import-btn"
            >
              <Text style={styles.applyBtnText}>Применить к расчёту</Text>
            </Pressable>
            <View style={styles.rowSecond}>
              <Pressable
                style={({ pressed }) => [styles.pickBtn, { borderColor: colors.border, flex: 1 }, pressed && styles.btnPressed]}
                onPress={handlePasteFromClipboard}
                testID="paste-clipboard-btn"
              >
                <ClipboardIcon size={15} color={colors.text} />
                <Text style={[styles.pickBtnText, { color: colors.text }]}>Из буфера</Text>
              </Pressable>
              <Pressable
                style={({ pressed }) => [styles.pickBtn, { borderColor: colors.border, flex: 1 }, pressed && styles.btnPressed]}
                onPress={handlePickFile}
                testID="pick-file-btn"
              >
                <FileUp size={15} color={colors.text} />
                <Text style={[styles.pickBtnText, { color: colors.text }]}>Файл .txt</Text>
              </Pressable>
            </View>
            {/* Поле ввода занимает всё оставшееся место внутри окна ФИКСИРОВАННОЙ
                высоты (modalCard имеет height, а не только maxHeight) — поэтому
                оно всегда прокручивается ВНУТРИ себя, а шапка и кнопка «Применить»
                никогда не уезжают за пределы экрана, даже с длинным текстом и
                открытой клавиатурой. */}
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
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </Card>
  );
}

const styles = StyleSheet.create({
  hint: {
    fontSize: 13.5,
    lineHeight: 18,
    marginBottom: 10,
  },
  row: {
    flexDirection: "row",
    gap: 10,
  },
  rowSecond: {
    flexDirection: "row",
    gap: 10,
    marginTop: 10,
  },
  linkBtn: {
    flex: 1,
    alignItems: "center",
    paddingVertical: 6,
  },
  linkBtnText: {
    fontSize: 13,
    fontWeight: "700" as const,
  },
  btn: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
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
    paddingBottom: 24,
    // Фиксированная (не процентная) высота — гарантирует, что карточка вместе
    // с шапкой и кнопкой «Применить» всегда помещается над клавиатурой на
    // любом устройстве, а не «уезжает» вверх за край экрана.
    height: 400,
  },
  modalHead: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 6,
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: "800" as const,
  },
  pickBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    borderWidth: 1,
    borderRadius: 12,
    paddingVertical: 10,
    marginBottom: 10,
  },
  pickBtnText: {
    fontSize: 14,
    fontWeight: "600" as const,
  },
  textArea: {
    flex: 1,
    borderWidth: 1,
    borderRadius: 14,
    padding: 12,
    fontSize: 13,
    marginBottom: 4,
  },
  applyBtn: {
    paddingVertical: 14,
    borderRadius: 14,
    alignItems: "center",
    marginBottom: 6,
  },
  applyBtnText: {
    fontSize: 15,
    fontWeight: "800" as const,
    color: "#FFFFFF",
  },
});
