"use client";

import { cn } from "@/lib/utils";
import { motion } from "framer-motion";
import React from "react";

export interface Logo {
  id: number;
  name: string;
  img: (props: React.SVGProps<SVGSVGElement>) => React.ReactNode;
}

type LogoCarouselProps = {
  logos: Logo[];
  columnCount?: number;
  className?: string;
};

export function LogoCarousel({ logos, columnCount = 4, className }: LogoCarouselProps) {
  const items = [...logos, ...logos];
  const cardWidth = Math.max(140, Math.floor(860 / Math.max(1, columnCount)));

  return (
    <div className={cn("relative w-full max-w-5xl overflow-hidden rounded-2xl border border-white/15 bg-slate-900/45 p-4 backdrop-blur-sm", className)}>
      <div className="pointer-events-none absolute inset-0 rounded-2xl bg-[radial-gradient(circle_at_top,rgba(56,189,248,0.18),transparent_45%)]" />
      <motion.div
        className="relative z-10 flex w-max gap-3"
        animate={{ x: ["0%", "-50%"] }}
        transition={{ duration: 22, ease: "linear", repeat: Number.POSITIVE_INFINITY }}
      >
        {items.map((logo, index) => (
          <div
            key={`${logo.id}-${index}`}
            className="flex shrink-0 items-center gap-3 rounded-xl border border-white/15 bg-slate-950/70 px-4 py-3 text-slate-100 shadow-[0_0_24px_rgba(56,189,248,0.12)]"
            style={{ width: `${cardWidth}px` }}
          >
            {logo.img({ className: "h-5 w-5 text-cyan-200" })}
            <span className="text-sm font-medium text-slate-200">{logo.name}</span>
          </div>
        ))}
      </motion.div>
      <div className="pointer-events-none absolute inset-y-0 left-0 w-16 bg-gradient-to-r from-slate-950 to-transparent" />
      <div className="pointer-events-none absolute inset-y-0 right-0 w-16 bg-gradient-to-l from-slate-950 to-transparent" />
    </div>
  );
}
