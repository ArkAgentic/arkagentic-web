"use client";

import Link from "next/link";
import { useEffect, useState, type ReactNode } from "react";
import { usePathname, useRouter } from "next/navigation";
import { BrandLogo } from "./brand-logo";
import { SiteFooter } from "./site-footer";
import { getAuthSessionState } from "@/lib/auth-provider";
import { localeMeta, useI18n, type LocaleCode } from "@/lib/i18n";

type ConsoleTab = "overview" | "setupGuide" | "topup" | "billing" | "keys" | "models" | "admin";

const languageOptions: LocaleCode[] = ["en", "zh", "fr", "de", "ja", "ko"];

export function ConsoleShell({
  active,
  children,
  basePath = "/console",
}: {
  active: ConsoleTab;
  children: ReactNode;
  basePath?: string;
}) {
  const pathname = usePathname();
  const router = useRouter();
  const { t, locale, setLocale } = useI18n();
  const [langMenuOpen, setLangMenuOpen] = useState(false);

  const authState = getAuthSessionState();
  const isAdmin = authState.status === "authenticated" && authState.payload.role === "admin";

  useEffect(() => {
    if (authState.status !== "authenticated") {
      router.replace(`/login?redirect=${encodeURIComponent(pathname || `${basePath}/overview`)}`);
      return;
    }
    if ((pathname || "").startsWith(`${basePath}/admin`) && authState.payload.role !== "admin") {
      router.replace(`${basePath}/overview`);
    }
  }, [authState, basePath, pathname, router]);

  const tabs: Array<{ key: ConsoleTab; href: string; label: string; adminOnly?: boolean }> = [
    { key: "overview", href: `${basePath}/overview`, label: t("console.nav.overview") },
    { key: "setupGuide", href: `${basePath}/setup-guide`, label: t("console.nav.setupGuide") },
    { key: "topup", href: `${basePath}/topup`, label: t("console.nav.topup") },
    { key: "billing", href: `${basePath}/billing`, label: t("console.nav.billing") },
    { key: "keys", href: `${basePath}/api-keys`, label: t("console.nav.keys") },
    { key: "models", href: `${basePath}/models`, label: t("console.nav.models") },
    { key: "admin", href: `${basePath}/admin`, label: t("console.nav.admin"), adminOnly: true },
  ];

  const visibleTabs = tabs.filter((tab) => (tab.adminOnly ? isAdmin : true));

  return (
    <main className="min-h-screen bg-[#FAF9F6] text-stone-900">
      <div className="border-b border-amber-100/70 bg-white/75 backdrop-blur-xl">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-6 py-4">
          <Link href="/" className="flex items-center gap-2">
            <BrandLogo />
          </Link>

          <div className="flex items-center gap-2">
            <div className="relative">
              <button
                type="button"
                onClick={() => setLangMenuOpen((v) => !v)}
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

            <a
              href="https://arkagentic.com"
              className="rounded-xl border border-amber-100 bg-white px-4 py-2 text-sm font-semibold text-stone-700"
            >
              {t("console.nav.backToWebsite")}
            </a>
          </div>
        </div>
      </div>

      <div className="mx-auto grid w-full max-w-7xl gap-6 px-6 py-8 lg:grid-cols-[240px_1fr]">
        <aside className="rounded-2xl border border-amber-100/60 bg-white/80 p-4 shadow-[0_10px_24px_rgba(92,56,19,0.1)]">
          <p className="mb-4 px-2 text-xs font-semibold uppercase tracking-[0.14em] text-stone-500">{t("console.nav.title")}</p>
          <nav className="space-y-1">
            {visibleTabs.map((tab) => (
              <Link
                key={tab.key}
                href={tab.href}
                className={`block rounded-xl px-3 py-2.5 text-sm font-medium transition ${
                  active === tab.key
                    ? "bg-gradient-to-r from-[#E3C486] via-[#D7963A] to-[#B4693D] text-white"
                    : "text-stone-600 hover:bg-amber-50"
                }`}
              >
                {tab.label}
              </Link>
            ))}
          </nav>
        </aside>

        <section className="space-y-6">{children}</section>
      </div>
      <SiteFooter />
    </main>
  );
}
