/** Parse a user-entered number: accepts comma or dot as decimal separator. */
export function parseNum(s: string): number {
  const n = parseFloat(s.trim().replace(/\s/g, "").replace(",", "."));
  return Number.isFinite(n) ? n : 0;
}

/**
 * Format a number for display: fixed decimals, comma as decimal separator,
 * thin spaces as thousands separators. Returns an em dash for non-finite values.
 */
export function fmt(v: number, digits: number = 2): string {
  if (!Number.isFinite(v)) return "—";
  const fixed = v.toFixed(digits);
  const [intPartRaw, decPart] = fixed.split(".");
  const negative = intPartRaw.startsWith("-");
  const intPart = negative ? intPartRaw.slice(1) : intPartRaw;
  const grouped = intPart.replace(/\B(?=(\d{3})+(?!\d))/g, " ");
  const dec = decPart !== undefined ? decPart.replace(/0+$/, "") : "";
  return `${negative ? "-" : ""}${grouped}${dec.length > 0 ? "," + dec : ""}`;
}
