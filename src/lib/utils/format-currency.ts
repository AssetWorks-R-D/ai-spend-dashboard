/** Format cents to display currency (no decimals). e.g., 1428000 → "$14,280" */
export function formatCurrency(cents: number): string {
  const dollars = Math.round(cents / 100);
  return `$${dollars.toLocaleString("en-US")}`;
}
