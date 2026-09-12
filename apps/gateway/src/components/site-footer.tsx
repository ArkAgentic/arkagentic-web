"use client";

import Link from "next/link";
import { useI18n } from "@/lib/i18n";

export function SiteFooter() {
  const { t } = useI18n();

  const columns = [
    {
      title: t("footer.solutions"),
      links: [
        { label: t("footer.chinaOutbound"), href: "/solutions" },
        { label: t("footer.globalAccessChina"), href: "/solutions" },
        { label: t("footer.enterpriseSecurity"), href: "/solutions" },
      ],
    },
    {
      title: t("footer.resources"),
      links: [
        { label: t("footer.apiReference"), href: "/docs" },
        { label: t("footer.quickstart"), href: "/docs#quickstart" },
        { label: t("footer.sdks"), href: "/docs" },
        { label: t("footer.documentation"), href: "/docs" },
      ],
    },
    {
      title: t("footer.companyLegal"),
      links: [
        { label: t("footer.aboutUs"), href: "/about" },
        { label: t("footer.contact"), href: "/about" },
        { label: t("footer.privacyPolicy"), href: "/privacy" },
        { label: t("footer.terms"), href: "/about" },
      ],
    },
  ] as const;

  return (
    <footer className="border-t border-amber-100/70 bg-white/70">
      <div className="mx-auto w-full max-w-7xl px-6 py-14">
        <div className="grid gap-10 md:grid-cols-2 lg:grid-cols-4">
          {columns.map((column) => (
            <div key={column.title}>
              <h3 className="text-sm font-semibold uppercase tracking-[0.14em] text-stone-500">{column.title}</h3>
              <ul className="mt-4 space-y-2.5">
                {column.links.map((item) => (
                  <li key={item.label}>
                    <Link href={item.href} className="text-sm text-stone-600 transition hover:text-stone-900">
                      {item.label}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>

        <div className="mt-10 border-t border-amber-100/70 pt-5 text-sm text-stone-500">
          {t("footer.copyright")} {t("footer.rightsReserved")}
        </div>
      </div>
    </footer>
  );
}
