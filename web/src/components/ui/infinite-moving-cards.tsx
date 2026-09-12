"use client";

import { cn } from "@/lib/utils";
import { motion } from "framer-motion";
import type { LucideIcon } from "lucide-react";

type EcosystemCardItem = {
  name: string;
  icon: LucideIcon;
};

type InfiniteMovingCardsProps = {
  items: EcosystemCardItem[];
  className?: string;
  speedSeconds?: number;
};

export function InfiniteMovingCards({
  items,
  className,
  speedSeconds = 26,
}: InfiniteMovingCardsProps) {
  const track = [...items, ...items];

  return (
    <div className={cn("relative overflow-hidden rounded-2xl border border-zinc-800 bg-zinc-950 p-4", className)}>
      <div className="pointer-events-none absolute inset-0 rounded-2xl border border-amber-400/20" />
      <div className="pointer-events-none absolute inset-0 rounded-2xl bg-[radial-gradient(circle_at_top,rgba(251,191,36,0.15),transparent_45%)]" />

      <motion.div
        className="flex w-max gap-4"
        animate={{ x: ["0%", "-50%"] }}
        transition={{ duration: speedSeconds, ease: "linear", repeat: Number.POSITIVE_INFINITY }}
      >
        {track.map((item, index) => {
          const Icon = item.icon;
          return (
            <div
              key={`${item.name}-${index}`}
              className="flex min-w-[170px] items-center gap-3 rounded-xl border border-zinc-700 bg-zinc-900/95 px-4 py-3 shadow-[0_0_0_1px_rgba(251,191,36,0.12)]"
            >
              <Icon className="h-4 w-4 text-amber-300" />
              <span className="text-sm font-medium text-zinc-100">{item.name}</span>
            </div>
          );
        })}
      </motion.div>

      <div className="pointer-events-none absolute inset-y-0 left-0 w-20 bg-gradient-to-r from-zinc-950 to-transparent" />
      <div className="pointer-events-none absolute inset-y-0 right-0 w-20 bg-gradient-to-l from-zinc-950 to-transparent" />
    </div>
  );
}
