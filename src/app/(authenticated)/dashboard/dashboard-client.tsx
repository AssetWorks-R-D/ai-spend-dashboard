"use client";

import { useState, useEffect, useCallback } from "react";
import { KpiBar } from "@/components/dashboard/KpiBar";
import { CardsView } from "@/components/dashboard/CardsView";
import { SpendChart } from "@/components/dashboard/SpendChart";
import { ViewToggle, type DashboardView } from "@/components/dashboard/ViewToggle";
import { currentPeriodKey, periodOptions } from "@/lib/utils/date-ranges";
import type { VendorType, LeaderboardDisplayMode } from "@/types";

interface DashboardData {
  teamTotals: {
    totalSpendCents: number;
    totalTokens: number | null;
    activeMemberCount: number;
  };
  memberCards: {
    memberId: string;
    memberName: string;
    totalSpendCents: number;
    vendors: {
      vendor: VendorType;
      spendCents: number;
      tokens: number | null;
    }[];
  }[];
  vendorSummaries: {
    vendor: VendorType;
    totalSpendCents: number;
    totalTokens: number | null;
    seatCount: number;
    lastSyncAt: string | null;
    lastSyncStatus: string | null;
    sourceType: string;
  }[];
  period: string;
  displayMode: LeaderboardDisplayMode;
}

interface DashboardClientProps {
  currentUserMemberId: string | null;
}

export function DashboardClient({ currentUserMemberId }: DashboardClientProps) {
  const [period, setPeriod] = useState(currentPeriodKey);
  const [view, setView] = useState<DashboardView>("cards");
  const [data, setData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const options = periodOptions();

  const fetchData = useCallback(async (p: string) => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/dashboard?period=${p}`);
      if (!res.ok) {
        const body = await res.json().catch(() => null);
        throw new Error(body?.error?.message || `Failed to load dashboard (${res.status})`);
      }
      const json = await res.json();
      setData(json.data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unknown error");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData(period);
  }, [period, fetchData]);

  function handlePeriodChange(newPeriod: string) {
    setPeriod(newPeriod);
  }

  if (loading && !data) {
    return (
      <div className="flex items-center justify-center py-24">
        <div className="text-(--text-secondary) text-sm">Loading dashboard...</div>
      </div>
    );
  }

  if (error && !data) {
    return (
      <div className="flex items-center justify-center py-24">
        <div className="text-center">
          <p className="text-sm text-red-600">{error}</p>
          <button
            onClick={() => fetchData(period)}
            className="mt-2 text-sm text-blue-600 underline"
          >
            Retry
          </button>
        </div>
      </div>
    );
  }

  if (!data) return null;

  return (
    <div className={view === "chart" ? "cool-mode" : ""}>
      <div className="space-y-6">
        <KpiBar
          teamTotals={data.teamTotals}
          vendorSummaries={data.vendorSummaries}
          period={period}
          onPeriodChange={handlePeriodChange}
          periodOptions={options}
        />
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <ViewToggle view={view} onViewChange={setView} />
            <span className="text-sm text-(--text-secondary)">
              {data.memberCards.length} {data.memberCards.length === 1 ? "member" : "members"}
            </span>
          </div>
          {loading && (
            <span className="text-xs text-(--text-secondary) animate-pulse">
              Updating...
            </span>
          )}
        </div>
        {view === "cards" ? (
          <CardsView
            memberCards={data.memberCards}
            currentUserMemberId={currentUserMemberId}
          />
        ) : (
          <SpendChart
            memberCards={data.memberCards}
            periodLabel={options.find((o) => o.key === period)?.label}
            displayMode={data.displayMode}
          />
        )}
      </div>
    </div>
  );
}
