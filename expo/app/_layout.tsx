import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Stack } from "expo-router";
import * as SplashScreen from "expo-splash-screen";
import React, { useEffect } from "react";
import { StatusBar } from "react-native";
import { GestureHandlerRootView } from "react-native-gesture-handler";

import { SavedCalcsProvider } from "@/lib/savedCalcs";
import { ThemeProvider, useTheme } from "@/lib/theme";

SplashScreen.preventAutoHideAsync();

const queryClient = new QueryClient();

function RootLayoutNav() {
  const { colors, isDark } = useTheme();
  return (
    <>
      <StatusBar barStyle={isDark ? "light-content" : "dark-content"} backgroundColor={colors.background} />
      <Stack
        screenOptions={{
          headerStyle: { backgroundColor: colors.background },
          headerTintColor: colors.text,
          headerTitleStyle: { fontWeight: "800" as const, fontSize: 18 },
          headerShadowVisible: false,
          headerBackTitle: "Назад",
          contentStyle: { backgroundColor: colors.background },
        }}
      >
        <Stack.Screen name="index" options={{ headerShown: false }} />
        <Stack.Screen name="cementing" options={{ title: "Цементирование ОК" }} />
        <Stack.Screen name="plug" options={{ title: "Цементный мост" }} />
        <Stack.Screen name="kill" options={{ title: "Глушение скважины" }} />
        <Stack.Screen name="hydro" options={{ title: "Гидростатика и ЭЦП" }} />
        <Stack.Screen name="packer" options={{ title: "Срыв пакера (КРС)" }} />
        <Stack.Screen name="archive" options={{ title: "Архив расчётов" }} />
        <Stack.Screen name="terms" options={{ title: "Правовая информация" }} />
      </Stack>
    </>
  );
}

export default function RootLayout() {
  useEffect(() => {
    SplashScreen.hideAsync();
  }, []);

  return (
    <QueryClientProvider client={queryClient}>
      <ThemeProvider>
        <SavedCalcsProvider>
          <GestureHandlerRootView>
            <RootLayoutNav />
          </GestureHandlerRootView>
        </SavedCalcsProvider>
      </ThemeProvider>
    </QueryClientProvider>
  );
}
