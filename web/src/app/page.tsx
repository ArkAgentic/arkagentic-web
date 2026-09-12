"use client";

import { AuroraBackground } from "@/components/ui/aurora-background";
import { LogoCarousel } from "@/components/ui/logo-carousel";
import { motion } from "framer-motion";
import React from "react";

const sampleLogos = [
  {
    id: 1,
    name: "OpenAI",
    img: (props: React.SVGProps<SVGSVGElement>) => (
      <svg {...props} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <circle cx="12" cy="12" r="9" />
        <path d="M7 9c2-2 8-2 10 0" />
        <path d="M7 15c2 2 8 2 10 0" />
        <path d="M12 3v18" />
      </svg>
    ),
  },
  {
    id: 2,
    name: "Anthropic",
    img: (props: React.SVGProps<SVGSVGElement>) => (
      <svg {...props} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <path d="M4 20L12 4l8 16" />
        <path d="M8.5 13h7" />
      </svg>
    ),
  },
  {
    id: 3,
    name: "Stripe",
    img: (props: React.SVGProps<SVGSVGElement>) => (
      <svg {...props} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <rect x="3" y="5" width="18" height="14" rx="3" />
        <path d="M7 10h10" />
        <path d="M7 14h6" />
      </svg>
    ),
  },
  {
    id: 4,
    name: "Azure",
    img: (props: React.SVGProps<SVGSVGElement>) => (
      <svg {...props} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <path d="M4 19L10.5 5h3L20 19H4Z" />
        <path d="M10 14h5" />
      </svg>
    ),
  },
  {
    id: 5,
    name: "PostgreSQL",
    img: (props: React.SVGProps<SVGSVGElement>) => (
      <svg {...props} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <path d="M12 4c4 0 7 2.5 7 6v5c0 2.5-3 5-7 5s-7-2.5-7-5v-5c0-3.5 3-6 7-6Z" />
        <path d="M9 12h6" />
        <path d="M12 9v6" />
      </svg>
    ),
  },
];

export default function HomePage() {
  return (
    <AuroraBackground>
      <motion.div
        initial={{ opacity: 0.0, y: 40 }}
        whileInView={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.3, duration: 0.8, ease: "easeInOut" }}
        className="relative z-10 flex flex-col items-center justify-center gap-8 px-4 text-center"
      >
        <h1 className="bg-gradient-to-r from-cyan-200 via-indigo-200 to-emerald-200 bg-clip-text text-4xl font-semibold text-transparent md:text-6xl">
          Next-Gen Agentic Platform
        </h1>

        <p className="max-w-2xl text-sm text-slate-300 md:text-base">Unified Infrastructure &amp; Financial AI Workspace</p>

        <div className="w-full pt-6">
          <LogoCarousel columnCount={4} logos={sampleLogos} />
        </div>
      </motion.div>
    </AuroraBackground>
  );
}
