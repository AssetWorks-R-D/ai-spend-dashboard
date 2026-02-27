interface PodiumProximityBarProps {
  rank: number;
  totalMembers: number;
  podiumSize?: number;
}

export function PodiumProximityBar({
  rank,
  totalMembers,
  podiumSize = 8,
}: PodiumProximityBarProps) {
  const onPodium = rank <= podiumSize;
  const spotsFromPodium = rank - podiumSize;
  const progress = Math.max(0, Math.min(100, ((totalMembers - rank) / (totalMembers - 1)) * 100));

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between text-sm">
        <span className="font-medium text-(--text-primary)">
          {onPodium
            ? "You're on the podium!"
            : `${spotsFromPodium} spot${spotsFromPodium !== 1 ? "s" : ""} from the top ${podiumSize}`}
        </span>
        <span className="text-(--text-secondary)">
          #{rank} of {totalMembers}
        </span>
      </div>
      <div className="h-2 w-full rounded-full bg-gray-200">
        <div
          className={`h-2 rounded-full transition-all ${
            onPodium
              ? "bg-gradient-to-r from-amber-400 to-amber-500"
              : "bg-gradient-to-r from-blue-400 to-blue-500"
          }`}
          style={{ width: `${progress}%` }}
        />
      </div>
    </div>
  );
}
