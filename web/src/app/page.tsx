"use client";

import React from "react";
import { PixelHero } from "@/components/ui/pixel-perfect-hero";

export default function HomePage() {
  return (
    <PixelHero
      word1="ARK"
      word2="Agentic."
      description="Unified Infrastructure & Financial AI Workspace. Interfaces driven by refined motion and pixel-precision."
      primaryCta="Explore Platform"
      primaryCtaMobile="Explore"
      secondaryCta="View GitHub"
      secondaryCtaMobile="GitHub"
      githubUrl="https://github.com"
      onPrimaryClick={() => {
        const el = document.getElementById("features");
        if (el) el.scrollIntoView({ behavior: "smooth" });
      }}
    />
  );
}
