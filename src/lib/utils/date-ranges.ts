/** Generate a period key like "2026-02" from a date */
export function periodKey(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
}

/** Get start and end of a month from a period key like "2026-02" */
export function periodBounds(key: string): { start: Date; end: Date } {
  const [year, month] = key.split("-").map(Number);
  const start = new Date(year, month - 1, 1);
  const end = new Date(year, month, 0, 23, 59, 59, 999);
  return { start, end };
}

/** Get the previous period key */
export function previousPeriod(key: string): string {
  const [year, month] = key.split("-").map(Number);
  const d = new Date(year, month - 2, 1);
  return periodKey(d);
}

/** Get current period key */
export function currentPeriodKey(): string {
  return periodKey(new Date());
}

/** Generate period options for a dropdown (last 12 months) */
export function periodOptions(): { key: string; label: string }[] {
  const options: { key: string; label: string }[] = [];
  const now = new Date();
  for (let i = 0; i < 12; i++) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const key = periodKey(d);
    const label = d.toLocaleDateString("en-US", { month: "long", year: "numeric" });
    options.push({ key, label });
  }
  return options;
}
