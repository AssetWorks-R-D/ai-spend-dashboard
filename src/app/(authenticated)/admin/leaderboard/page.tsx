"use client";

import { useState, useEffect } from "react";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { GrowthArrow } from "@/components/dashboard/GrowthArrow";
import { formatCurrency } from "@/lib/utils/format-currency";
import { formatTokens } from "@/lib/utils/format-tokens";
import { currentPeriodKey, periodOptions } from "@/lib/utils/date-ranges";
import { VENDOR_LABELS } from "@/lib/vendor-colors";
import type { VendorType } from "@/types";

const ALL_VENDORS: VendorType[] = ["cursor", "claude", "copilot", "kiro", "replit", "openai"];

interface LeaderboardEntry {
  rank: number;
  memberId: string;
  memberName: string;
  totalSpendCents: number;
  totalTokens: number | null;
  rankChange: number | null;
  badgeCount: number;
  vendors: {
    vendor: VendorType;
    spendCents: number;
    tokens: number | null;
  }[];
}

export default function AdminLeaderboardPage() {
  const [period, setPeriod] = useState(currentPeriodKey);
  const [entries, setEntries] = useState<LeaderboardEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const options = periodOptions();

  useEffect(() => {
    setLoading(true);
    fetch(`/api/leaderboard?period=${period}`)
      .then((res) => res.json())
      .then((json) => setEntries(json.data?.rankings || []))
      .finally(() => setLoading(false));
  }, [period]);

  return (
    <div>
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-(--text-primary)">Leaderboard</h1>
        <select
          value={period}
          onChange={(e) => setPeriod(e.target.value)}
          className="rounded-md border px-3 py-1.5 text-sm"
        >
          {options.map((opt) => (
            <option key={opt.key} value={opt.key}>
              {opt.label}
            </option>
          ))}
        </select>
      </div>

      {loading ? (
        <p className="mt-4 text-sm text-(--text-secondary)">Loading...</p>
      ) : entries.length === 0 ? (
        <p className="mt-4 text-sm text-(--text-secondary)">
          No usage data for this period.
        </p>
      ) : (
        <div className="mt-4 overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-16">Rank</TableHead>
                <TableHead>Name</TableHead>
                <TableHead className="text-right">Total Spend</TableHead>
                <TableHead className="text-right">Total Tokens</TableHead>
                {ALL_VENDORS.map((v) => (
                  <TableHead key={v} className="text-right hidden lg:table-cell">
                    {VENDOR_LABELS[v]}
                  </TableHead>
                ))}
                <TableHead className="text-center">Badges</TableHead>
                <TableHead className="text-center">Change</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {entries.map((entry) => {
                const isInactive = entry.totalSpendCents === 0;
                return (
                  <TableRow
                    key={entry.memberId}
                    className={isInactive ? "opacity-50" : ""}
                  >
                    <TableCell className="font-bold">#{entry.rank}</TableCell>
                    <TableCell className="font-medium">{entry.memberName}</TableCell>
                    <TableCell className="text-right font-semibold">
                      {formatCurrency(entry.totalSpendCents)}
                    </TableCell>
                    <TableCell className="text-right">
                      {formatTokens(entry.totalTokens)}
                    </TableCell>
                    {ALL_VENDORS.map((vendor) => {
                      const vd = entry.vendors.find((v) => v.vendor === vendor);
                      return (
                        <TableCell
                          key={vendor}
                          className="text-right hidden lg:table-cell"
                        >
                          {formatCurrency(vd?.spendCents || 0)}
                        </TableCell>
                      );
                    })}
                    <TableCell className="text-center">
                      {entry.badgeCount > 0 ? entry.badgeCount : "—"}
                    </TableCell>
                    <TableCell className="text-center">
                      <GrowthArrow rankChange={entry.rankChange} />
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  );
}
