import { requireAuth } from "@/lib/auth";
import { AppShell } from "@/components/layout/AppShell";

export default async function AuthenticatedLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await requireAuth();

  return (
    <AppShell
      userRole={session.user.role}
      userName={session.user.name}
    >
      {children}
    </AppShell>
  );
}
