import { VENDOR_COLORS, VENDOR_LABELS } from "@/lib/vendor-colors";
import { formatCurrency } from "@/lib/utils/format-currency";
import { formatTokens } from "@/lib/utils/format-tokens";
import type { VendorType } from "@/types";

interface ToolPillProps {
  vendor: VendorType;
  spendCents: number;
  tokens: number | null;
}

export function ToolPill({ vendor, spendCents, tokens }: ToolPillProps) {
  const colors = VENDOR_COLORS[vendor];
  const isInactive = spendCents === 0 && (tokens === null || tokens === 0);

  return (
    <div
      className="flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs"
      style={{
        backgroundColor: isInactive ? "#F3F4F6" : colors.background,
        borderWidth: 1,
        borderColor: isInactive ? "#E5E7EB" : colors.primary + "30",
        opacity: isInactive ? 0.5 : 1,
      }}
    >
      <span
        className="inline-block h-2 w-2 rounded-full shrink-0"
        style={{ backgroundColor: isInactive ? "#9CA3AF" : colors.primary }}
      />
      <span className="font-semibold" style={{ color: isInactive ? "#6B7280" : colors.primary }}>
        {VENDOR_LABELS[vendor]}
      </span>
      <span style={{ color: isInactive ? "#9CA3AF" : "#4B5563" }}>
        {formatCurrency(spendCents)} · {formatTokens(tokens)}
      </span>
    </div>
  );
}
