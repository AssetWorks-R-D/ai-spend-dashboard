/** Format token count. e.g., 39629164 → "39.6M tok", 287000 → "287K tok", null → "~ tok" */
export function formatTokens(tokens: number | null): string {
  if (tokens === null || tokens === undefined) return "~ tok";
  if (tokens >= 1_000_000) {
    return `${(tokens / 1_000_000).toFixed(1)}M tok`;
  }
  if (tokens >= 1_000) {
    return `${Math.round(tokens / 1_000)}K tok`;
  }
  return `${tokens} tok`;
}
