"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { BrandLogo } from "./brand-logo";
import { clearSessionUser, writeSessionUser, type SessionUser } from "@/lib/auth-session";
import { clearAuthToken, getAuthSessionState } from "@/lib/auth-provider";
import { localeMeta, useI18n, type LocaleCode } from "@/lib/i18n";

export type NavKey = "docs" | "pricing" | "about";

const navItems: Array<{ key: NavKey; href: string; labelKey: string }> = [
  { key: "docs", href: "/docs", labelKey: "nav.docs" },
  { key: "pricing", href: "/pricing", labelKey: "nav.pricing" },
  { key: "about", href: "/about", labelKey: "nav.about" },
];

const languageOptions: LocaleCode[] = ["en", "zh", "fr", "de", "ja", "ko"];

export function SiteNavbar({ active }: { active?: NavKey }) {
  const router = useRouter();
  const pathname = usePathname();
  const { locale, setLocale, t } = useI18n();
  const [user, setUser] = useState<SessionUser | null>(null);
  const [accountMenuOpen, setAccountMenuOpen] = useState(false);
  const [langMenuOpen, setLangMenuOpen] = useState(false);
  const isConsolePath = pathname?.startsWith("/console") || pathname?.startsWith("/llmapigateway/console");
  const showConsoleAccount = Boolean(user) && Boolean(isConsolePath);

  useEffect(() => {
    let cancelled = false;

    const load = async () => {
      const auth = getAuthSessionState();
      if (auth.status !== "authenticated") {
        clearSessionUser();
        setUser(null);
        return;
      }

      try {
        const resp = await fetch("/api/auth/session", {
          method: "GET",
          credentials: "include",
          cache: "no-store",
        });

        if (!resp.ok) throw new Error(`Session check failed: ${resp.status}`);
        const data = (await resp.json()) as {
          user?: { email?: string; name?: string; balanceUsd?: number };
        };
        if (!data.user?.email) throw new Error("Session user missing");

        const emailPrefixRaw = data.user.email.split("@")[0] || "";
        const syntheticAccount =
          /@arkagentic\.local$/i.test(data.user.email) ||
          /^usr_/i.test(emailPrefixRaw);
        if (syntheticAccount) {
          throw new Error("Synthetic session account is not allowed in navbar");
        }

        const validated = {
          email: data.user.email,
          name: data.user.name || data.user.email.split("@")[0],
          balanceUsd: Number(data.user.balanceUsd ?? 0),
        };

        writeSessionUser(validated);
        if (!cancelled) setUser(validated);
      } catch {
        clearSessionUser();
        clearAuthToken();
        if (!cancelled) {
          setUser(null);
          if (isConsolePath) {
            const redirect = `${window.location.pathname}${window.location.search}`;
            router.replace(`/login?redirect=${encodeURIComponent(redirect || "/llmapigateway/console/overview")}`);
          }
        }
      }
    };

    void load();
    const handleStorage = () => {
      void load();
    };
    const handleFocus = () => {
      void load();
    };

    window.addEventListener("storage", handleStorage);
    window.addEventListener("focus", handleFocus);
    return () => {
      cancelled = true;
      window.removeEventListener("storage", handleStorage);
      window.removeEventListener("focus", handleFocus);
    };
  }, [isConsolePath, pathname, router]);

  const emailPrefix = useMemo(() => {
    if (!user?.email) return "";
    const prefix = user.email.split("@")[0] || "";
    if (/^usr_/i.test(prefix)) return "Account";
    return prefix;
  }, [user]);
  const initials = useMemo(() => (user?.name ? user.name.slice(0, 1).toUpperCase() : "A"), [user]);

  const onSignOut = () => {
    clearSessionUser();
    clearAuthToken();
    setUser(null);
    setAccountMenuOpen(false);
  };

  return (
    <header className="sticky top-0 z-50 overflow-visible bg-transparent">
      <div className="pointer-events-none absolute inset-0">
        <div className="ark-aurora-nav-seamless absolute -inset-x-8 -inset-y-3" />
        <div className="ark-aurora-asymmetry absolute inset-0" />
      </div>
      <div className="relative mx-auto flex w-full max-w-7xl items-center justify-between gap-4 px-6 py-4">
        <Link href="/" className="flex min-w-0 items-center gap-3">
          <BrandLogo />
        </Link>

        <nav className="hidden items-center gap-7 text-sm font-medium text-stone-600 lg:flex">
          {navItems.map((item) => (
            <Link
              key={item.key}
              href={item.href}
              className={`transition hover:text-stone-900 ${active === item.key ? "text-stone-900" : ""}`}
            >
              {t(item.labelKey)}
            </Link>
          ))}
        </nav>

        <div className="flex items-center gap-3">
          <div className="relative">
            <button
              type="button"
              onClick={() => {
                setLangMenuOpen((v) => !v);
                setAccountMenuOpen(false);
              }}
              className="inline-flex h-10 items-center gap-1.5 rounded-full border border-amber-100 bg-white/80 px-3 text-xs font-semibold tracking-wide text-stone-700 shadow-[0_6px_18px_rgba(123,75,28,0.08)]"
            >
              <span>{localeMeta[locale].flag}</span>
              <span>{localeMeta[locale].short}</span>
            </button>

            {langMenuOpen ? (
              <div className="absolute right-0 mt-2 w-56 rounded-2xl border border-amber-100/80 bg-white/70 p-1.5 shadow-[0_16px_34px_rgba(92,56,19,0.18)] backdrop-blur-xl">
                {languageOptions.map((code) => (
                  <button
                    key={code}
                    onClick={() => {
                      setLocale(code);
                      setLangMenuOpen(false);
                    }}
                    className={`w-full rounded-xl px-3 py-2 text-left text-sm transition ${
                      locale === code
                        ? "bg-amber-100/80 text-amber-900"
                        : "text-stone-700 hover:bg-amber-100/70"
                    }`}
                  >
                    {localeMeta[code].flag} {localeMeta[code].menuLabel}
                  </button>
                ))}
              </div>
            ) : null}
          </div>

          {!showConsoleAccount ? (
            <Link
              href="/login"
              className="rounded-xl bg-gradient-to-r from-[#D6A04D] via-[#D7963A] to-[#B4693D] px-4 py-2.5 text-sm font-semibold text-white shadow-[0_10px_24px_rgba(123,75,28,0.26)] transition hover:-translate-y-0.5"
            >
              {t("nav.getStarted")}
            </Link>
          ) : (
            <div className="relative">
              <button
                onClick={() => {
                  setAccountMenuOpen((v) => !v);
                  setLangMenuOpen(false);
                }}
                className="flex items-center gap-2 rounded-xl border border-amber-100 bg-white/85 px-3 py-2 shadow-[0_6px_18px_rgba(123,75,28,0.08)]"
              >
                <span className="flex h-8 w-8 items-center justify-center rounded-full bg-gradient-to-r from-[#D6A04D] to-[#B4693D] text-xs font-semibold text-white">
                  {initials}
                </span>
                <div className="text-left">
                  <p className="text-[11px] font-medium text-stone-700">{emailPrefix}</p>
                </div>
              </button>

              {accountMenuOpen ? (
                <div className="absolute right-0 mt-2 w-44 rounded-xl border border-amber-100/80 bg-white/80 p-1.5 shadow-[0_12px_28px_rgba(92,56,19,0.14)] backdrop-blur-xl">
                  <Link href="/llmapigateway/console/overview" onClick={() => setAccountMenuOpen(false)} className="block rounded-lg px-3 py-2 text-sm text-stone-700 hover:bg-amber-100/70">
                    {t("nav.console")}
                  </Link>
                  <Link href="/llmapigateway/console/billing" onClick={() => setAccountMenuOpen(false)} className="block rounded-lg px-3 py-2 text-sm text-stone-700 hover:bg-amber-100/70">
                    {t("nav.billing")}
                  </Link>
                  <button onClick={onSignOut} className="w-full rounded-lg px-3 py-2 text-left text-sm text-stone-700 hover:bg-amber-100/70">
                    {t("nav.signOut")}
                  </button>
                </div>
              ) : null}
            </div>
          )}
        </div>
      </div>
    </header>
  );
}
