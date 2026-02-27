import { Card, CardContent } from "@/components/ui/card";
import { ToolPill } from "./ToolPill";
import { formatCurrency } from "@/lib/utils/format-currency";
import { formatTokens } from "@/lib/utils/format-tokens";
import { VENDOR_COLORS } from "@/lib/vendor-colors";
import type { VendorType } from "@/types";

interface VendorBreakdown {
  vendor: VendorType;
  spendCents: number;
  tokens: number | null;
}

interface MemberCardProps {
  memberId: string;
  memberName: string;
  totalSpendCents: number;
  vendors: VendorBreakdown[];
  isCurrentUser: boolean;
}

/** Get 1-2 letter initials from a name */
function getInitials(name: string): string {
  const parts = name.trim().split(/\s+/);
  if (parts.length >= 2) {
    return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
  }
  return name.slice(0, 2).toUpperCase();
}

/** Pick a consistent avatar color based on the member's top vendor */
function getAvatarColor(vendors: VendorBreakdown[]): string {
  const top = [...vendors].sort((a, b) => b.spendCents - a.spendCents)[0];
  if (top && top.spendCents > 0) {
    return VENDOR_COLORS[top.vendor].primary;
  }
  return "#6B7280";
}

export function MemberCard({
  memberName,
  totalSpendCents,
  vendors,
  isCurrentUser,
}: MemberCardProps) {
  const initials = getInitials(memberName);
  const avatarColor = getAvatarColor(vendors);
  const totalTokens = vendors.reduce((sum, v) => sum + (v.tokens || 0), 0);
  const sortedVendors = [...vendors].sort((a, b) => b.spendCents - a.spendCents);

  return (
    <Card
      className={
        isCurrentUser
          ? "border-amber-400 bg-[var(--highlight-bg)] shadow-[var(--highlight-glow)]"
          : ""
      }
    >
      <CardContent className="p-4">
        {/* Header: Avatar + Name */}
        <div className="flex items-center gap-3 mb-3">
          <div
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-xs font-bold text-white"
            style={{ backgroundColor: avatarColor }}
          >
            {initials}
          </div>
          <div className="min-w-0">
            <div className="text-sm font-semibold text-(--text-primary) truncate">
              {memberName}
              {isCurrentUser && (
                <span className="ml-1.5 text-xs font-normal text-amber-600">You</span>
              )}
            </div>
          </div>
        </div>

        {/* Vendor pills — sorted by spend */}
        <div className="flex flex-col gap-1.5 mb-3">
          {sortedVendors.map((v) => (
            <ToolPill
              key={v.vendor}
              vendor={v.vendor}
              spendCents={v.spendCents}
              tokens={v.tokens}
            />
          ))}
        </div>

        {/* Footer: Total spend + total tokens */}
        <div className="flex items-baseline justify-between border-t border-(--border-primary) pt-2.5">
          <span className="text-lg font-bold text-(--text-primary)">
            {formatCurrency(totalSpendCents)}
          </span>
          <span className="text-xs text-(--text-secondary)">
            {formatTokens(totalTokens > 0 ? totalTokens : null)}
          </span>
        </div>
      </CardContent>
    </Card>
  );
}
