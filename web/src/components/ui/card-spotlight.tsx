"use client";

import { cn } from "@/lib/utils";
import { motion, useMotionTemplate, useMotionValue } from "framer-motion";
import React from "react";

export type CardSpotlightProps = React.HTMLAttributes<HTMLDivElement> & {
  radius?: number;
  color?: string;
};

export function CardSpotlight({
  children,
  className,
  radius = 260,
  color = "245, 158, 11",
  onMouseMove,
  onMouseLeave,
  ...props
}: CardSpotlightProps) {
  const mouseX = useMotionValue(0);
  const mouseY = useMotionValue(0);
  const [active, setActive] = React.useState(false);

  function handleMouseMove(event: React.MouseEvent<HTMLDivElement>) {
    const rect = event.currentTarget.getBoundingClientRect();
    mouseX.set(event.clientX - rect.left);
    mouseY.set(event.clientY - rect.top);
    setActive(true);
    onMouseMove?.(event);
  }

  function handleMouseLeave(event: React.MouseEvent<HTMLDivElement>) {
    setActive(false);
    onMouseLeave?.(event);
  }

  return (
    <div
      className={cn(
        "group relative overflow-hidden rounded-2xl border border-stone-200 bg-white/90 p-6 shadow-sm",
        className,
      )}
      onMouseMove={handleMouseMove}
      onMouseLeave={handleMouseLeave}
      {...props}
    >
      <motion.div
        aria-hidden
        className="pointer-events-none absolute -inset-px rounded-2xl"
        style={{
          opacity: active ? 1 : 0,
          background: useMotionTemplate`radial-gradient(${radius}px circle at ${mouseX}px ${mouseY}px, rgba(${color},0.22), transparent 70%)`,
        }}
      />
      <div className="pointer-events-none absolute inset-0 rounded-2xl border border-white/60" />
      <div className="relative z-10">{children}</div>
    </div>
  );
}
