"use client";

import { useState, useEffect, useCallback } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { GrowthArrow } from "@/components/dashboard/GrowthArrow";
import { PodiumProximityBar } from "@/components/dashboard/PodiumProximityBar";
import { BadgeCard } from "@/components/dashboard/BadgeCard";
import { SuggestionMachine } from "@/components/dashboard/SuggestionMachine";
import { formatCurrency } from "@/lib/utils/format-currency";
import { formatTokens } from "@/lib/utils/format-tokens";
import { currentPeriodKey } from "@/lib/utils/date-ranges";
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

interface MyProgressClientProps {
  memberId: string | null;
  userName: string;
}

export function MyProgressClient({ memberId, userName }: MyProgressClientProps) {
  const period = currentPeriodKey();
  const [myRanking, setMyRanking] = useState<RankingEntry | null>(null);
  const [totalMembers, setTotalMembers] = useState(0);
  const [earnedBadges, setEarnedBadges] = useState<EarnedBadge[]>([]);
  const [allBadgeDefs, setAllBadgeDefs] = useState<BadgeDefinition[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchData = useCallback(async () => {
    if (!memberId) {
      setLoading(false);
      return;
    }

    try {
      const [leaderboardRes, badgesRes] = await Promise.all([
        fetch(`/api/leaderboard?period=${period}`),
        fetch(`/api/badges?memberId=${memberId}`),
      ]);

      if (leaderboardRes.ok) {
        const lbJson = await leaderboardRes.json();
        const rankings: RankingEntry[] = lbJson.data.rankings;
        setTotalMembers(rankings.length);
        const mine = rankings.find((r) => r.memberId === memberId);
        setMyRanking(mine || null);
      }

      if (badgesRes.ok) {
        const badgesJson = await badgesRes.json();
        setEarnedBadges(badgesJson.data.earned);
        setAllBadgeDefs(badgesJson.data.definitions);
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

  if (!memberId) {
    return (
      <div className="space-y-4">
        <h1 className="text-2xl font-bold text-(--text-primary)">My Progress</h1>
        <Card>
          <CardContent className="py-8 text-center">
            <p className="text-lg font-medium text-(--text-primary)">
              Welcome, {userName}!
            </p>
            <p className="mt-2 text-sm text-(--text-secondary)">
              Your account hasn&apos;t been linked to a team member profile yet.
              Ask your admin to link your account in the Members page.
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="space-y-4">
        <h1 className="text-2xl font-bold text-(--text-primary)">My Progress</h1>
        <p className="text-sm text-(--text-secondary)">Loading your progress...</p>
      </div>
    );
  }

  const earnedTypes = new Set(earnedBadges.map((b) => b.badgeType));

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold text-(--text-primary)">My Progress</h1>

      {/* Rank + Achievements Row */}
      <div className="flex flex-col gap-4 lg:flex-row">
        {/* Ranking */}
        {myRanking ? (
          <Card className="lg:w-80 shrink-0">
            <CardHeader className="pb-2">
              <CardTitle className="text-lg">Your Ranking</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="flex items-center gap-5">
                <div>
                  <div className="text-3xl font-bold text-(--text-primary)">
                    #{myRanking.rank}
                  </div>
                  <div className="text-xs text-(--text-secondary)">
                    of {totalMembers}
                  </div>
                </div>
                <div>
                  <div className="text-xs text-(--text-secondary)">Prev</div>
                  <div className="text-base font-semibold text-(--text-primary)">
                    {myRanking.previousRank ? `#${myRanking.previousRank}` : "New"}
                  </div>
                </div>
                <GrowthArrow rankChange={myRanking.rankChange} />
                <div className="ml-auto text-right">
                  <div className="text-base font-bold text-(--text-primary)">
                    {formatCurrency(myRanking.totalSpendCents)}
                  </div>
                  <div className="text-xs text-(--text-secondary)">
                    {formatTokens(myRanking.totalTokens)}
                  </div>
                </div>
              </div>
              <PodiumProximityBar
                rank={myRanking.rank}
                totalMembers={totalMembers}
              />
            </CardContent>
          </Card>
        ) : (
          <Card className="lg:w-80 shrink-0">
            <CardContent className="py-6 text-center">
              <p className="text-sm text-(--text-secondary)">
                No ranking data for this period yet.
              </p>
            </CardContent>
          </Card>
        )}

        {/* Achievements */}
        <Card className="flex-1 min-w-0">
          <CardHeader className="pb-2">
            <CardTitle className="text-lg">Achievements</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex flex-wrap gap-2">
              {allBadgeDefs.map((def) => {
                const earned = earnedBadges.find((b) => b.badgeType === def.type);
                return (
                  <BadgeCard
                    key={def.type}
                    badge={def}
                    earned={earnedTypes.has(def.type)}
                    earnedAt={earned?.earnedAt}
                  />
                );
              })}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Suggestion Machine Section */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Monthly Insight</CardTitle>
        </CardHeader>
        <CardContent>
          <SuggestionMachine
            memberId={memberId}
            period={period}
            memberName={userName}
          />
        </CardContent>
      </Card>
    </div>
  );
}
