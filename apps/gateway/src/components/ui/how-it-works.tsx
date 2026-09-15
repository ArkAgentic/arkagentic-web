"use client";

import { cn } from "@/lib/cn";
import { SlidersHorizontal, Rocket, UserPlus } from "lucide-react";
import type React from "react";
import { useI18n } from "@/lib/i18n";
import { motion } from "framer-motion";

interface HowItWorksProps extends React.HTMLAttributes<HTMLElement> {}

interface StepCardProps {
  icon: React.ReactNode;
  title: string;
  description: string;
  iconMotionClassName?: string;
}

const StepCard: React.FC<StepCardProps> = ({ icon, title, description, iconMotionClassName }) => (
  <div
    className={cn(
      "relative rounded-2xl border border-stone-200/50 bg-white/40 p-6 text-stone-900 backdrop-blur-sm transition-all duration-300 ease-in-out",
      "hover:-translate-y-0.5 hover:border-amber-300/70 hover:shadow-[0_0_0_1px_rgba(217,150,58,0.16),0_10px_24px_rgba(180,105,61,0.12)]",
    )}
  >
    <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-xl border border-amber-200/70 bg-gradient-to-br from-[#F5E6C8] to-[#EFD4A3] text-amber-700">
      <motion.div className={iconMotionClassName}>{icon}</motion.div>
    </div>
    <h3 className="mb-2 text-xl font-semibold text-stone-900">{title}</h3>
    <p className="text-sm leading-7 text-stone-700">{description}</p>
  </div>
);

export const HowItWorks: React.FC<HowItWorksProps> = ({ className, ...props }) => {
  const { t } = useI18n();

  const stepsData = [
    {
      key: "signup",
      icon: <UserPlus className="h-6 w-6" />,
      iconMotionClassName: "howitworks-icon-pulse",
    },
    {
      key: "console",
      icon: <SlidersHorizontal className="h-6 w-6" />,
      iconMotionClassName: "howitworks-icon-pulse",
    },
    {
      key: "use",
      icon: <Rocket className="h-6 w-6" />,
      iconMotionClassName: "howitworks-icon-rocket",
    },
  ] as const;

  return (
    <section id="how-it-works" className={cn("w-full bg-transparent py-16 md:py-20", className)} {...props}>
      <div className="w-full">
        <style jsx global>{`
          .howitworks-icon-float {
            animation: howitworksFloat 2.6s ease-in-out infinite;
          }

          .howitworks-icon-pulse {
            animation: howitworksPulse 2.2s ease-in-out infinite;
          }

          .howitworks-icon-rocket {
            animation: howitworksRocket 2.6s ease-in-out infinite;
            transform-origin: center;
          }

          @keyframes howitworksFloat {
            0%,
            100% {
              transform: translateY(0px);
            }
            50% {
              transform: translateY(-3px);
            }
          }

          @keyframes howitworksPulse {
            0%,
            100% {
              transform: scale(1);
            }
            50% {
              transform: scale(1.08);
            }
          }

          @keyframes howitworksRocket {
            0% {
              transform: translate3d(0px, 0px, 0px);
            }
            42% {
              transform: translate3d(3px, -3px, 0px);
            }
            100% {
              transform: translate3d(0px, 0px, 0px);
            }
          }
        `}</style>

        <div className="mb-8">
          <h2 className="text-2xl font-semibold text-stone-900">{t("home.howItWorks.title")}</h2>
          <p className="mt-2 text-sm text-stone-700">{t("home.howItWorks.subtitle")}</p>
        </div>

        <div className="relative mb-8 w-full">
          <div
            aria-hidden="true"
            className="absolute left-[16.6667%] top-1/2 h-0.5 w-[66.6667%] -translate-y-1/2 bg-stone-300/70"
          ></div>
          <div className="relative grid grid-cols-3">
            {stepsData.map((_, index) => (
              <div
                key={index}
                className="flex h-9 w-9 items-center justify-center justify-self-center rounded-full border border-amber-200/70 bg-white/80 text-sm font-semibold text-amber-700 backdrop-blur-sm"
              >
                {index + 1}
              </div>
            ))}
          </div>
        </div>

        <div className="grid grid-cols-1 gap-8 md:grid-cols-3">
          {stepsData.map((step) => (
            <StepCard
              key={step.key}
              icon={step.icon}
              iconMotionClassName={step.iconMotionClassName}
              title={t(`home.howItWorks.${step.key}.title`)}
              description={t(`home.howItWorks.${step.key}.desc`)}
            />
          ))}
        </div>
      </div>
    </section>
  );
};
