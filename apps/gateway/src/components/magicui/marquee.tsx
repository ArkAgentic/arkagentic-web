"use client";

import { motion } from "framer-motion";
import { cn } from "@/lib/cn";
import type { ReactNode } from "react";

type MarqueeProps = {
  children: ReactNode;
  className?: string;
  speed?: number;
};

export function Marquee({ children, className, speed = 28 }: MarqueeProps) {
  return (
    <div className={cn("relative w-full overflow-hidden", className)}>
      <motion.div
        className="flex w-max items-center gap-4"
        animate={{ x: ["0%", "-50%"] }}
        transition={{ repeat: Infinity, ease: "linear", duration: speed }}
      >
        <div className="flex items-center gap-4 pr-4">{children}</div>
        <div className="flex items-center gap-4 pr-4" aria-hidden>
          {children}
        </div>
      </motion.div>
    </div>
  );
}
