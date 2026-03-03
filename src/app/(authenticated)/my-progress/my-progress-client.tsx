"use client";

import { useState, useEffect, useCallback } from "react";
import { BadgeCard } from "@/components/dashboard/BadgeCard";
import { SuggestionMachine } from "@/components/dashboard/SuggestionMachine";
import { formatCurrency } from "@/lib/utils/format-currency";
import { formatTokens } from "@/lib/utils/format-tokens";
import { currentPeriodKey } from "@/lib/utils/date-ranges";
import { VENDOR_COLORS, VENDOR_LABELS } from "@/lib/vendor-colors";
import type { VendorType } from "@/types";
import type { BadgeDefinition, EarnedBadge } from "@/lib/db/queries/badges";

interface RankingEntry {
  rank: number;
  memberId: string;
  memberName: string;
  totalSpendCents: number;
  totalTokens: number | null;
  previousRank: number | null;
  rankChange: number | null;
}

interface VendorBreakdown {
  vendor: VendorType;
  spendCents: number;
  tokens: number | null;
}

interface MemberCardData {
  memberId: string;
  memberName: string;
  totalSpendCents: number;
  vendors: VendorBreakdown[];
}

interface TeamTotals {
  totalSpendCents: number;
  totalTokens: number | null;
  activeMemberCount: number;
}

interface MyProgressClientProps {
  memberId: string | null;
  userName: string;
}

function getTagline(
  rank: number,
  totalMembers: number,
  rankChange: number | null,
): string {
  if (rank === 1) return "You\u2019re leading the pack.";
  if (rank <= 3) return "Podium material.";
  if (rankChange !== null && rankChange >= 5)
    return `On fire \u2014 up ${rankChange} spots this month.`;
  if (rankChange !== null && rankChange >= 2)
    return `Climbing fast \u2014 up ${rankChange} since last month.`;
  if (rankChange !== null && rankChange === 1)
    return "Moving up \u2014 gained a spot this month.";
  const pct = Math.round(
    ((totalMembers - rank + 1) / totalMembers) * 100,
  );
  if (pct >= 75) return "Top quartile \u2014 you\u2019re in the zone.";
  if (rankChange === null) return "Welcome to the board.";
  if (rankChange === 0) return "Holding steady.";
  return "Every sprint counts.";
}

