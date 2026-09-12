"use client";

import { motion } from "framer-motion";
import { cn } from "@/lib/cn";
import { useEffect, useId, useMemo, useRef, useState } from "react";

type BorderBeamProps = {
  className?: string;
  size?: number;
  duration?: number;
  delay?: number;
  borderWidth?: number;
  colorFrom?: string;
  colorTo?: string;
};

type BeamGeometry = {
  width: number;
  height: number;
  radius: number;
  perimeter: number;
};

function getRoundedRectPath(width: number, height: number, radius: number) {
  return [
    `M ${radius} 0`,
    `H ${width - radius}`,
    `A ${radius} ${radius} 0 0 1 ${width} ${radius}`,
    `V ${height - radius}`,
    `A ${radius} ${radius} 0 0 1 ${width - radius} ${height}`,
    `H ${radius}`,
    `A ${radius} ${radius} 0 0 1 0 ${height - radius}`,
    `V ${radius}`,
    `A ${radius} ${radius} 0 0 1 ${radius} 0`,
  ].join(" ");
}

export function BorderBeam({
  className,
  size = 250,
  duration = 12,
  delay = 0,
  borderWidth = 1.5,
  colorFrom = "#F59E0B",
  colorTo = "#D97706",
}: BorderBeamProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [geometry, setGeometry] = useState<BeamGeometry | null>(null);
  const gradientId = useId().replace(/:/g, "");
  const blurId = `${gradientId}-blur`;

  useEffect(() => {
    const node = containerRef.current;
    if (!node) return;

    const update = () => {
      const rect = node.getBoundingClientRect();
      if (rect.width <= 0 || rect.height <= 0) return;

      const computed = getComputedStyle(node);
      const rawRadius = Number.parseFloat(computed.borderTopLeftRadius || "30");
      const radius = Number.isFinite(rawRadius)
        ? Math.max(0, Math.min(rawRadius, rect.width / 2, rect.height / 2))
        : 30;

      const perimeter = 2 * (rect.width + rect.height - 4 * radius) + 2 * Math.PI * radius;

      setGeometry({
        width: rect.width,
        height: rect.height,
        radius,
        perimeter,
      });
    };

    update();
    const ro = new ResizeObserver(update);
    ro.observe(node);

    return () => ro.disconnect();
  }, []);

  const path = useMemo(() => {
    if (!geometry) return "";
    return getRoundedRectPath(geometry.width, geometry.height, geometry.radius);
  }, [geometry]);

  if (!geometry || !path) {
    return <div ref={containerRef} className={cn("pointer-events-none absolute inset-0 rounded-[inherit]", className)} />;
  }

  const dashVisible = Math.min(size, geometry.perimeter * 0.9);
  const dashGap = Math.max(geometry.perimeter - dashVisible, 1);

  return (
    <div ref={containerRef} className={cn("pointer-events-none absolute inset-0 rounded-[inherit]", className)}>
      <svg
        className="pointer-events-none absolute inset-0 h-full w-full rounded-[inherit]"
        width={geometry.width}
        height={geometry.height}
        viewBox={`0 0 ${geometry.width} ${geometry.height}`}
        preserveAspectRatio="none"
        shapeRendering="geometricPrecision"
      >
        <defs>
          <linearGradient id={gradientId} x1="0%" y1="0%" x2="100%" y2="0%">
            <stop offset="0%" stopColor={colorFrom} stopOpacity="0" />
            <stop offset="20%" stopColor={colorFrom} stopOpacity="0.95" />
            <stop offset="60%" stopColor={colorTo} stopOpacity="0.95" />
            <stop offset="100%" stopColor={colorTo} stopOpacity="0" />
          </linearGradient>
          <filter id={blurId} x="-50%" y="-50%" width="200%" height="200%">
            <feGaussianBlur stdDeviation="1.6" />
          </filter>
        </defs>

        <motion.path
          d={path}
          fill="none"
          stroke={`url(#${gradientId})`}
          strokeWidth={borderWidth}
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeDasharray={`${dashVisible} ${dashGap}`}
          initial={{ strokeDashoffset: 0 }}
          animate={{ strokeDashoffset: -geometry.perimeter }}
          transition={{ duration, delay, repeat: Infinity, ease: "linear" }}
        />

        <motion.path
          d={path}
          fill="none"
          stroke={`url(#${gradientId})`}
          strokeWidth={borderWidth + 1}
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeDasharray={`${dashVisible} ${dashGap}`}
          filter={`url(#${blurId})`}
          opacity={0.85}
          initial={{ strokeDashoffset: 0 }}
          animate={{ strokeDashoffset: -geometry.perimeter }}
          transition={{ duration, delay, repeat: Infinity, ease: "linear" }}
        />
      </svg>
    </div>
  );
}
