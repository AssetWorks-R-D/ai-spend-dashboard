import { MemberCard } from "./MemberCard";
import type { VendorType } from "@/types";

interface VendorBreakdown {
  vendor: VendorType;
  spendCents: number;
  tokens: number | null;
}

interface MemberCardData {
  memberId: string;
  memberName: string;
  totalSpendCents: number;
  vendors: VendorBreakdown[];
}

interface CardsViewProps {
  memberCards: MemberCardData[];
  currentUserMemberId: string | null;
}

export function CardsView({ memberCards, currentUserMemberId }: CardsViewProps) {
  if (memberCards.length === 0) {
    return (
      <div className="py-12 text-center text-(--text-secondary)">
        <p className="text-lg font-medium">No usage data yet</p>
        <p className="mt-1 text-sm">
          Configure vendor APIs and sync data to see your team here.
        </p>
      </div>
    );
  }

  return (
    <div className="grid grid-cols-[repeat(auto-fill,minmax(280px,1fr))] gap-4">
      {memberCards.map((card) => (
        <MemberCard
          key={card.memberId}
          memberId={card.memberId}
          memberName={card.memberName}
          totalSpendCents={card.totalSpendCents}
          vendors={card.vendors}
          isCurrentUser={card.memberId === currentUserMemberId}
        />
      ))}
    </div>
  );
}
