import createContextHook from "@nkzw/create-context-hook";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { useEffect, useMemo, useState } from "react";

/** Один сохранённый расчёт — снимок текста расчёта с привязкой к объекту */
export interface SavedCalc {
  id: string;
  moduleKey: string;
  moduleTitle: string;
  fieldName: string;
  cluster: string;
  well: string;
  dateLabel: string;
  savedAt: number;
  text: string;
}

export type SavedCalcInput = Omit<SavedCalc, "id" | "savedAt">;

const STORAGE_KEY = "saved_calcs_v1";

/** Провайдер архива сохранённых расчётов — офлайн, хранится в AsyncStorage устройства */
export const [SavedCalcsProvider, useSavedCalcs] = createContextHook(() => {
  const [items, setItems] = useState<SavedCalc[]>([]);
  const [loaded, setLoaded] = useState<boolean>(false);

  useEffect(() => {
    AsyncStorage.getItem(STORAGE_KEY)
      .then((raw) => {
        if (!raw) return;
        const parsed = JSON.parse(raw) as SavedCalc[];
        if (Array.isArray(parsed)) setItems(parsed);
      })
      .catch((e) => console.log("[savedCalcs] load error", e))
      .finally(() => setLoaded(true));
  }, []);

  useEffect(() => {
    if (!loaded) return;
    AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(items)).catch((e) =>
      console.log("[savedCalcs] save error", e),
    );
  }, [items, loaded]);

  const save = (entry: SavedCalcInput): SavedCalc => {
    const created: SavedCalc = {
      ...entry,
      id: `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
      savedAt: Date.now(),
    };
    setItems((prev) => [created, ...prev]);
    return created;
  };

  const remove = (id: string) => {
    setItems((prev) => prev.filter((it) => it.id !== id));
  };

  const getById = (id: string): SavedCalc | undefined => items.find((it) => it.id === id);

  const sorted = useMemo(() => [...items].sort((a, b) => b.savedAt - a.savedAt), [items]);

  return { items: sorted, save, remove, getById, loaded };
});
