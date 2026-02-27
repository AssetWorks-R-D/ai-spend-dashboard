import { formatCurrency } from "@/lib/utils/format-currency";
import { formatTokens } from "@/lib/utils/format-tokens";
import { VENDOR_COLORS, VENDOR_LABELS } from "@/lib/vendor-colors";
import type { VendorType } from "@/types";

interface VendorSummary {
  vendor: VendorType;
  totalSpendCents: number;
  totalTokens: number | null;
  seatCount: number;
  lastSyncAt: string | null;
  lastSyncStatus: string | null;
  sourceType: string;
}

interface TeamTotals {
  totalSpendCents: number;
  totalTokens: number | null;
  activeMemberCount: number;
}

interface KpiBarProps {
  teamTotals: TeamTotals;
  vendorSummaries: VendorSummary[];
  period: string;
  onPeriodChange: (period: string) => void;
  periodOptions: { key: string; label: string }[];
}

function freshnessDot(lastSyncAt: string | null, sourceType: string) {
  if (sourceType === "manual") {
    return { color: "#9CA3AF", label: "Manual" };
  }
  if (!lastSyncAt) {
    return { color: "#9CA3AF", label: "Never synced" };
  }
  const hoursSince = (Date.now() - new Date(lastSyncAt).getTime()) / (1000 * 60 * 60);
  if (hoursSince < 6) return { color: "#22c55e", label: "Fresh" };
  if (hoursSince < 24) return { color: "#f59e0b", label: "Stale" };
  return { color: "#ef4444", label: "Old" };
}

export function KpiBar({
  teamTotals,
  vendorSummaries,
  period,
  onPeriodChange,
  periodOptions,
}: KpiBarProps) {
  return (
    <div className="sticky top-0 z-40 -mx-6 bg-gradient-to-r from-[#1a1a2e] to-[#6C63FF] px-6 py-4 text-white">
      <div className="mx-auto flex max-w-360 items-center justify-between gap-6">
        {/* Hero metrics */}
        <div className="flex gap-8">
          <div>
            <div className="text-xs font-medium uppercase tracking-wider text-white/60">
              Total Spend
            </div>
            <div className="text-2xl font-bold">
              {formatCurrency(teamTotals.totalSpendCents)}
            </div>
          </div>
          <div>
            <div className="text-xs font-medium uppercase tracking-wider text-white/60">
              Total Tokens
            </div>
            <div className="text-2xl font-bold">
              {formatTokens(teamTotals.totalTokens)}
            </div>
          </div>
          <div>
            <div className="text-xs font-medium uppercase tracking-wider text-white/60">
              Active Members
            </div>
            <div className="text-2xl font-bold">
              {teamTotals.activeMemberCount}
            </div>
          </div>
        </div>

        {/* Vendor summary cards */}
        <div className="flex gap-2">
          {vendorSummaries.map((vs) => {
            const freshness = freshnessDot(vs.lastSyncAt, vs.sourceType);
            return (
              <div
                key={vs.vendor}
                className="rounded-lg bg-white/10 px-3 py-2 text-xs backdrop-blur-sm"
              >
                <div className="flex items-center gap-1.5">
                  <span
                    className="inline-block h-2 w-2 rounded-full"
                    style={{ backgroundColor: VENDOR_COLORS[vs.vendor].primary }}
                    title={freshness.label}
                  />
                  <span
                    className="inline-block h-1.5 w-1.5 rounded-full"
                    style={{ backgroundColor: freshness.color }}
                    title={freshness.label}
                  />
                  <span className="font-medium">{VENDOR_LABELS[vs.vendor]}</span>
                </div>
                <div className="mt-1 text-white/80">
                  {formatCurrency(vs.totalSpendCents)}
                </div>
                <div className="text-white/60">
                  {formatTokens(vs.totalTokens)} · {vs.seatCount} seats
                </div>
              </div>
            );
          })}
        </div>

        {/* Period selector */}
        <select
          value={period}
          onChange={(e) => onPeriodChange(e.target.value)}
          className="rounded-md border border-white/20 bg-white/10 px-3 py-1.5 text-sm text-white backdrop-blur-sm"
        >
          {periodOptions.map((opt) => (
            <option key={opt.key} value={opt.key} className="bg-[#1a1a2e] text-white">
              {opt.label}
            </option>
          ))}
        </select>
      </div>
    </div>
  );
}
