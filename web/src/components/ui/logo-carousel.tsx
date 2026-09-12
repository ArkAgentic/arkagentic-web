"use client";

import { AnimatePresence, motion } from "framer-motion";
import React, { useEffect, useMemo, useState } from "react";

export interface Logo {
  id: number;
  name: string;
  img: (props: React.SVGProps<SVGSVGElement>) => React.ReactNode;
}

type LogoCarouselProps = {
  logos: Logo[];
  columnCount?: number;
};

export function LogoCarousel({ logos, columnCount = 3 }: LogoCarouselProps) {
  const [tick, setTick] = useState(0);
  const slots = useMemo(() => {
    const count = Math.max(1, columnCount * 2);
    return Array.from({ length: count }, (_, index) => index);
  }, [columnCount]);

  useEffect(() => {
    if (logos.length <= 1) return;
    const timer = setInterval(() => {
      setTick((current) => current + 1);
    }, 1700);
    return () => clearInterval(timer);
  }, [logos.length]);

  if (logos.length === 0) return null;

  return (
    <div className="mx-auto w-full max-w-4xl">
      <div className="grid grid-cols-2 gap-x-10 gap-y-8 md:grid-cols-3 md:gap-x-16 md:gap-y-10">
        {slots.map((slotIndex) => {
          const logoIndex = (tick + slotIndex * 2) % logos.length;
          const logo = logos[logoIndex];

          return (
            <div key={slotIndex} className="relative flex min-h-[96px] items-center justify-center overflow-hidden md:min-h-[120px]">
              <AnimatePresence mode="wait">
                <motion.div
                  key={`${logo.id}-${tick}-${slotIndex}`}
                  initial={{ opacity: 0, y: 24, filter: "blur(10px)" }}
                  animate={{ opacity: 1, y: 0, filter: "blur(0px)" }}
                  exit={{ opacity: 0, y: -24, filter: "blur(10px)" }}
                  transition={{ type: "spring", stiffness: 180, damping: 22, mass: 0.8 }}
                  className="flex flex-col items-center justify-center gap-2"
                >
                  {logo.img({ className: "h-12 w-12 text-white/90 md:h-16 md:w-16" })}
                  <span className="text-xs font-medium tracking-wide text-slate-200/85 md:text-sm">{logo.name}</span>
                </motion.div>
              </AnimatePresence>
            </div>
          );
        })}
      </div>
    </div>
  );
}
