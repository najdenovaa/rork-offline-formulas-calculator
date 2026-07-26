/**
 * Палитры оформления в стиле фирменных иконок модулей:
 * глубокий графит (уголь) + тил-акцент #33958B, мягкие скруглённые плитки.
 * Светлая и тёмная темы.
 */

export interface Palette {
  primary: string;
  onPrimary: string;
  primaryDark: string;
  primarySoft: string;
  accent: string;
  accentSoft: string;
  background: string;
  card: string;
  text: string;
  muted: string;
  border: string;
  inputBg: string;
  success: string;
  successBg: string;
  warning: string;
  warningBg: string;
  error: string;
  errorBg: string;
  heroFrom: string;
  heroVia: string;
  heroTo: string;
}

export const lightPalette: Palette = {
  primary: "#232A2E",
  onPrimary: "#FFFFFF",
  primaryDark: "#171C1F",
  primarySoft: "#EDF1F0",
  accent: "#33958B",
  accentSoft: "#E3F1EF",
  background: "#F4F7F6",
  card: "#FFFFFF",
  text: "#1D2427",
  muted: "#5C6B6C",
  border: "#E2E9E7",
  inputBg: "#EFF3F2",
  success: "#1E8E5A",
  successBg: "#E6F4EC",
  warning: "#B26205",
  warningBg: "#FDF2DC",
  error: "#D93025",
  errorBg: "#FCEAE8",
  heroFrom: "#171C1F",
  heroVia: "#212A2C",
  heroTo: "#28403C",
};

export const darkPalette: Palette = {
  primary: "#E8EEEC",
  onPrimary: "#14201E",
  primaryDark: "#FFFFFF",
  primarySoft: "#1E2626",
  accent: "#4FBDB0",
  accentSoft: "#123230",
  background: "#0C1112",
  card: "#151C1D",
  text: "#ECF1F0",
  muted: "#9BA8A6",
  border: "#25302F",
  inputBg: "#1B2323",
  success: "#3FC383",
  successBg: "#0E2C1E",
  warning: "#F6B100",
  warningBg: "#2C2306",
  error: "#FF6D60",
  errorBg: "#33130F",
  heroFrom: "#0A0E0F",
  heroVia: "#121A1B",
  heroTo: "#1B302C",
};

export const palettes = { light: lightPalette, dark: darkPalette } as const;

/** Совместимость: статичная светлая палитра (используйте useTheme в компонентах) */
const Colors = lightPalette;
export default Colors;
