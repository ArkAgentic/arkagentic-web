import { InfiniteSlider } from "@/components/ui/infinite-slider";
import { cn } from "@/lib/cn";
import type { ComponentPropsWithoutRef } from "react";

type Logo = {
  src: string;
  alt: string;
  width?: number;
  height?: number;
};

type LogoCloudProps = ComponentPropsWithoutRef<"div"> & {
  logos: Logo[];
};

export function LogoCloud({ className, logos, ...props }: LogoCloudProps) {
  return (
    <div
      {...props}
      className={cn(
        "overflow-hidden py-4 [mask-image:linear-gradient(to_right,transparent,black,transparent)]",
        className,
      )}
    >
      <InfiniteSlider gap={76} reverse speed={80}>
        {logos.map((logo) => (
          <img
            alt={logo.alt}
            className="pointer-events-none h-12 select-none opacity-80 md:h-14"
            height={logo.height || undefined}
            key={`logo-${logo.alt}`}
            loading="lazy"
            src={logo.src}
            width={logo.width || undefined}
          />
        ))}
      </InfiniteSlider>
    </div>
  );
}
