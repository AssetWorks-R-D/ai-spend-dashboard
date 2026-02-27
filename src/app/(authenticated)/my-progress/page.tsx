import { requireAuth } from "@/lib/auth";
import { MyProgressClient } from "./my-progress-client";

export default async function MyProgressPage() {
  const session = await requireAuth();

  return (
    <MyProgressClient
      memberId={session.user.memberId || null}
      userName={session.user.name}
    />
  );
}
