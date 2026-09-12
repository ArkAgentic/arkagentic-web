"use client";

import { cn } from "@/lib/utils";
import { motion, useReducedMotion } from "framer-motion";
import React from "react";

type PathDrawingPortfolioHeroProps = {
  eyebrow?: string;
  brand: string;
  tagline?: string;
  fromColor?: string;
  toColor?: string;
  className?: string;
};

export default function PathDrawingPortfolioHero({
  eyebrow = "PORTFOLIO",
  brand,
  tagline,
  fromColor = "#60A5FA",
  toColor = "#C084FC",
  className,
}: PathDrawingPortfolioHeroProps) {
  const reducedMotion = useReducedMotion();

  return (
    <div className={cn("flex w-full max-w-5xl flex-col items-center gap-5 text-center", className)}>
      <p className="text-xs font-medium uppercase tracking-[0.2em] text-slate-300">{eyebrow}</p>

      <div className="relative w-full">
        <svg viewBox="0 0 1200 240" className="h-auto w-full" role="img" aria-label={brand}>
          <defs>
            <linearGradient id="path-drawing-gradient" x1="0%" y1="0%" x2="100%" y2="0%">
              <stop offset="0%" stopColor={fromColor} />
              <stop offset="100%" stopColor={toColor} />
            </linearGradient>
          </defs>

          <text
            x="50%"
            y="52%"
            textAnchor="middle"
            dominantBaseline="middle"
            className="fill-transparent stroke-white/15"
            style={{ fontSize: "96px", fontWeight: 700, letterSpacing: "0.02em" }}
          >
            {brand}
          </text>

          <motion.text
            x="50%"
            y="52%"
            textAnchor="middle"
            dominantBaseline="middle"
            className="fill-transparent"
            style={{
              fontSize: "96px",
              fontWeight: 700,
              letterSpacing: "0.02em",
              stroke: "url(#path-drawing-gradient)",
              strokeWidth: 2,
              filter: "drop-shadow(0 0 18px rgba(96, 165, 250, 0.3))",
            }}
            initial={{ pathLength: reducedMotion ? 1 : 0, opacity: 0.7 }}
            animate={{ pathLength: 1, opacity: 1 }}
            transition={
              reducedMotion
                ? { duration: 0 }
                : { duration: 2.2, ease: "easeInOut", type: "spring", stiffness: 80, damping: 20 }
            }
          >
            {brand}
          </motion.text>
        </svg>
      </div>

      {tagline ? <p className="max-w-2xl text-sm text-slate-300 md:text-base">{tagline}</p> : null}
    </div>
  );
}
