"use client";

import PathDrawingPortfolioHero from "@/components/ui/path-drawing-portfolio-hero";
import { LogoCarousel } from "@/components/ui/logo-carousel";
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
    <main className="w-full bg-[#0c0a0f] bg-[radial-gradient(ellipse_80%_60%_at_50%_-10%,rgba(240,147,251,0.14),transparent),radial-gradient(ellipse_60%_50%_at_80%_110%,rgba(245,87,108,0.1),transparent)]">
      <PathDrawingPortfolioHero
        className="w-full"
        brand="ARKAGENT"
        tagline="Next-Gen Agentic Platform & Financial AI Workspace"
        eyebrow="ARKAGENTIC PLATFORM"
      />

      <div className="z-20 w-full max-w-4xl pb-12 mx-auto">
        <LogoCarousel columnCount={3} logos={sampleLogos} />
      </div>
    </main>
  );
}
