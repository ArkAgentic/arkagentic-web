"use client";

export const dynamic = "force-dynamic";

import { MarketingShell } from "@/components/marketing-shell";
import { useMemo, useState, type FormEvent } from "react";
import Link from "next/link";
import { motion, type Variants } from "framer-motion";
import {
  BriefcaseBusiness,
  ChevronDown,
  CircleHelp,
  Clock3,
  Globe2,
  KeyRound,
  Lock,
  Mail,
  Network,
  Route,
  ShieldAlert,
  ShieldCheck,
  TrendingDown,
  Wallet,
  Wrench,
} from "lucide-react";
import { useI18n } from "@/lib/i18n";
import { RevealOnScroll, staggerContainer } from "@/components/animated/RevealOnScroll";
import { ShimmerButton } from "@/components/magicui/shimmer-button";
import { AuroraBackground } from "@/components/ui/aurora-background";
import { LogoCloud } from "@/components/ui/logo-cloud-3";
import { HowItWorks } from "@/components/ui/how-it-works";
import { TypewriterEffect, type TypewriterWord, estimateTypewriterDurationMs } from "@/components/ui/typewriter-effect";

type Scenario = "hybrid" | "single" | "cn";

type FeatureCard = {
  key: "card1" | "card2" | "card3" | "card4" | "card5" | "card6";
  icon: "network" | "cost" | "ha" | "zero" | "security" | "residency";
};

const FEATURE_CARDS: FeatureCard[] = [
  { key: "card1", icon: "network" },
  { key: "card2", icon: "cost" },
  { key: "card3", icon: "ha" },
  { key: "card4", icon: "zero" },
  { key: "card5", icon: "security" },
  { key: "card6", icon: "residency" },
];

const TRUSTED_LOGOS = [
  { src: "/assets/logos/providers/amazon-web-services-light.svg", alt: "Amazon Web Services" },
  { src: "/assets/logos/providers/azure.svg", alt: "Azure" },
  { src: "/assets/logos/providers/claude-ai-icon.svg", alt: "Claude AI" },
  { src: "/assets/logos/providers/kimi-icon.svg", alt: "Kimi" },
  { src: "/assets/logos/providers/gemini.svg", alt: "Gemini" },
  { src: "/assets/logos/providers/github-light.svg", alt: "GitHub" },
  { src: "/assets/logos/providers/google-cloud.svg", alt: "Google Cloud" },
  { src: "/assets/logos/providers/microsoft.svg", alt: "Microsoft" },
  { src: "/assets/logos/providers/openai.svg", alt: "OpenAI" },
  { src: "/assets/logos/providers/typescript.svg", alt: "TypeScript" },
  { src: "/assets/logos/providers/openclaw.svg", alt: "OpenClaw" },
];

const featureItemVariants: Variants = {
  hidden: { opacity: 0, y: 14 },
  show: { opacity: 1, y: 0 },
};

function FeatureIcon({ icon }: { icon: FeatureCard["icon"] }) {
  if (icon === "network") return <Network className="h-5 w-5" strokeWidth={2} />;
  if (icon === "cost") return <TrendingDown className="h-5 w-5" strokeWidth={2} />;
  if (icon === "ha") return <ShieldCheck className="h-5 w-5" strokeWidth={2} />;
  if (icon === "zero") return <Lock className="h-5 w-5" strokeWidth={2} />;
  if (icon === "security") return <KeyRound className="h-5 w-5" strokeWidth={2} />;
  return <Globe2 className="h-5 w-5" strokeWidth={2} />;
}

function TooltipItem({ text }: { text: string }) {
  return (
    <span className="group relative inline-flex items-center">
      <CircleHelp className="h-3.5 w-3.5 text-stone-400" />
      <span className="pointer-events-none absolute right-0 top-5 z-20 hidden w-[280px] rounded-lg border border-stone-300/80 bg-white px-3 py-2 text-[11px] leading-5 text-stone-700 shadow-lg group-hover:block">
        {text}
      </span>
    </span>
  );
}

function toTypewriterWords(text: string, className?: string): TypewriterWord[] {
  const normalized = text.trim();
  if (!normalized) return [];
  if (/\s/.test(normalized)) {
    return normalized.split(/\s+/).map((word) => ({ text: word, className }));
  }
  return [{ text: normalized, className }];
}

