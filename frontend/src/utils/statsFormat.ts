/** A percentage, or an em dash when there is nothing to divide by. */
export function pct(part: number, whole: number): string {
  if (whole === 0) return "—";
  return `${((part / whole) * 100).toFixed(0)}%`;
}

/** The suffix only: 1 → "st", 12 → "th", 23 → "rd". */
export function ordinal(n: number): string {
  if (n % 100 >= 11 && n % 100 <= 13) return "th";
  return ["th", "st", "nd", "rd"][n % 10] ?? "th";
}

/** "3rd", or an em dash for no placement. */
export function placing(n: number | null): string {
  return n == null ? "—" : `${n}${ordinal(n)}`;
}

/** "12-3-1", dropping draws when there are none. */
export function record(wins: number, losses: number, draws: number): string {
  return draws > 0 ? `${wins}-${losses}-${draws}` : `${wins}-${losses}`;
}

/** The deck's Pokemon names, or a placeholder when neither slot is set. */
export function deckLabel(
  p1: number | null,
  p2: number | null,
  nameMap: Map<number, string>,
): string {
  return (
    [p1, p2]
      .filter((id): id is number => id != null)
      .map((id) => nameMap.get(id) ?? `#${id}`)
      .join(" / ") || "No deck recorded"
  );
}
