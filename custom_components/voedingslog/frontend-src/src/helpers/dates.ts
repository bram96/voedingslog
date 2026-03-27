/** Format a date string for display. */
export function formatDateLabel(dateStr: string): string {
  const today = new Date().toISOString().split("T")[0];
  const yesterday = new Date(Date.now() - 86400000).toISOString().split("T")[0];
  if (dateStr === today) return "Vandaag";
  if (dateStr === yesterday) return "Gisteren";
  const d = new Date(dateStr);
  return d.toLocaleDateString("nl-NL", { weekday: "short", day: "numeric", month: "short" });
}

export function toDateStr(d: Date): string {
  return d.toISOString().split("T")[0];
}

export function shortDay(dateStr: string): string {
  const d = new Date(dateStr + "T12:00:00");
  return ["zo", "ma", "di", "wo", "do", "vr", "za"][d.getDay()];
}
