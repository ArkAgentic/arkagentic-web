"use client";

import { MarketingShell } from "@/components/marketing-shell";
import { useI18n } from "@/lib/i18n";

export default function PrivacyPage() {
  const { t } = useI18n();

  const badges = [
    t("privacy.badges.au"),
    t("privacy.badges.us"),
    t("privacy.badges.eu"),
    t("privacy.badges.zdr"),
  ] as string[];

  const complianceItems = [
    t("privacy.sections.compliance.items.0"),
    t("privacy.sections.compliance.items.1"),
    t("privacy.sections.compliance.items.2"),
    t("privacy.sections.compliance.items.3"),
  ];
  const dataItems = [
    t("privacy.sections.dataProcessed.items.0"),
    t("privacy.sections.dataProcessed.items.1"),
  ];

  return (
    <MarketingShell>
      <section className="mx-auto w-full max-w-7xl px-6 py-20 md:py-28">
        <div className="flex flex-wrap gap-2">
          {badges.map((badge) => (
            <span
              key={badge}
              className="inline-flex items-center rounded-full border border-amber-200 bg-amber-50/80 px-2.5 py-1 text-xs font-medium text-stone-700"
            >
              {badge}
            </span>
          ))}
        </div>

        <h1 className="mt-5 text-4xl font-semibold text-stone-900 md:text-5xl">{t("privacy.title")}</h1>
        <p className="mt-5 max-w-5xl text-base leading-8 text-stone-600 md:text-lg">{t("privacy.subtitle")}</p>

        <article className="mt-12 rounded-2xl border border-amber-100/60 bg-white/75 p-7 shadow-[0_14px_34px_rgba(92,56,19,0.11)] md:p-9">
          <section>
            <h2 className="text-xl font-semibold text-stone-900">{t("privacy.sections.baseline.title")}</h2>
            <p className="mt-3 leading-8 text-stone-600">{t("privacy.sections.baseline.p1")}</p>
            <p className="mt-3 leading-8 text-stone-600">{t("privacy.sections.baseline.p2")}</p>
          </section>

          <section className="mt-8 border-t border-amber-100/70 pt-8">
            <h2 className="text-xl font-semibold text-stone-900">{t("privacy.sections.compliance.title")}</h2>
            <p className="mt-3 leading-8 text-stone-600">{t("privacy.sections.compliance.intro")}</p>
            <ul className="mt-3 list-disc space-y-2 pl-6 text-stone-600">
              {complianceItems.map((item) => (
                <li key={item}>{item}</li>
              ))}
            </ul>
          </section>

          <section className="mt-8 border-t border-amber-100/70 pt-8">
            <h2 className="text-xl font-semibold text-stone-900">{t("privacy.sections.dataProcessed.title")}</h2>
            <ul className="mt-3 list-disc space-y-2 pl-6 text-stone-600">
              {dataItems.map((item) => (
                <li key={item}>{item}</li>
              ))}
            </ul>
          </section>

          <section className="mt-8 border-t border-amber-100/70 pt-8">
            <h2 className="text-xl font-semibold text-stone-900">{t("privacy.sections.residency.title")}</h2>
            <p className="mt-3 leading-8 text-stone-600">{t("privacy.sections.residency.body")}</p>
          </section>

          <section className="mt-8 border-t border-amber-100/70 pt-8">
            <h2 className="text-xl font-semibold text-stone-900">{t("privacy.sections.rights.title")}</h2>
            <p className="mt-3 leading-8 text-stone-600">{t("privacy.sections.rights.body")}</p>
          </section>

          <section className="mt-8 border-t border-amber-100/70 pt-8">
            <h2 className="text-xl font-semibold text-stone-900">{t("privacy.sections.contact.title")}</h2>
            <p className="mt-3 leading-8 text-stone-600">{t("privacy.sections.contact.body")}</p>
            <p className="mt-2 text-sm text-stone-600">{t("privacy.sections.contact.email")}</p>
          </section>
        </article>
      </section>
    </MarketingShell>
  );
}
