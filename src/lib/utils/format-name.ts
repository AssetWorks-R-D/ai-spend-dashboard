import type { LeaderboardDisplayMode } from "@/types";

/** Format a member name according to the leaderboard display mode */
export function formatName(
  name: string,
  mode: LeaderboardDisplayMode,
  rank?: number
): string {
  if (mode === "named") return name;
  if (mode === "initialed") {
    return name
      .split(" ")
      .map((part) => part[0]?.toUpperCase() + ".")
      .join("");
  }
  // anonymous
  return rank !== undefined ? `Member #${rank}` : "Member";
}
