import type { ReactNode } from "react";
import { NavLink } from "react-router-dom";
import { useAuth } from "../auth/AuthContext";
import { Icon } from "./ui";

const NAV = [
  { to: "/", label: "Dashboard", end: true },
  { to: "/accounts", label: "Accounts", end: true },
  { to: "/sync-activity", label: "Sync Activity", end: false },
  { to: "/settings", label: "Settings", end: false },
];

function initials(email: string) {
  return email.slice(0, 2).toUpperCase();
}

export function Layout({ children, onLink }: { children: ReactNode; onLink?: () => void }) {
  const { user, logout } = useAuth();

  return (
    <div className="min-h-screen bg-surface text-on-surface">
      <header className="sticky top-0 z-40 w-full bg-surface/85 backdrop-blur-xl shadow-[0_1px_8px_rgba(0,0,0,0.04)]">
        <div className="h-20 max-w-[1280px] mx-auto px-margin-mobile md:px-margin-tablet lg:px-margin-desktop flex items-center justify-between gap-space-md">
          <div className="flex items-center gap-space-xl">
            <NavLink to="/" className="flex items-center gap-space-sm">
              <span className="w-9 h-9 rounded-xl bg-primary-container flex items-center justify-center text-on-primary">
                <Icon name="account_balance_wallet" className="text-[20px]" />
              </span>
              <span className="text-headline-sm font-bold tracking-tight">
                Kudi<span className="text-primary-container">Vault</span>
              </span>
            </NavLink>
            <nav className="hidden md:flex items-center gap-space-2xs p-space-2xs bg-surface-container-lowest rounded-xl">
              {NAV.map((n) => (
                <NavLink
                  key={n.to}
                  to={n.to}
                  end={n.end}
                  className={({ isActive }) =>
                    `px-space-md py-space-xs rounded-lg text-label-md transition-colors ${
                      isActive
                        ? "text-on-surface bg-surface-container font-semibold"
                        : "text-on-surface-variant hover:text-on-surface hover:bg-surface-container-low"
                    }`
                  }
                >
                  {n.label}
                </NavLink>
              ))}
            </nav>
          </div>
          <div className="flex items-center gap-space-sm">
            {onLink && (
              <button
                onClick={onLink}
                className="inline-flex items-center gap-space-2xs px-space-lg h-11 rounded-xl bg-primary-container text-on-primary text-label-md font-semibold hover:bg-primary transition-colors shadow-sm active:scale-[0.99]"
              >
                <Icon name="add" className="text-[18px]" />
                <span className="hidden sm:inline">Link account</span>
              </button>
            )}
            <div className="flex items-center gap-space-sm pl-space-xs">
              <span className="w-9 h-9 rounded-xl bg-primary flex items-center justify-center text-on-primary text-label-md font-semibold">
                {user ? initials(user.email) : "--"}
              </span>
              <div className="hidden lg:flex flex-col leading-tight">
                <span className="text-label-md text-on-surface">{user?.email}</span>
                <button
                  onClick={logout}
                  className="text-caption text-on-surface-variant hover:text-error text-left"
                >
                  Sign out
                </button>
              </div>
            </div>
          </div>
        </div>
      </header>

      <main className="max-w-[1280px] mx-auto px-margin-mobile md:px-margin-tablet lg:px-margin-desktop py-space-xl">
        {children}
      </main>

      <footer className="border-t border-surface-container mt-space-3xl">
        <div className="max-w-[1280px] mx-auto px-margin-mobile md:px-margin-tablet lg:px-margin-desktop py-space-lg text-label-sm text-on-surface-variant flex flex-col sm:flex-row justify-between gap-space-xs">
          <span>KudiVault — personal bank account aggregator</span>
          <span>Demo build · mock provider data</span>
        </div>
      </footer>
    </div>
  );
}
