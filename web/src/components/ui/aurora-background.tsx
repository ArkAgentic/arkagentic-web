"use client";

import { cn } from "@/lib/utils";
import React from "react";

type AuroraBackgroundProps = {
  children: React.ReactNode;
  className?: string;
  showRadialGradient?: boolean;
};

export function AuroraBackground({ children, className, showRadialGradient = true }: AuroraBackgroundProps) {
  return (
    <div
      className={cn(
        "relative flex min-h-screen w-full items-center justify-center overflow-hidden bg-slate-950 text-slate-100",
        className,
      )}
    >
      <div className="pointer-events-none absolute inset-0">
        <div className="absolute -inset-[10px] animate-aurora opacity-45 [background-image:var(--white-gradient),var(--aurora-gradient)] [background-size:300%,_200%] [background-position:50%_50%,50%_50%] blur-[10px] filter invert dark:invert-0" />
        <div className="absolute -inset-[10px] animate-aurora opacity-40 mix-blend-overlay [background-image:var(--white-gradient),var(--aurora-gradient)] [background-size:200%,_100%] [background-position:50%_50%,50%_50%] blur-[14px] filter" />
      </div>

      {showRadialGradient ? (
        <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_top,transparent_10%,rgba(2,6,23,0.72)_60%,rgba(2,6,23,0.96)_100%)]" />
      ) : null}

      <div className="relative z-10">{children}</div>
    </div>
  );
}
