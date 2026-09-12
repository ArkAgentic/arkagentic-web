"use client";

import { MarketingShell } from "@/components/marketing-shell";
import { useI18n } from "@/lib/i18n";

export default function AboutPage() {
  const { t } = useI18n();

  const sections = [
    {
      title: t("about.sections.what.title"),
      body: t("about.sections.what.body"),
    },
    {
      title: t("about.sections.story.title"),
      body: t("about.sections.story.body"),
    },
    {
      title: t("about.sections.mission.title"),
      body: t("about.sections.mission.body"),
    },
    {
      title: t("about.sections.smb.title"),
      body: t("about.sections.smb.body"),
    },
  ];

  return (
    <MarketingShell active="about">
      <section className="mx-auto w-full max-w-7xl px-6 py-20 md:py-28">
        <h1 className="text-4xl font-semibold text-stone-900 md:text-5xl">{t("about.title")}</h1>
        <p className="mt-5 max-w-4xl text-base leading-8 text-stone-600 md:text-lg">{t("about.subtitle")}</p>

        <article className="mt-12 rounded-2xl border border-amber-100/60 bg-white/75 p-7 shadow-[0_14px_34px_rgba(92,56,19,0.11)] md:p-9">
          <div className="space-y-8">
            {sections.map((section, idx) => (
              <section key={section.title} className={idx > 0 ? "border-t border-amber-100/70 pt-8" : ""}>
                <h2 className="text-xl font-semibold text-stone-900">{section.title}</h2>
                <p className="mt-3 leading-8 text-stone-600">{section.body}</p>
              </section>
            ))}
          </div>
        </article>

        <article className="mt-6 rounded-2xl border border-amber-100/60 bg-white/75 p-7 shadow-[0_14px_34px_rgba(92,56,19,0.11)]">
          <h2 className="text-2xl font-semibold text-stone-900">{t("about.contact.title")}</h2>
          <p className="mt-4 leading-8 text-stone-600">{t("about.contact.support")}</p>
          <p className="leading-8 text-stone-600">{t("about.contact.business")}</p>
        </article>
      </section>
    </MarketingShell>
  );
}
