import { GrowthArrow } from "./GrowthArrow";
import { formatCurrency } from "@/lib/utils/format-currency";
import { formatTokens } from "@/lib/utils/format-tokens";
import { formatName } from "@/lib/utils/format-name";
import type { LeaderboardDisplayMode } from "@/types";

interface PodiumEntry {
  rank: number;
  memberId: string;
  memberName: string;
  totalSpendCents: number;
  totalTokens: number | null;
  rankChange: number | null;
  badgeCount: number;
}

interface LeaderboardPodiumProps {
  entries: PodiumEntry[];
  displayMode: LeaderboardDisplayMode;
  podiumSize?: number;
}

const RANK_STYLES: Record<number, { medal: string; bg: string }> = {
  1: { medal: "🥇", bg: "bg-amber-50 border-amber-300" },
  2: { medal: "🥈", bg: "bg-gray-50 border-gray-300" },
  3: { medal: "🥉", bg: "bg-orange-50 border-orange-300" },
};

// formatName imported from @/lib/utils/format-name

export function LeaderboardPodium({
  entries,
  displayMode,
  podiumSize = 8,
}: LeaderboardPodiumProps) {
  const top = entries.slice(0, podiumSize);

  if (top.length === 0) {
    return (
      <div className="py-8 text-center text-(--text-secondary)">
        <p className="text-sm">No leaderboard data available</p>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      <h3 className="text-sm font-semibold text-(--text-primary) uppercase tracking-wider">
        Leaderboard
      </h3>
      <div className="space-y-1.5">
        {top.map((entry) => {
          const style = RANK_STYLES[entry.rank];
          return (
            <div
              key={entry.memberId}
              className={`flex items-center gap-3 rounded-lg border px-4 py-2.5 ${
                style?.bg || "bg-(--card-bg) border-(--card-border)"
              }`}
            >
              <span className="w-8 text-center text-sm font-bold text-(--text-primary)">
                {style?.medal || `#${entry.rank}`}
              </span>
              <div className="flex-1 min-w-0">
                {displayMode !== "anonymous" && (
                  <span className="text-sm font-medium text-(--text-primary) truncate block">
                    {formatName(entry.memberName, displayMode)}
                  </span>
                )}
                <span className="text-xs text-(--text-secondary)">
                  {formatCurrency(entry.totalSpendCents)} · {formatTokens(entry.totalTokens)}
                </span>
              </div>
              <div className="flex items-center gap-2">
                {entry.badgeCount > 0 && (
                  <span className="text-xs text-(--text-secondary)">
                    {entry.badgeCount} badge{entry.badgeCount !== 1 ? "s" : ""}
                  </span>
                )}
                <GrowthArrow rankChange={entry.rankChange} />
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
