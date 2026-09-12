"use client";

import { MarketingShell } from "@/components/marketing-shell";
import { useI18n } from "@/lib/i18n";

export default function SolutionsPage() {
  const { t } = useI18n();
  const solutions = [
    t("solutions.items.0"),
    t("solutions.items.1"),
    t("solutions.items.2"),
  ];

  return (
    <MarketingShell>
      <section className="mx-auto w-full max-w-7xl px-6 py-24 md:py-32">
        <h1 className="text-4xl font-semibold text-stone-900 md:text-6xl">{t("solutions.title")}</h1>
        <p className="mt-4 max-w-3xl text-lg leading-8 text-stone-600">{t("solutions.subtitle")}</p>
        <div className="mt-12 space-y-4">
          {solutions.map((item) => (
            <div key={item} className="rounded-2xl border border-amber-100/60 bg-white/75 p-6 text-lg text-stone-700 shadow-[0_10px_24px_rgba(92,56,19,0.1)]">
              {item}
            </div>
          ))}
        </div>
      </section>
    </MarketingShell>
  );
}
