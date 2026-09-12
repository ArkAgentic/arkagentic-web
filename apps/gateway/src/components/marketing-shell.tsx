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
      <div className="pointer-events-none absolute inset-x-0 top-0 h-[30rem] bg-[radial-gradient(circle_at_18%_0%,rgba(59,130,246,0.10),transparent_46%)]" />
      <div className="pointer-events-none absolute right-0 top-10 h-[26rem] w-[26rem] bg-[radial-gradient(circle,rgba(139,92,246,0.10),transparent_62%)]" />
      <div className="pointer-events-none absolute left-[42%] top-24 h-[24rem] w-[24rem] bg-[radial-gradient(circle,rgba(125,211,252,0.10),transparent_66%)]" />
      <SiteNavbar active={active} />
      {children}
      <SiteFooter />
    </main>
  );
}
