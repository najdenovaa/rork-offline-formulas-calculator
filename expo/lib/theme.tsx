import createContextHook from "@nkzw/create-context-hook";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { useEffect, useMemo, useState } from "react";
import { useColorScheme } from "react-native";

import { palettes, type Palette } from "@/constants/colors";

export type ThemeMode = "system" | "light" | "dark";

const STORAGE_KEY = "app_theme_mode";

/** Провайдер темы: светлая/тёмная/системная, с сохранением выбора */
export const [ThemeProvider, useTheme] = createContextHook(() => {
  const systemScheme = useColorScheme();
  const [mode, setModeState] = useState<ThemeMode>("system");
  const [loaded, setLoaded] = useState<boolean>(false);

  useEffect(() => {
    AsyncStorage.getItem(STORAGE_KEY)
      .then((v) => {
        if (v === "light" || v === "dark" || v === "system") setModeState(v);
      })
      .catch(() => undefined)
      .finally(() => setLoaded(true));
  }, []);

  const setMode = (m: ThemeMode) => {
    setModeState(m);
    AsyncStorage.setItem(STORAGE_KEY, m).catch(() => undefined);
  };

  const isDark = mode === "dark" || (mode === "system" && systemScheme === "dark");
  const colors: Palette = isDark ? palettes.dark : palettes.light;

  return useMemo(() => ({ mode, setMode, isDark, colors, loaded }), [mode, isDark, colors, loaded]);
});

/** Выбор заранее собранных StyleSheet-объектов по активной теме */
export function useThemedStyles<T>(byTheme: { light: T; dark: T }): T {
  const { isDark } = useTheme();
  return isDark ? byTheme.dark : byTheme.light;
}
