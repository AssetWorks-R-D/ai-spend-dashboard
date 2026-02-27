"use client";

import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  Legend,
  ResponsiveContainer,
  LabelList,
} from "recharts";
import { VENDOR_COLORS, VENDOR_LABELS } from "@/lib/vendor-colors";
import { formatCurrency } from "@/lib/utils/format-currency";
import { formatTokens } from "@/lib/utils/format-tokens";
import { formatName } from "@/lib/utils/format-name";
import type { VendorType, LeaderboardDisplayMode } from "@/types";

const ALL_VENDORS: VendorType[] = ["cursor", "claude", "copilot", "kiro", "replit"];
const MEDALS = ["🥇", "🥈", "🥉"];

interface VendorBreakdown {
  vendor: VendorType;
  spendCents: number;
  tokens: number | null;
}

interface MemberChartData {
  memberId: string;
  memberName: string;
  totalSpendCents: number;
  vendors: VendorBreakdown[];
}

interface SpendChartProps {
  memberCards: MemberChartData[];
  periodLabel?: string;
  displayMode?: LeaderboardDisplayMode;
}

interface ChartRow {
  name: string;
  cursor: number;
  claude: number;
  copilot: number;
  kiro: number;
  replit: number;
  total: number;
  totalCents: number;
  rank: number;
  _vendors: VendorBreakdown[];
}

function buildChartData(members: MemberChartData[], limit = 10, displayMode: LeaderboardDisplayMode = "named"): ChartRow[] {
  return members
    .sort((a, b) => b.totalSpendCents - a.totalSpendCents)
    .slice(0, limit)
    .map((m, index) => {
      const row: ChartRow = {
        name: formatName(m.memberName, displayMode, index + 1),
        cursor: 0,
        claude: 0,
        copilot: 0,
        kiro: 0,
        replit: 0,
        total: m.totalSpendCents / 100,
        totalCents: m.totalSpendCents,
        rank: index,
        _vendors: m.vendors,
      };
      for (const v of m.vendors) {
        row[v.vendor] = v.spendCents / 100;
      }
      return row;
    });
}

function CustomTooltip({
  active,
  payload,
  label,
}: {
  active?: boolean;
  payload?: { dataKey: string; value: number; payload: ChartRow }[];
  label?: string;
}) {
  if (!active || !payload || !payload.length) return null;

  const row = payload[0].payload;
  const activeVendors = row._vendors
    .filter((v) => v.spendCents > 0)
    .sort((a, b) => b.spendCents - a.spendCents);

  return (
    <div className="rounded-lg border bg-(--card-bg) p-3 shadow-lg">
      <p className="mb-1.5 text-sm font-semibold text-(--text-primary)">
        {row.rank < 3 ? `${MEDALS[row.rank]} ` : ""}{label}
      </p>
      <p className="mb-1.5 text-xs font-bold text-(--text-primary)">
        {formatCurrency(row.totalCents)}
      </p>
      {activeVendors.length === 0 ? (
        <p className="text-xs text-(--text-secondary)">No usage</p>
      ) : (
        activeVendors.map((v) => (
          <div key={v.vendor} className="flex items-center gap-2 text-xs">
            <span
              className="inline-block h-2 w-2 rounded-full shrink-0"
              style={{ backgroundColor: VENDOR_COLORS[v.vendor].primary }}
            />
            <span className="font-medium">{VENDOR_LABELS[v.vendor]}</span>
            <span className="text-(--text-secondary)">
              {formatCurrency(v.spendCents)} · {formatTokens(v.tokens)}
            </span>
          </div>
        ))
      )}
    </div>
  );
}

/** Custom Y-axis tick with medal emojis for top 3 */
function CustomYAxisTick(props: { x?: number; y?: number; payload?: { value: string; index: number } }) {
  const { x, y, payload } = props;
  if (!payload || x === undefined || y === undefined) return null;
  const medal = payload.index < 3 ? MEDALS[payload.index] + " " : "    ";
  return (
    <text x={x} y={y} dy={4} textAnchor="end" fontSize={12} fill="currentColor">
      {medal}{payload.value}
    </text>
  );
}

/** Right-side label showing total dollar amount */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function RightLabel(props: any) {
  const x = Number(props.x) || 0;
  const y = Number(props.y) || 0;
  const w = Number(props.width) || 0;
  const h = Number(props.height) || 0;
  const v = Number(props.value) || 0;
  if (!v) return null;
  return (
    <text
      x={x + w + 8}
      y={y + h / 2}
      dy={4}
      fontSize={12}
      fontWeight={600}
      fill="currentColor"
    >
      ${Math.round(v).toLocaleString()}
    </text>
  );
}

export function SpendChart({ memberCards, periodLabel, displayMode = "named" }: SpendChartProps) {
  const data = buildChartData(memberCards, 10, displayMode);

  if (data.length === 0) {
    return (
      <div className="py-12 text-center text-(--text-secondary)">
        <p className="text-lg font-medium">No usage data yet</p>
        <p className="mt-1 text-sm">
          Configure vendor APIs and sync data to see charts here.
        </p>
      </div>
    );
  }

  // Find last vendor in the stack that has data (for right-side labels)
  const lastVendorWithData = ALL_VENDORS.slice().reverse().find((v) =>
    data.some((row) => row[v] > 0)
  ) || "cursor";

  const barHeight = Math.max(data.length * 52, 300);

  return (
    <div>
      {periodLabel && (
        <h3 className="mb-4 text-base font-semibold text-(--text-primary)">
          Team Spend by Member — {periodLabel}
        </h3>
      )}
      <ResponsiveContainer width="100%" height={barHeight}>
        <BarChart data={data} layout="vertical" margin={{ left: 20, right: 80 }}>
          <XAxis
            type="number"
            tickFormatter={(v: number) => `$${v.toLocaleString()}`}
            tick={{ fontSize: 12 }}
          />
          <YAxis
            type="category"
            dataKey="name"
            width={150}
            tick={CustomYAxisTick as unknown as React.SVGProps<SVGTextElement>}
          />
          <Tooltip content={<CustomTooltip />} />
          <Legend
            formatter={(value: string) =>
              VENDOR_LABELS[value as VendorType] || value
            }
          />
          {ALL_VENDORS.map((vendor) => (
            <Bar
              key={vendor}
              dataKey={vendor}
              stackId="spend"
              fill={VENDOR_COLORS[vendor].primary}
              name={vendor}
              radius={vendor === lastVendorWithData ? [0, 4, 4, 0] : undefined}
            >
              {vendor === lastVendorWithData && (
                <LabelList
                  dataKey="total"
                  content={RightLabel}
                />
              )}
            </Bar>
          ))}
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