function HomePageContent() {
  const { t } = useI18n();

  const [monthlyTokensM, setMonthlyTokensM] = useState(10);
  const [scenario, setScenario] = useState<Scenario>("hybrid");

  const [showFormulaPanel, setShowFormulaPanel] = useState(false);
  const [contactName, setContactName] = useState("");
  const [contactEmail, setContactEmail] = useState("");
  const [contactMessage, setContactMessage] = useState("");
  const [contactLoading, setContactLoading] = useState(false);
  const [contactStatus, setContactStatus] = useState<"idle" | "success" | "error">("idle");
  const [contactStatusText, setContactStatusText] = useState("");

  const heroPrimaryWords = useMemo(() => toTypewriterWords(t("home.hero.primary")), [t]);
  const heroAccentWords = useMemo(() => toTypewriterWords(t("home.hero.accent")), [t]);
  const heroSubtitleLines = useMemo(() => {
    const raw = t("home.hero.subtitle");
    return raw
      .split("\n")
      .map((line) => line.trim())
      .filter(Boolean);
  }, [t]);
  const heroSubtitleLine1Words = useMemo(
    () => toTypewriterWords(heroSubtitleLines[0] ?? ""),
    [heroSubtitleLines],
  );
  const heroSubtitleLine1Duration = useMemo(
    () =>
      estimateTypewriterDurationMs(heroSubtitleLine1Words, {
        charDelayMs: 40,
        pauseEveryChars: 10,
        pauseDurationMs: 60,
        spacePauseMs: 40,
        punctuationPauseMs: 70,
      }),
    [heroSubtitleLine1Words],
  );
  const heroPrimaryTypewriterDuration = useMemo(
    () =>
      estimateTypewriterDurationMs(heroPrimaryWords, {
        charDelayMs: 48,
        pauseEveryChars: 4,
        pauseDurationMs: 132,
        spacePauseMs: 108,
        punctuationPauseMs: 160,
      }),
    [heroPrimaryWords],
  );
  const heroAccentStartDelay = 180 + heroPrimaryTypewriterDuration + 280;
  const heroTypewriterVisible = heroPrimaryWords.length > 0 && heroAccentWords.length > 0;

  const calc = useMemo(() => {
    const monthlyTokens = monthlyTokensM * 1_000_000;
    const baseRateByScenario = {
      hybrid: 7.2,
      single: 11.8,
      cn: 5.6,
    } as const;

    const targetRangeByScenario = {
      hybrid: { min: 0.40, max: 0.45 },
      single: { min: 0.30, max: 0.34 },
      cn: { min: 0.33, max: 0.37 },
    } as const;

    const tokenBase = (monthlyTokens / 1_000_000) * baseRateByScenario[scenario];
    const sdkOps = 260;
    const networkInfra = 210;
    const capitalCost = 50;
    const directTotal = tokenBase + sdkOps + networkInfra + capitalCost;

    const arkTokenFee = tokenBase * 1.03;
    const arkTotal = arkTokenFee;

    const target = targetRangeByScenario[scenario];
    const normalizedVolume = Math.min(1, Math.max(0, (monthlyTokensM - 1) / 99));
    const scenarioBias = scenario === "hybrid" ? 1 : scenario === "cn" ? 0.85 : 0.7;
    const dynamicTarget = target.min + (target.max - target.min) * normalizedVolume * scenarioBias;
    const rawSavingsPct = directTotal > 0 ? (directTotal - arkTotal) / directTotal : dynamicTarget;
    const savingsPct = Math.min(target.max, Math.max(target.min, Math.max(rawSavingsPct, dynamicTarget)));

    const adjustedArkTotal = directTotal * (1 - savingsPct);

    return {
      tokenBase,
      sdkOps,
      networkInfra,
      capitalCost,
      directTotal,
      arkTokenFee,
      arkTotal: adjustedArkTotal,
      savingsPct,
    };
  }, [monthlyTokensM, scenario]);


  const submitContact = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!contactName.trim() || !contactEmail.trim() || !contactMessage.trim()) {
      setContactStatus("error");
      setContactStatusText(t("home.contact.errorRequired"));
      return;
    }
    setContactLoading(true);
    setContactStatus("idle");
    setContactStatusText("");
    try {
      const res = await fetch("/api/contact", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: contactName.trim(),
          email: contactEmail.trim(),
          message: contactMessage.trim(),
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data?.error || "Submit failed");
      setContactStatus("success");
      setContactStatusText(t("home.contact.success"));
      setContactName("");
      setContactEmail("");
      setContactMessage("");
    } catch {
      setContactStatus("error");
      setContactStatusText(t("home.contact.errorSubmit"));
    } finally {
      setContactLoading(false);
    }
  };


  const breakdownRows = [
    {
      key: "sdk",
      icon: Wrench,
      directValue: "$260/mo",
      arkValue: "$0",
      arkBadgeTone: "text-emerald-700 bg-emerald-50 border-emerald-200/70",
    },
    {
      key: "network",
      icon: Route,
      directValue: "$210/mo",
      arkValue: "$0",
      arkBadgeTone: "text-emerald-700 bg-emerald-50 border-emerald-200/70",
    },
    {
      key: "capital",
      icon: Wallet,
      directValue: "$50/mo",
      arkValue: "$0",
      arkBadgeTone: "text-emerald-700 bg-emerald-50 border-emerald-200/70",
    },
    {
      key: "failover",
      icon: ShieldAlert,
      directValue: t("home.calculator.breakdown.directRisk"),
      arkValue: t("home.calculator.breakdown.arkSla"),
      arkBadgeTone: "text-amber-700 bg-amber-50 border-amber-300/70",
    },
  ] as const;

  return (
    <main className="relative w-full pb-20 pt-0">
      <AuroraBackground>
      <div className="relative mx-auto w-full max-w-7xl px-4 sm:px-6 lg:px-8">
      <section className="px-8 pb-24 pt-44 md:px-12 md:pb-28 md:pt-56">
        <style jsx global>{`
          .shimmer-sweep { animation: shimmerSweep 2.2s linear infinite; }
          @keyframes shimmerSweep {
            0% { transform: translateX(-120%) skewX(-22deg); }
            100% { transform: translateX(380%) skewX(-22deg); }
          }
        `}</style>
        <h1 className="text-4xl font-semibold leading-[1.16] tracking-[-0.02em] text-stone-900 sm:text-5xl lg:text-6xl">
          {heroTypewriterVisible ? (
            <>
              <span className="block whitespace-nowrap leading-[1.22] min-h-[1.22em]">
                <TypewriterEffect
                  words={heroPrimaryWords}
                  charDelayMs={48}
                  startDelayMs={150}
                  pauseEveryChars={4}
                  pauseDurationMs={132}
                  spacePauseMs={108}
                  punctuationPauseMs={160}
                  cursorClassName="bg-stone-500/85"
                  hideCursorOnComplete
                />
              </span>
              <span className="block whitespace-nowrap leading-[1.22] min-h-[1.22em] mt-1.5">
                <TypewriterEffect
                  words={heroAccentWords}
                  textClassName="brand-amber-gradient-text"
                  renderMode="substring"
                  charDelayMs={52}
                  startDelayMs={heroAccentStartDelay}
                  pauseEveryChars={4}
                  pauseDurationMs={146}
                  spacePauseMs={112}
                  punctuationPauseMs={174}
                  cursorClassName="bg-[#B4693D]/90"
                  hideCursorOnComplete
                />
              </span>
            </>
          ) : (
            <>
              <span className="block text-stone-900">{t("home.hero.primary")}</span>
              <span className="block">
                <span className="brand-amber-gradient-text inline-block">{t("home.hero.accent")}</span>
              </span>
            </>
          )}
        </h1>
        <p className="mt-8 max-w-5xl text-sm leading-8 text-stone-700 md:text-base">
          {heroSubtitleLines.length > 0 ? (
            <span className="block space-y-1.5">
              {heroSubtitleLines.map((line, index) => (
                <span key={`hero-subtitle-line-${index}`} className="block whitespace-nowrap">
                  <TypewriterEffect
                    words={toTypewriterWords(line)}
                    charDelayMs={40}
                    startDelayMs={index === 0 ? 100 : 100 + heroSubtitleLine1Duration + 80}
                    pauseEveryChars={10}
                    pauseDurationMs={60}
                    spacePauseMs={40}
                    punctuationPauseMs={70}
                    cursorClassName="bg-stone-500/70"
                    hideCursorOnComplete
                  />
                </span>
              ))}
            </span>
          ) : (
            t("home.hero.subtitle")
          )}
        </p>
        <div className="mt-10 flex flex-wrap gap-4">
          <Link href="/llmapigateway/console/overview">
            <ShimmerButton>{t("home.hero.cta.primary")}</ShimmerButton>
          </Link>
          <Link href="/docs" className="rounded-xl border border-amber-100 bg-white/85 px-6 py-3 text-sm font-semibold text-stone-700">
            {t("home.hero.cta.secondary")}
          </Link>
        </div>

      </section>

      <div aria-hidden="true" className="section-amber-divider mx-8 md:mx-12" />
      <section className="relative mt-[30px] mb-8 px-8 md:mt-[44px] md:mb-10 md:px-12">
        <div className="mx-auto max-w-6xl">
          <LogoCloud logos={TRUSTED_LOGOS} />
        </div>
      </section>

      <div aria-hidden="true" className="section-amber-divider mx-8 md:mx-12" />
      <HowItWorks />

      <div aria-hidden="true" className="section-amber-divider mx-8 md:mx-12" />
      <section id="gateway-capabilities" className="mt-20">
        <h2 className="text-2xl font-semibold text-stone-900">{t("home.featureGrid.sectionTitle")}</h2>
        <p className="mt-2 text-sm text-stone-700">{t("home.featureGrid.sectionNote")}</p>
      <motion.section
        className="mt-6 grid gap-6 md:grid-cols-2 xl:grid-cols-3"
        variants={staggerContainer}
        initial="hidden"
        whileInView="show"
        viewport={{ once: true, amount: 0.2 }}
      >
        {FEATURE_CARDS.map((card) => (
          <motion.article
            key={card.key}
            variants={featureItemVariants}
            transition={{ duration: 0.45, ease: [0.22, 1, 0.36, 1] }}
            className="h-full flex flex-col justify-start items-start border border-stone-200/50 bg-white/40 backdrop-blur-sm rounded-2xl p-6 transition hover:-translate-y-0.5 hover:border-amber-300/70 hover:shadow-[0_0_0_1px_rgba(217,150,58,0.16),0_10px_24px_rgba(180,105,61,0.12)]"
          >
            <div className="mb-3 flex h-10 w-10 items-center justify-center rounded-xl border border-amber-200/70 bg-gradient-to-br from-[#F5E6C8] to-[#EFD4A3] text-amber-700">
              <FeatureIcon icon={card.icon} />
            </div>
            <h3 className="mb-2 text-xl font-semibold text-stone-900">{t(`home.featureGrid.${card.key}.title`)}</h3>
            <p className="text-sm leading-7 text-stone-700">{t(`home.featureGrid.${card.key}.desc`)}</p>
          </motion.article>
        ))}
      </motion.section>
      </section>

      <div aria-hidden="true" className="section-amber-divider mx-8 md:mx-12" />
      <RevealOnScroll>
      <section id="cost-calculator" className="mt-20">
        <h2 className="text-2xl font-semibold text-stone-900">{t("home.calculator.title")}</h2>
        <p className="mt-2 text-sm text-stone-700">{t("home.calculator.subtitle")}</p>

        <div className="mt-6 grid gap-6 lg:grid-cols-3">
          <div className="lg:col-span-2">
            <label className="text-sm font-medium text-stone-700">{t("home.calculator.tokens")}: {monthlyTokensM}M</label>
            <input
              type="range"
              min={1}
              max={100}
              value={monthlyTokensM}
              onChange={(e) => setMonthlyTokensM(Number(e.target.value))}
              className="mt-2 w-full"
              style={{ accentColor: "var(--brand-amber-via)" }}
            />
            <label className="mt-6 block text-sm font-medium text-stone-700">{t("home.calculator.scenario")}</label>
            <select value={scenario} onChange={(e) => setScenario(e.target.value as Scenario)} className="mt-2 w-full rounded-xl border border-stone-300/70 bg-white/80 px-3 py-2 text-sm">
              <option value="hybrid">{t("home.calculator.option.hybrid")}</option>
              <option value="single">{t("home.calculator.option.single")}</option>
              <option value="cn">{t("home.calculator.option.cn")}</option>
            </select>

            <div className="mt-6 rounded-xl border border-stone-200/70 bg-white/70 p-4">
              <p className="text-sm font-semibold text-stone-900">{t("home.calculator.breakdown.title")}</p>
              <div className="mt-3 space-y-3">
                {breakdownRows.map((row) => {
                  const RowIcon = row.icon;
                  return (
                    <div key={row.key} className="rounded-lg border border-stone-200/80 bg-white/90 px-3 py-3">
                      <div className="grid gap-3 md:grid-cols-[1fr_auto] md:items-center">
                        <div className="min-w-0">
                          <div className="flex items-center gap-2">
                            <span className="inline-flex h-7 w-7 items-center justify-center rounded-md border border-stone-200 bg-stone-50 text-stone-600">
                              <RowIcon className="h-4 w-4" />
                            </span>
                            <p className="text-xs font-semibold text-stone-900">{t(`home.calculator.breakdown.rows.${row.key}.title`)}</p>
                            <TooltipItem text={t(`home.calculator.tooltip.${row.key}`)} />
                          </div>
                          <p className="mt-1 text-xs leading-5 text-stone-600">{t(`home.calculator.breakdown.rows.${row.key}.desc`)}</p>
                        </div>
                        <div className="flex flex-wrap items-center gap-2 md:justify-end">
                          <span className="rounded-full border border-rose-200/70 bg-rose-50 px-2.5 py-1 text-[11px] font-semibold text-rose-700">
                            {t("home.calculator.breakdown.badge.direct")} {row.directValue}
                          </span>
                          <span className={`rounded-full border px-2.5 py-1 text-[11px] font-semibold ${row.arkBadgeTone}`}>
                            {t("home.calculator.breakdown.badge.ark")} {row.arkValue}
                          </span>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>

          <div className="space-y-4">
            <div className="rounded-xl border border-stone-300/70 bg-white/80 p-4">
              <p className="text-xs uppercase tracking-[0.12em] text-stone-500">{t("home.calculator.direct")}</p>
              <p className="mt-1 text-2xl font-semibold text-stone-900">${calc.directTotal.toFixed(0)}</p>
            </div>
            <div className="rounded-xl border border-amber-300/70 bg-gradient-to-br from-amber-50 to-orange-50 p-4 shadow-[0_0_0_1px_rgba(217,150,58,0.18)]">
              <p className="text-xs uppercase tracking-[0.12em] text-stone-600">{t("home.calculator.ark")}</p>
              <p className="mt-1 text-2xl font-semibold text-stone-900">${calc.arkTotal.toFixed(0)}</p>
              <p className="mt-2 text-sm font-semibold text-amber-700">{t("home.calculator.save")} {(calc.savingsPct * 100).toFixed(0)}%</p>
              <Link href="/llmapigateway/console/overview" className="brand-amber-gradient-bg mt-3 inline-flex rounded-lg px-4 py-2 text-xs font-semibold text-white">
                {t("home.calculator.cta")}
              </Link>
            </div>
          </div>
        </div>
        <button
          type="button"
          onClick={() => setShowFormulaPanel((v) => !v)}
          className="mt-5 inline-flex items-center gap-2 text-xs font-medium text-stone-600 hover:text-stone-800"
        >
          {t("home.calculator.formula.toggle")}
          <ChevronDown className={`h-3.5 w-3.5 transition-transform ${showFormulaPanel ? "rotate-180" : ""}`} />
        </button>
        {showFormulaPanel && (
          <div className="mt-3 rounded-xl border border-stone-200/80 bg-white/75 p-4 text-xs leading-6 text-stone-700">
            <p className="font-semibold text-stone-900">{t("home.calculator.formula.title")}</p>
            <p className="mt-2">{t("home.calculator.formula.direct")}</p>
            <p className="mt-1">{t("home.calculator.formula.ark")}</p>
          </div>
        )}
        <p className="mt-5 text-xs leading-6 text-stone-500">{t("home.calculator.note")}</p>
      </section>
      </RevealOnScroll>

      <div aria-hidden="true" className="section-amber-divider mx-8 md:mx-12" />
      <RevealOnScroll delay={0.05}>
      <section id="global-nodes" className="mt-20">
        <h2 className="text-2xl font-semibold text-stone-900">{t("home.map.title")}</h2>
        <div className="mt-6 grid gap-6 lg:grid-cols-[7fr_5fr]">
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {[
              { key: "usw", flag: "🇺🇸", latency: "8ms" },
              { key: "use", flag: "🇺🇸", latency: "11ms" },
              { key: "euc", flag: "🇪🇺", latency: "14ms" },
              { key: "aps", flag: "🇸🇬", latency: "9ms" },
              { key: "ape", flag: "🇯🇵", latency: "12ms" },
            ].map((region) => (
              <article key={region.key} className="rounded-xl border border-neutral-200/80 bg-neutral-50/80 p-3.5">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="whitespace-nowrap text-sm font-semibold text-stone-900">
                      <span className="mr-1">{region.flag}</span>
                      {t(`home.map.region.${region.key}.short`)}
                    </p>
                  </div>
                  <span className="shrink-0 rounded-full border border-amber-200 bg-amber-50 px-2 py-0.5 text-[11px] font-semibold text-amber-700">
                    {region.latency}
                  </span>
                </div>
                <p className="mt-1 text-xs text-neutral-500">{t(`home.map.region.${region.key}.full`)}</p>
                <p className="mt-2 inline-flex items-center gap-1.5 text-[11px] text-stone-600">
                  {t("home.map.region.cluster")}
                  <span>·</span>
                  <span className="relative inline-flex h-2 w-2 rounded-full bg-emerald-500">
                    <span className="absolute inset-0 animate-ping rounded-full bg-emerald-400/60" />
                  </span>
                  {t("home.map.region.active")}
                </p>
              </article>
            ))}
          </div>
          <div className="space-y-4">
            <div className="rounded-xl border border-stone-200/70 bg-white/70 p-4">
              <p className="text-xs uppercase tracking-[0.12em] text-stone-500">{t("home.map.metric1.label")}</p>
              <p className="mt-1 text-xl font-semibold text-stone-900">{t("home.map.metric1.value")}</p>
            </div>
            <div className="rounded-xl border border-stone-200/70 bg-white/70 p-4">
              <p className="text-xs uppercase tracking-[0.12em] text-stone-500">{t("home.map.metric2.label")}</p>
              <p className="mt-1 text-xl font-semibold text-stone-900">{t("home.map.metric2.value")}</p>
            </div>
            <div className="rounded-xl border border-stone-200/70 bg-white/70 p-4">
              <p className="text-xs uppercase tracking-[0.12em] text-stone-500">{t("home.map.metric3.label")}</p>
              <p className="mt-1 text-xl font-semibold text-stone-900">{t("home.map.metric3.value")}</p>
            </div>
          </div>
        </div>
        <p className="mt-4 text-xs text-neutral-400">{t("home.map.footnote")}</p>
      </section>
      </RevealOnScroll>

      <div aria-hidden="true" className="section-amber-divider mx-8 md:mx-12" />
      <RevealOnScroll delay={0.1}>
      <section className="mt-20">
        <h2 className="text-2xl font-semibold text-stone-900">{t("home.contact.title")}</h2>
        <p className="mt-2 text-sm text-stone-700">{t("home.contact.subtitle")}</p>
        <div className="mt-6 grid gap-6 lg:grid-cols-[40%_60%]">
          <article className="rounded-xl border border-stone-200/70 bg-white/80 p-5 shadow-[0_8px_20px_rgba(15,23,42,0.08)]">
            <h3 className="text-sm font-semibold text-stone-900">{t("home.contact.directChannels")}</h3>
            <div className="mt-4 space-y-6">
              <div className="rounded-lg border border-stone-200 bg-white px-4 py-4">
                <p className="inline-flex items-center gap-2.5 text-xs font-semibold text-stone-900">
                  <span className="inline-flex items-center justify-center rounded-lg bg-stone-100/80 p-2.5 text-stone-600">
                    <BriefcaseBusiness className="h-4 w-4" />
                  </span>
                  {t("home.contact.channelSalesLabel")}
                </p>
                <p className="mt-2 pl-11 text-sm font-medium text-stone-700">
                  <a href="mailto:sales@arkagentic.com" className="transition-colors hover:text-amber-600">sales@arkagentic.com</a>
                </p>
              </div>

              <div className="rounded-lg border border-stone-200 bg-white px-4 py-4">
                <p className="inline-flex items-center gap-2.5 text-xs font-semibold text-stone-900">
                  <span className="inline-flex items-center justify-center rounded-lg bg-stone-100/80 p-2.5 text-stone-600">
                    <Mail className="h-4 w-4" />
                  </span>
                  {t("home.contact.channelSupportLabel")}
                </p>
                <p className="mt-2 pl-11 text-sm font-medium text-stone-700">
                  <a href="mailto:support@arkagentic.com" className="transition-colors hover:text-amber-600">support@arkagentic.com</a>
                </p>
              </div>

              <div className="rounded-lg border border-amber-200/80 bg-amber-50/35 px-4 py-4">
                <p className="inline-flex items-center gap-2.5 text-xs font-semibold text-stone-900">
                  <span className="inline-flex items-center justify-center rounded-lg bg-stone-100/80 p-2.5 text-amber-700">
                    <Clock3 className="h-4 w-4" />
                  </span>
                  {t("home.contact.channelSlaLabel")}
                </p>
                <p className="mt-2 pl-11 text-xs font-medium leading-6 text-stone-700">{t("home.contact.channelSlaNote")}</p>
              </div>
            </div>
          </article>

          <article className="rounded-xl border border-stone-200/70 bg-white/80 p-4 shadow-[0_6px_18px_rgba(15,23,42,0.06)]">
            <form className="grid gap-4 md:grid-cols-2" onSubmit={submitContact}>
              <div>
                <label className="mb-1.5 block text-xs font-medium text-stone-600">{t("home.contact.name")}</label>
                <input
                  required
                  value={contactName}
                  onChange={(e) => setContactName(e.target.value)}
                  className="w-full rounded-xl border border-stone-300/70 bg-white px-3 py-2.5 text-sm text-stone-800"
                  placeholder={t("home.contact.namePlaceholder")}
                />
              </div>
              <div>
                <label className="mb-1.5 block text-xs font-medium text-stone-600">{t("home.contact.email")}</label>
                <input
                  required
                  type="email"
                  value={contactEmail}
                  onChange={(e) => setContactEmail(e.target.value)}
                  className="w-full rounded-xl border border-stone-300/70 bg-white px-3 py-2.5 text-sm text-stone-800"
                  placeholder={t("home.contact.emailPlaceholder")}
                />
              </div>
              <div className="md:col-span-2">
                <label className="mb-1.5 block text-xs font-medium text-stone-600">{t("home.contact.message")}</label>
                <textarea
                  required
                  rows={6}
                  value={contactMessage}
                  onChange={(e) => setContactMessage(e.target.value)}
                  className="min-h-[160px] w-full rounded-xl border border-stone-300/70 bg-white px-3 py-2.5 text-sm text-stone-800"
                  placeholder={t("home.contact.messagePlaceholder")}
                />
              </div>
              <div className="md:col-span-2 flex flex-col-reverse items-start gap-3 md:flex-row md:items-center md:justify-end">
                {contactStatus !== "idle" && (
                  <p className={`text-xs ${contactStatus === "success" ? "text-emerald-700" : "text-rose-700"}`}>{contactStatusText}</p>
                )}
                <button
                  type="submit"
                  disabled={contactLoading}
                  className="brand-amber-gradient-bg rounded-xl px-5 py-2.5 text-sm font-semibold text-white disabled:opacity-70"
                >
                  {contactLoading ? t("home.contact.sending") : t("home.contact.submit")}
                </button>
              </div>
            </form>
          </article>
        </div>
      </section>
      </RevealOnScroll>
      </div>
      </AuroraBackground>
    </main>
  );
}


export default function HomePage() {
  return (
    <MarketingShell>
      <HomePageContent />
    </MarketingShell>
  );
}
