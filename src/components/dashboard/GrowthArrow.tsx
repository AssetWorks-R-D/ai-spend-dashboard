interface GrowthArrowProps {
  rankChange: number | null;
}

export function GrowthArrow({ rankChange }: GrowthArrowProps) {
  if (rankChange === null || rankChange === 0) {
    return <span className="text-xs text-gray-400">—</span>;
  }

  if (rankChange > 0) {
    return (
      <span className="text-xs font-medium text-green-600">
        ▲ {rankChange}
      </span>
    );
  }

  // Never show red/down per spec — just show gray dash for drops
  return <span className="text-xs text-gray-400">—</span>;
}
