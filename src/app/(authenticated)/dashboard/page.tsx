import { requireAuth } from "@/lib/auth";
import { DashboardClient } from "./dashboard-client";

export default async function DashboardPage() {
  const session = await requireAuth();

  return (
    <DashboardClient
      currentUserMemberId={session.user.memberId || null}
    />
  );
}
