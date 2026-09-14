import type { ReactNode } from "react";
import type { CSSProperties } from "react";
import { SiteNavbar, type NavKey } from "./site-navbar";
import { SiteFooter } from "./site-footer";

const lightThemeVars: Record<string, string> = {
  "--bg": "#ffffff",
  "--bg-soft": "#f8fafc",
  "--ink": "#111827",
  "--muted": "#6b7280",
};

export function MarketingShell({ children, active }: { children: ReactNode; active?: NavKey }) {
  return (
    <main className="min-h-screen bg-[var(--bg)] text-[var(--ink)]" style={lightThemeVars as CSSProperties}>
      <SiteNavbar active={active} />
      {children}
      <SiteFooter />
    </main>
  );
}
