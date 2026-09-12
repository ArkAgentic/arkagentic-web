import { cn } from "@/lib/cn";
import type { HTMLAttributes } from "react";

export function BentoGrid({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn(
        "grid w-full auto-rows-[minmax(170px,1fr)] grid-cols-1 gap-4 md:auto-rows-[minmax(190px,1fr)] md:grid-cols-6",
        className,
      )}
      {...props}
    />
  );
}

export function BentoGridItem({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn(
        "group relative overflow-hidden rounded-2xl bg-background/60 p-6 backdrop-blur-sm border border-border/50",
        "transition duration-300 hover:-translate-y-0.5 hover:border-amber-300/70 hover:shadow-[0_0_0_1px_rgba(217,150,58,0.16),0_14px_26px_rgba(180,105,61,0.12)]",
        className,
      )}
      {...props}
    />
  );
}
