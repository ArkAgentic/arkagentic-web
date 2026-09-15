"use client";

import { cn } from "@/lib/cn";
import { useMemo, type ReactNode } from "react";

type InfiniteSliderProps = {
  children: ReactNode;
  className?: string;
  gap?: number;
  reverse?: boolean;
  speed?: number;
};

export function InfiniteSlider({
  children,
  className,
  gap = 28,
  reverse = false,
  speed = 60,
}: InfiniteSliderProps) {
  const childrenArray = useMemo(() => Array.from((Array.isArray(children) ? children : [children]) as ReactNode[]), [children]);
  const animationDuration = `${Math.max(1, speed)}s`;

  return (
    <div className={cn("relative w-full overflow-hidden", className)}>
      <div
        className="infinite-slider-track flex w-max min-w-full"
        style={{
          gap: `${gap}px`,
          animationDuration,
          animationDirection: reverse ? "reverse" : "normal",
        }}
      >
        {childrenArray.map((child, index) => (
          <div key={`slide-a-${index}`} className="shrink-0">
            {child}
          </div>
        ))}
        {childrenArray.map((child, index) => (
          <div key={`slide-b-${index}`} className="shrink-0" aria-hidden>
            {child}
          </div>
        ))}
      </div>

      <style jsx global>{`
        .infinite-slider-track {
          animation-name: infinite-slider-marquee;
          animation-timing-function: linear;
          animation-iteration-count: infinite;
          will-change: transform;
        }

        @keyframes infinite-slider-marquee {
          from {
            transform: translateX(0);
          }
          to {
            transform: translateX(-50%);
          }
        }
      `}</style>
    </div>
  );
}
