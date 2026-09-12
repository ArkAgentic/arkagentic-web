"use client";

import { cn } from "@/lib/cn";
import type { ButtonHTMLAttributes } from "react";

type ShimmerButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  className?: string;
};

export function ShimmerButton({ className, children, ...props }: ShimmerButtonProps) {
  return (
    <button
      {...props}
      className={cn(
        "group relative overflow-hidden rounded-xl px-6 py-3 text-sm font-semibold text-white",
        "brand-amber-gradient-bg shadow-[0_10px_24px_rgba(123,75,28,0.28)]",
        className,
      )}
    >
      <span className="relative z-10">{children}</span>
      <span
        aria-hidden
        className="pointer-events-none absolute inset-y-0 -left-1/3 w-1/3 bg-gradient-to-r from-transparent via-white/45 to-transparent skew-x-[-22deg] opacity-0 transition-opacity duration-300 group-hover:opacity-100 shimmer-sweep"
      />
    </button>
  );
}
