import { NavBar } from "./NavBar";

interface AppShellProps {
  children: React.ReactNode;
  userRole: string;
  userName: string;
}

export function AppShell({ children, userRole, userName }: AppShellProps) {
  return (
    <>
      <a href="#main-content" className="skip-to-content">
        Skip to content
      </a>
      <div className="min-h-screen bg-(--page-bg)">
        <NavBar userRole={userRole} userName={userName} />
        <main id="main-content" className="mx-auto max-w-360 px-6 py-6">
          {children}
        </main>
      </div>
    </>
  );
}
