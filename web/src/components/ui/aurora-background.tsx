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
    <div className={cn("relative flex min-h-screen w-full items-center justify-center overflow-hidden bg-slate-950 text-slate-100", className)}>
      <div className="pointer-events-none absolute inset-0">
        <div className="aurora-layer aurora-layer-1" />
        <div className="aurora-layer aurora-layer-2" />
        <div className="aurora-layer aurora-layer-3" />
      </div>

      {showRadialGradient ? (
        <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_center,transparent_0%,rgba(2,6,23,0.75)_55%,rgba(2,6,23,0.98)_100%)]" />
      ) : null}

      <div className="relative z-10">{children}</div>

      <style jsx global>{`
        @keyframes aurora-slide {
          0% {
            transform: translate3d(-12%, -6%, 0) rotate(0deg) scale(1);
          }
          50% {
            transform: translate3d(10%, 6%, 0) rotate(8deg) scale(1.08);
          }
          100% {
            transform: translate3d(-12%, -6%, 0) rotate(0deg) scale(1);
          }
        }

        .aurora-layer {
          position: absolute;
          width: 70vw;
          height: 70vw;
          border-radius: 9999px;
          filter: blur(90px);
          opacity: 0.45;
          mix-blend-mode: screen;
          animation: aurora-slide 14s ease-in-out infinite;
        }

        .aurora-layer-1 {
          top: -20%;
          left: -10%;
          background: radial-gradient(circle, rgba(56, 189, 248, 0.58) 0%, rgba(56, 189, 248, 0) 68%);
        }

        .aurora-layer-2 {
          top: -18%;
          right: -12%;
          background: radial-gradient(circle, rgba(34, 197, 94, 0.5) 0%, rgba(34, 197, 94, 0) 70%);
          animation-delay: -4s;
        }

        .aurora-layer-3 {
          bottom: -24%;
          left: 16%;
          background: radial-gradient(circle, rgba(168, 85, 247, 0.52) 0%, rgba(168, 85, 247, 0) 70%);
          animation-delay: -8s;
        }
      `}</style>
    </div>
  );
}
