"use client";

import { cn } from "@/lib/utils";
import { motion } from "framer-motion";

type TextGenerateEffectProps = {
  words: string;
  className?: string;
};

export function TextGenerateEffect({ words, className }: TextGenerateEffectProps) {
  const tokens = words.split(" ");

  return (
    <h1 className={cn("mx-auto mt-4 max-w-4xl text-4xl font-semibold leading-tight md:text-6xl", className)}>
      {tokens.map((word, index) => (
        <motion.span
          key={`${word}-${index}`}
          initial={{ opacity: 0, y: 10, filter: "blur(8px)" }}
          animate={{ opacity: 1, y: 0, filter: "blur(0px)" }}
          transition={{ delay: index * 0.06, duration: 0.38, ease: "easeOut" }}
          className="inline-block mr-3"
        >
          {word}
        </motion.span>
      ))}
    </h1>
  );
}
