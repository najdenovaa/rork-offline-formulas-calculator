/**
 * Кодек для обмена расчётами обычным текстом (полностью офлайн).
 *
 * Формат: каждое значащее поле — это строка вида
 *   "Подпись, единица [ключ]: значение"
 * Программа считывает только то, что в квадратных скобках, и значение после
 * двоеточия. Всё остальное (подписи, заголовки, порядок строк, комментарии)
 * можно менять как угодно — мастер и технолог могут свободно переписываться
 * поверх этого текста, лишь бы "[ключ]:" оставалось на месте.
 */

/** Строка одного поля: "Подпись, ед [ключ]: значение" */
export function field(label: string, key: string, value: string | number, unit?: string): string {
  const u = unit ? `, ${unit}` : "";
  const v = typeof value === "number" ? String(value) : value;
  return `${label}${u} [${key}]: ${v}`;
}

/** Заголовок раздела — просто текст, парсером игнорируется */
export function section(title: string): string {
  return `\n— ${title} —`;
}

const FIELD_RE = /\[([A-Za-z0-9_.]+)\]\s*:\s*(.*)$/;

/** Разбирает текст на карту ключ→значение по всем строкам вида "... [ключ]: значение" */
export function parseKV(text: string): Record<string, string> {
  const out: Record<string, string> = {};
  const lines = text.split(/\r?\n/);
  for (const raw of lines) {
    const m = FIELD_RE.exec(raw.trim());
    if (m) out[m[1]] = m[2].trim();
  }
  return out;
}

/** Значение по ключу с запасным вариантом (пустая строка в документе тоже считается "нет значения") */
export function kv(map: Record<string, string>, key: string, fallback = ""): string {
  const v = map[key];
  return v !== undefined && v !== "" ? v : fallback;
}

/** Максимальный индекс N среди ключей вида prefixN.suffix (нумерация с 1) */
export function maxIndex(map: Record<string, string>, prefix: string, suffix: string): number {
  const re = new RegExp(`^${prefix}(\\d+)\\.${suffix}$`);
  let max = 0;
  for (const k of Object.keys(map)) {
    const m = re.exec(k);
    if (m) max = Math.max(max, parseInt(m[1], 10));
  }
  return max;
}

export function buildHeader(title: string, moduleKey: string, hint?: string): string {
  return [
    `РАСЧЁТ: ${title}`,
    `[module]: ${moduleKey}`,
    `Это офлайн-выгрузка из приложения «Инженерные расчёты». Не удаляйте текст в`,
    `квадратных скобках [ключ] и двоеточие после него — по ним программа считывает`,
    `значения при вставке обратно. Подписи, порядок строк и комментарии менять можно.`,
    hint ?? "",
  ]
    .filter((l) => l !== "")
    .join("\n");
}
