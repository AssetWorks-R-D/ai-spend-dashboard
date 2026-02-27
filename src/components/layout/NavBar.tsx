"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { signOut } from "@/lib/auth-client";
import {
  LayoutDashboard,
  User,
  Shield,
  Users,
  Settings,
  Keyboard,
  FileEdit,
  LogOut,
  ChevronDown,
  Trophy,
} from "lucide-react";
import { useState, useRef, useEffect } from "react";

interface NavBarProps {
  userRole: string;
  userName: string;
}

const viewerLinks = [
  { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { href: "/my-progress", label: "My Progress", icon: User },
];

const adminLinks = [
  { href: "/admin/members", label: "Members", icon: Users },
  { href: "/admin/vendor-config", label: "Vendor Config", icon: Keyboard },
  { href: "/admin/manual-entry", label: "Manual Entry", icon: FileEdit },
  { href: "/admin/leaderboard", label: "Leaderboard", icon: Trophy },
  { href: "/admin/users", label: "Users", icon: Shield },
  { href: "/admin/settings", label: "Settings", icon: Settings },
];

export function NavBar({ userRole, userName }: NavBarProps) {
  const pathname = usePathname();
  const isAdmin = userRole === "admin";
  const [adminOpen, setAdminOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (
        dropdownRef.current &&
        !dropdownRef.current.contains(event.target as Node)
      ) {
        setAdminOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const handleSignOut = async () => {
    await signOut({
      fetchOptions: {
        onSuccess() {
          window.location.href = "/login";
        },
      },
    });
  };

  return (
    <nav className="border-b border-(--card-border) bg-(--card-bg)">
      <div className="mx-auto flex h-14 max-w-360 items-center justify-between px-6">
        {/* Logo / Brand */}
        <Link href="/dashboard" className="flex items-center gap-2 font-semibold text-(--text-primary)">
          <LayoutDashboard className="h-5 w-5 text-[#6C63FF]" />
          <span className="hidden sm:inline">AI Spend</span>
        </Link>

        {/* Navigation Links */}
        <div className="flex items-center gap-1">
          {viewerLinks.map((link) => {
            const isActive = pathname === link.href;
            return (
              <Link
                key={link.href}
                href={link.href}
                className={`flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm font-medium transition-colors ${
                  isActive
                    ? "bg-primary text-primary-foreground"
                    : "text-(--text-secondary) hover:bg-muted hover:text-(--text-primary)"
                }`}
              >
                <link.icon className="h-4 w-4" />
                {link.label}
              </Link>
            );
          })}

          {/* Admin dropdown */}
          {isAdmin && (
            <div className="relative" ref={dropdownRef}>
              <button
                onClick={() => setAdminOpen(!adminOpen)}
                className={`flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm font-medium transition-colors ${
                  pathname.startsWith("/admin")
                    ? "bg-primary text-primary-foreground"
                    : "text-(--text-secondary) hover:bg-muted hover:text-(--text-primary)"
                }`}
              >
                <Shield className="h-4 w-4" />
                Admin
                <ChevronDown className={`h-3 w-3 transition-transform ${adminOpen ? "rotate-180" : ""}`} />
              </button>

              {adminOpen && (
                <div className="absolute left-0 top-full z-50 mt-1 w-48 rounded-md border border-(--card-border) bg-(--card-bg) py-1 shadow-lg">
                  {adminLinks.map((link) => {
                    const isActive = pathname === link.href;
                    return (
                      <Link
                        key={link.href}
                        href={link.href}
                        onClick={() => setAdminOpen(false)}
                        className={`flex items-center gap-2 px-3 py-2 text-sm ${
                          isActive
                            ? "bg-muted font-medium text-(--text-primary)"
                            : "text-(--text-secondary) hover:bg-muted hover:text-(--text-primary)"
                        }`}
                      >
                        <link.icon className="h-4 w-4" />
                        {link.label}
                      </Link>
                    );
                  })}
                </div>
              )}
            </div>
          )}
        </div>

        {/* User menu */}
        <div className="flex items-center gap-3">
          <span className="text-sm text-(--text-secondary)">{userName}</span>
          <button
            onClick={handleSignOut}
            className="flex items-center gap-1.5 rounded-md px-2 py-1.5 text-sm text-(--text-secondary) hover:bg-muted hover:text-(--text-primary)"
          >
            <LogOut className="h-4 w-4" />
          </button>
        </div>
      </div>
    </nav>
  );
}
