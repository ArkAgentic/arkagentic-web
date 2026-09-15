"use client";

import { cn } from "@/lib/cn";
import React, { ReactNode } from "react";

interface AuroraBackgroundProps extends React.HTMLProps<HTMLDivElement> {
  children: ReactNode;
  showRadialGradient?: boolean;
}

export const AuroraBackground = ({
  className,
  children,
  showRadialGradient = true,
  ...props
}: AuroraBackgroundProps) => {
  return (
    <div
      className={cn(
        // 保持你当前页面布局容器，仅替换 Aurora 内核实现 | Keep current page layout wrapper, replace Aurora core implementation only
        "relative w-full overflow-hidden bg-white text-slate-950",
        className,
      )}
      {...props}
    >
      <div
        className="pointer-events-none absolute inset-0 overflow-hidden"
        style={
          {
            // 仅替换为品牌主色；其余结构严格对齐 Aceternity 原版 | Keep Aceternity structure; only swap to brand colors
            "--aurora":
              "repeating-linear-gradient(100deg, var(--brand-amber-to) 10%, #c6764a 15%, var(--brand-amber-from) 20%, #e3c486 25%, var(--brand-amber-via) 30%)",
            "--dark-gradient":
              "repeating-linear-gradient(100deg, #000 0%, #000 7%, transparent 10%, transparent 12%, #000 16%)",
            "--white-gradient":
              "repeating-linear-gradient(100deg, #fff 0%, #fff 7%, transparent 10%, transparent 12%, #fff 16%)",
          } as React.CSSProperties
        }
      >
        <div
          className={cn(
            // Aceternity 原版核心层（含 invert + difference）| Aceternity original core layer (with invert + difference)
            `after:animate-aurora absolute -inset-[10px] [background-image:var(--white-gradient),var(--aurora)] [background-size:300%,_200%] [background-position:50%_50%,50%_50%] opacity-50 blur-[10px] invert filter will-change-transform after:absolute after:inset-0 after:[background-image:var(--white-gradient),var(--aurora)] after:[background-size:200%,_100%] after:[background-attachment:fixed] after:mix-blend-difference after:content-[""] dark:[background-image:var(--dark-gradient),var(--aurora)] dark:invert-0 after:dark:[background-image:var(--dark-gradient),var(--aurora)]`,
            showRadialGradient &&
              `[mask-image:radial-gradient(ellipse_at_100%_0%,black_10%,transparent_70%)]`,
          )}
        />
      </div>

      <div className="relative z-10">{children}</div>
    </div>
  );
};
