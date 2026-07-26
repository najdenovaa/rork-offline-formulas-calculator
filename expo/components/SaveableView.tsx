import * as Haptics from "expo-haptics";
import * as MediaLibrary from "expo-media-library";
import { Download } from "lucide-react-native";
import React, { useRef, useState } from "react";
import { Alert, Platform, Pressable, StyleSheet, Text, View } from "react-native";
import ViewShot from "react-native-view-shot";

import { useTheme } from "@/lib/theme";

interface SaveableViewProps {
  children: React.ReactNode;
}

/**
 * Оборачивает график/схему: долгое нажатие сохраняет изображение в галерею
 * устройства (офлайн, без обрезки — просто снимок текущего вида).
 */
export default function SaveableView({ children }: SaveableViewProps) {
  const { colors } = useTheme();
  const shotRef = useRef<ViewShot>(null);
  const [saved, setSaved] = useState<boolean>(false);
  const [busy, setBusy] = useState<boolean>(false);

  const handleLongPress = async () => {
    if (busy) return;
    if (Platform.OS === "web") {
      Alert.alert("Недоступно", "Сохранение изображений в галерею доступно в мобильном приложении.");
      return;
    }
    try {
      setBusy(true);
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
      const perm = await MediaLibrary.requestPermissionsAsync();
      if (!perm.granted) {
        Alert.alert("Нет доступа", "Разрешите доступ к фото в настройках, чтобы сохранять изображения расчёта.");
        return;
      }
      const capture = shotRef.current?.capture;
      const uri = capture ? await capture() : null;
      if (!uri) return;
      await MediaLibrary.saveToLibraryAsync(uri);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      setSaved(true);
      setTimeout(() => setSaved(false), 1600);
    } catch (e) {
      console.log("[SaveableView] save error", e);
      Alert.alert("Ошибка", "Не удалось сохранить изображение. Попробуйте ещё раз.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Pressable onLongPress={handleLongPress} delayLongPress={420} testID="saveable-view">
      <ViewShot ref={shotRef} options={{ format: "png", quality: 1 }}>
        <View collapsable={false}>{children}</View>
      </ViewShot>
      {saved ? (
        <View style={[styles.flash, { backgroundColor: colors.successBg }]}>
          <Download size={13} color={colors.success} />
          <Text style={[styles.flashText, { color: colors.success }]}>Сохранено в галерею</Text>
        </View>
      ) : (
        <Text style={[styles.hint, { color: colors.muted }]}>Удерживайте, чтобы сохранить изображение</Text>
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  hint: {
    fontSize: 11,
    textAlign: "center" as const,
    marginTop: 4,
  },
  flash: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    borderRadius: 10,
    paddingVertical: 6,
    marginTop: 4,
  },
  flashText: {
    fontSize: 12,
    fontWeight: "700" as const,
  },
});
