"use client";

import { cn } from "@/lib/utils";
import React from "react";

type AuroraBackgroundProps = React.HTMLAttributes<HTMLDivElement> & {
  children: React.ReactNode;
  showRadialGradient?: boolean;
};

export function AuroraBackground({
  children,
  className,
  showRadialGradient = true,
  ...props
}: AuroraBackgroundProps) {
  return (
    <div className={cn("relative w-full overflow-hidden bg-white", className)} {...props}>
      <div className="pointer-events-none absolute inset-0">
        <div className="ark-aurora-layer absolute -inset-[8px]" />
        <div className="ark-aurora-layer-fine absolute -inset-[9px] [animation-duration:208s] [animation-delay:20s]" />
        <div className="ark-aurora-asymmetry absolute inset-0" />
      </div>

      {showRadialGradient ? (
        <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_top,rgba(255,255,255,0)_0%,rgba(255,255,255,0.03)_36%,rgba(255,255,255,0.12)_100%)]" />
      ) : null}

      <div className="relative z-10">{children}</div>
    </div>
  );
}
