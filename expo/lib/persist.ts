import AsyncStorage from "@react-native-async-storage/async-storage";
import { useEffect, useRef, useState } from "react";

/**
 * Локальное (офлайн) сохранение состояния формы калькулятора.
 * Первый запуск — начальное значение (пустые поля), далее восстанавливается
 * последний расчёт из AsyncStorage. Запись — с небольшой задержкой, чтобы
 * не писать на каждый символ.
 */
export function usePersistedState<T>(
  storageKey: string,
  initial: T,
): [T, React.Dispatch<React.SetStateAction<T>>] {
  const [value, setValue] = useState<T>(initial);
  const [hydrated, setHydrated] = useState<boolean>(false);
  const initialRef = useRef<T>(initial);

  useEffect(() => {
    let alive = true;
    AsyncStorage.getItem(storageKey)
      .then((raw) => {
        if (!alive || raw == null) return;
        const parsed = JSON.parse(raw) as T;
        const init = initialRef.current;
        // Для записей-объектов дополняем недостающие ключи начальным значением
        if (
          parsed !== null &&
          typeof parsed === "object" &&
          !Array.isArray(parsed) &&
          init !== null &&
          typeof init === "object" &&
          !Array.isArray(init)
        ) {
          setValue({ ...(init as object), ...(parsed as object) } as T);
        } else {
          setValue(parsed);
        }
      })
      .catch((e) => console.log("[persist] load error", storageKey, e))
      .finally(() => {
        if (alive) setHydrated(true);
      });
    return () => {
      alive = false;
    };
  }, [storageKey]);

  useEffect(() => {
    if (!hydrated) return;
    const t = setTimeout(() => {
      AsyncStorage.setItem(storageKey, JSON.stringify(value)).catch((e) =>
        console.log("[persist] save error", storageKey, e),
      );
    }, 300);
    return () => clearTimeout(t);
  }, [storageKey, value, hydrated]);

  return [value, setValue];
}
