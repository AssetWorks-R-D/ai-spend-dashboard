import type { BadgeDefinition } from "@/lib/db/queries/badges";

interface BadgeCardProps {
  badge: BadgeDefinition;
  earned: boolean;
  earnedAt?: string;
}

export function BadgeCard({ badge, earned, earnedAt }: BadgeCardProps) {
  return (
    <div
      className={`flex items-center gap-3 rounded-lg border px-3 py-2 ${
        earned
          ? "bg-(--card-bg) border-(--card-border)"
          : "bg-gray-50 border-gray-200 opacity-50"
      }`}
    >
      <span className="text-2xl" role="img" aria-label={badge.name}>
        {badge.icon}
      </span>
      <div className="min-w-0">
        <p className="text-sm font-semibold text-(--text-primary)">{badge.name}</p>
        <p className="text-xs text-(--text-secondary)">
          {earned ? badge.description : badge.criteria}
        </p>
        {earned && earnedAt && (
          <p className="text-xs text-(--text-secondary) mt-0.5">
            Earned {new Date(earnedAt).toLocaleDateString()}
          </p>
        )}
      </div>
    </div>
  );
}