export function MyProgressClient({
  memberId,
  userName,
}: MyProgressClientProps) {
  const period = currentPeriodKey();
  const [myRanking, setMyRanking] = useState<RankingEntry | null>(null);
  const [totalMembers, setTotalMembers] = useState(0);
  const [myVendors, setMyVendors] = useState<VendorBreakdown[]>([]);
  const [teamTotals, setTeamTotals] = useState<TeamTotals | null>(null);
  const [allMemberCards, setAllMemberCards] = useState<MemberCardData[]>([]);
  const [earnedBadges, setEarnedBadges] = useState<EarnedBadge[]>([]);
  const [allBadgeDefs, setAllBadgeDefs] = useState<BadgeDefinition[]>([]);
  const [loading, setLoading] = useState(true);

  const monthLabel = new Date(period + "-01").toLocaleDateString("en-US", {
    month: "long",
  });

  const fetchData = useCallback(async () => {
    if (!memberId) {
      setLoading(false);
      return;
    }

    try {
      const [leaderboardRes, dashboardRes, badgesRes] = await Promise.all([
        fetch(`/api/leaderboard?period=${period}`),
        fetch(`/api/dashboard?period=${period}`),
        fetch(`/api/badges?memberId=${memberId}`),
      ]);

      if (leaderboardRes.ok) {
        const json = await leaderboardRes.json();
        const rankings: RankingEntry[] = json.data.rankings;
        setTotalMembers(rankings.length);
        setMyRanking(rankings.find((r) => r.memberId === memberId) || null);
      }

      if (dashboardRes.ok) {
        const json = await dashboardRes.json();
        setTeamTotals(json.data.teamTotals);
        setAllMemberCards(json.data.memberCards);
        const myCard = json.data.memberCards.find(
          (m: MemberCardData) => m.memberId === memberId,
        );
        if (myCard) setMyVendors(myCard.vendors);
      }

      if (badgesRes.ok) {
        const json = await badgesRes.json();
        setEarnedBadges(json.data.earned);
        setAllBadgeDefs(json.data.definitions);
      }

      // Trigger badge computation in the background
      fetch("/api/badges", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ memberId }),
      });
    } finally {
      setLoading(false);
    }
  }, [memberId, period]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  // ── Not linked ──
  if (!memberId) {
    return (
      <div className="max-w-2xl mx-auto py-16 text-center space-y-3">
        <div className="text-6xl">👋</div>
        <h1 className="text-2xl font-bold text-(--text-primary)">
          Welcome, {userName}!
        </h1>
        <p className="text-(--text-secondary)">
          Your account hasn&apos;t been linked to a team member profile yet.
          Ask your admin to link your account in the Members page.
        </p>
      </div>
    );
  }

  // ── Loading skeleton ──
  if (loading) {
    return (
      <div className="max-w-2xl mx-auto space-y-6">
        <div className="h-8 w-48 rounded bg-gray-200 animate-pulse" />
        <div className="h-72 rounded-2xl bg-gray-200 animate-pulse" />
        <div className="h-40 rounded-2xl bg-gray-100 animate-pulse" />
        <div className="grid grid-cols-3 gap-3">
          <div className="h-24 rounded-xl bg-gray-100 animate-pulse" />
          <div className="h-24 rounded-xl bg-gray-100 animate-pulse" />
          <div className="h-24 rounded-xl bg-gray-100 animate-pulse" />
        </div>
      </div>
    );
  }

  // ── Narrative computations ──
  const percentile = myRanking
    ? Math.round(((totalMembers - myRanking.rank + 1) / totalMembers) * 100)
    : 0;
  const tagline = myRanking
    ? getTagline(myRanking.rank, totalMembers, myRanking.rankChange)
    : "";

  const activeVendors = myVendors
    .filter((v) => v.spendCents > 0)
    .sort((a, b) => b.spendCents - a.spendCents);
  const topVendor = activeVendors[0] || null;
  const totalSpend = myRanking?.totalSpendCents || 0;
  const totalTokens = myRanking?.totalTokens || 0;

  // Vendor diversity: how many tools do I use vs the team?
  const myVendorCount = activeVendors.length;
  const teamVendorCounts = allMemberCards.map(
    (m) => m.vendors.filter((v) => v.spendCents > 0).length,
  );
  const lessDiverseCount = teamVendorCounts.filter(
    (c) => c < myVendorCount,
  ).length;
  const diversityPercentile =
    teamVendorCounts.length > 0
      ? Math.round((lessDiverseCount / teamVendorCounts.length) * 100)
      : 0;

  // Spend vs team average
  const teamAvgSpend =
    teamTotals && teamTotals.activeMemberCount > 0
      ? Math.round(teamTotals.totalSpendCents / teamTotals.activeMemberCount)
      : 0;
  const spendVsAvg =
    teamAvgSpend > 0
      ? Math.round(((totalSpend - teamAvgSpend) / teamAvgSpend) * 100)
      : 0;

  // Token percentile
  const allTokenCounts = allMemberCards.map((m) =>
    m.vendors.reduce((sum, v) => sum + (v.tokens || 0), 0),
  );
  const lessThanMyTokens = allTokenCounts.filter(
    (t) => t < (totalTokens || 0),
  ).length;
  const tokenPercentile =
    totalTokens && totalTokens > 0 && allTokenCounts.length > 0
      ? Math.round((lessThanMyTokens / allTokenCounts.length) * 100)
      : null;

  const earnedTypes = new Set(earnedBadges.map((b) => b.badgeType));

  return (
    <div className="max-w-2xl mx-auto space-y-8">
      {/* ── Page title ── */}
      <h1 className="text-xs font-semibold uppercase tracking-widest text-(--text-secondary)">
        Your {monthLabel} Burnboard
      </h1>

      {/* ════════════════ HERO ════════════════ */}
      {myRanking ? (
        <div
          className="relative rounded-2xl p-8 overflow-hidden stagger-enter"
          style={{
            background: "linear-gradient(135deg, #1a1a2e 0%, #6C63FF 100%)",
          }}
        >
          <div className="relative z-10 text-center">
            <div className="text-8xl font-black text-white tracking-tight leading-none">
              #{myRanking.rank}
            </div>
            <div className="text-lg mt-2" style={{ color: "rgba(255,255,255,0.7)" }}>
              Top {percentile}% of {totalMembers} engineers
            </div>
            <div className="text-base mt-3 italic" style={{ color: "rgba(255,255,255,0.5)" }}>
              {tagline}
            </div>

            {/* Rank change pill */}
            {myRanking.rankChange !== null && myRanking.rankChange > 0 && (
              <div
                className="inline-flex items-center gap-1.5 mt-4 px-3 py-1 rounded-full text-sm font-medium"
                style={{
                  backgroundColor: "rgba(34, 197, 94, 0.2)",
                  color: "#86efac",
                }}
              >
                ▲ {myRanking.rankChange} spot
                {myRanking.rankChange !== 1 ? "s" : ""} from last month
              </div>
            )}
            {myRanking.rankChange === 0 && myRanking.previousRank && (
              <div
                className="inline-flex items-center gap-1.5 mt-4 px-3 py-1 rounded-full text-sm"
                style={{
                  backgroundColor: "rgba(255,255,255,0.1)",
                  color: "rgba(255,255,255,0.5)",
                }}
              >
                Holding at #{myRanking.rank}
              </div>
            )}

            {/* Spend + Tokens hero stats */}
            <div className="flex items-center justify-center gap-6 mt-6">
              <div>
                <span className="text-2xl font-bold text-white">
                  {formatCurrency(totalSpend)}
                </span>
                <span className="text-sm ml-1.5" style={{ color: "rgba(255,255,255,0.6)" }}>
                  spent
                </span>
              </div>
              <div
                className="w-px h-6"
                style={{ backgroundColor: "rgba(255,255,255,0.2)" }}
              />
              <div>
                <span className="text-2xl font-bold text-white">
                  {formatTokens(totalTokens > 0 ? totalTokens : null)}
                </span>
                <span className="text-sm ml-1.5" style={{ color: "rgba(255,255,255,0.6)" }}>
                  burned
                </span>
              </div>
            </div>
          </div>
        </div>
      ) : (
        <div className="rounded-2xl p-12 text-center bg-(--card-bg) border border-(--card-border)">
          <div className="text-4xl mb-3">📊</div>
          <p className="text-(--text-secondary)">
            No ranking data for {monthLabel} yet.
          </p>
          <p className="text-sm text-(--text-secondary) mt-1">
            Sync some data to see your Burnboard.
          </p>
        </div>
      )}

      {/* ════════════════ TOP TOOL REVEAL ════════════════ */}
      {topVendor && totalSpend > 0 && (
        <div
          className="rounded-2xl p-6 text-center stagger-enter"
          style={{
            backgroundColor: VENDOR_COLORS[topVendor.vendor].background,
            borderWidth: 1,
            borderStyle: "solid",
            borderColor: VENDOR_COLORS[topVendor.vendor].primary + "20",
            animationDelay: "100ms",
          }}
        >
          <div className="text-xs font-semibold uppercase tracking-widest text-(--text-secondary) mb-2">
            Your top tool was
          </div>
          <div
            className="text-4xl font-black"
            style={{ color: VENDOR_COLORS[topVendor.vendor].primary }}
          >
            {VENDOR_LABELS[topVendor.vendor]}
          </div>
          <div className="text-sm text-(--text-secondary) mt-2">
            {Math.round((topVendor.spendCents / totalSpend) * 100)}% of your AI
            budget
          </div>
        </div>
      )}

      {/* ════════════════ AI FINGERPRINT ════════════════ */}
      {activeVendors.length > 0 && (
        <div className="space-y-4">
          <h2 className="text-xs font-semibold uppercase tracking-widest text-(--text-secondary)">
            Your AI Fingerprint
          </h2>
          <div className="rounded-xl border border-(--card-border) bg-(--card-bg) p-5 space-y-3">
            {activeVendors.map((v, i) => {
              const pct =
                totalSpend > 0 ? (v.spendCents / totalSpend) * 100 : 0;
              const colors = VENDOR_COLORS[v.vendor];
              return (
                <div
                  key={v.vendor}
                  className="stagger-enter"
                  style={{ animationDelay: `${i * 100}ms` }}
                >
                  <div className="flex items-center justify-between text-sm mb-1">
                    <div className="flex items-center gap-2">
                      <span
                        className="inline-block h-2.5 w-2.5 rounded-full"
                        style={{ backgroundColor: colors.primary }}
                      />
                      <span className="font-medium text-(--text-primary)">
                        {VENDOR_LABELS[v.vendor]}
                      </span>
                    </div>
                    <span className="text-(--text-secondary) text-xs">
                      {formatCurrency(v.spendCents)} · {Math.round(pct)}%
                    </span>
                  </div>
                  <div className="h-2.5 rounded-full bg-gray-100 overflow-hidden">
                    <div
                      className="h-full rounded-full"
                      style={{
                        width: `${pct}%`,
                        backgroundColor: colors.primary,
                        animation: "bar-fill 800ms ease-out both",
                        animationDelay: `${i * 100 + 200}ms`,
                      }}
                    />
                  </div>
                </div>
              );
            })}
          </div>
          {myVendorCount > 0 && (
            <p className="text-sm text-(--text-secondary)">
              You use{" "}
              <span className="font-semibold text-(--text-primary)">
                {myVendorCount} tool{myVendorCount !== 1 ? "s" : ""}
              </span>
              {diversityPercentile > 0 && (
                <> — more than {diversityPercentile}% of the team</>
              )}
            </p>
          )}
        </div>
      )}

      {/* ════════════════ HOW YOU COMPARE ════════════════ */}
      {myRanking && (
        <div className="grid grid-cols-3 gap-3">
          <div className="rounded-xl border border-(--card-border) bg-(--card-bg) p-4 text-center stagger-enter">
            <div className="text-2xl font-bold text-(--text-primary)">
              {spendVsAvg > 0 ? "+" : ""}
              {spendVsAvg}%
            </div>
            <div className="text-xs text-(--text-secondary) mt-1 uppercase tracking-wide">
              vs team avg
            </div>
          </div>
          <div
            className="rounded-xl border border-(--card-border) bg-(--card-bg) p-4 text-center stagger-enter"
            style={{ animationDelay: "80ms" }}
          >
            <div className="text-2xl font-bold text-(--text-primary)">
              {tokenPercentile !== null ? `Top ${100 - tokenPercentile}%` : "—"}
            </div>
            <div className="text-xs text-(--text-secondary) mt-1 uppercase tracking-wide">
              token output
            </div>
          </div>
          <div
            className="rounded-xl border border-(--card-border) bg-(--card-bg) p-4 text-center stagger-enter"
            style={{ animationDelay: "160ms" }}
          >
            <div className="text-2xl font-bold text-(--text-primary)">
              {myVendorCount} tool{myVendorCount !== 1 ? "s" : ""}
            </div>
            <div className="text-xs text-(--text-secondary) mt-1 uppercase tracking-wide">
              in your stack
            </div>
          </div>
        </div>
      )}

      {/* ════════════════ TROPHY CASE ════════════════ */}
      <div className="space-y-4">
        <div className="flex items-baseline justify-between">
          <h2 className="text-xs font-semibold uppercase tracking-widest text-(--text-secondary)">
            Trophy Case
          </h2>
          <span className="text-xs text-(--text-secondary)">
            {earnedBadges.length} of {allBadgeDefs.length} unlocked
          </span>
        </div>
        <div className="flex flex-wrap gap-2">
          {allBadgeDefs.map((def, index) => {
            const earned = earnedBadges.find((b) => b.badgeType === def.type);
            return (
              <div
                key={def.type}
                className="stagger-enter"
                style={{ animationDelay: `${index * 80}ms` }}
              >
                <BadgeCard
                  badge={def}
                  earned={earnedTypes.has(def.type)}
                  earnedAt={earned?.earnedAt}
                />
              </div>
            );
          })}
        </div>
      </div>

      {/* ════════════════ MONTHLY INSIGHT ════════════════ */}
      <div className="space-y-4">
        <h2 className="text-xs font-semibold uppercase tracking-widest text-(--text-secondary)">
          Your {monthLabel} Insight
        </h2>
        <SuggestionMachine
          memberId={memberId}
          period={period}
          memberName={userName}
        />
      </div>
    </div>
  );
}
