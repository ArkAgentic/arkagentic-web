"use client";

import { AuroraBackground } from "@/components/ui/aurora-background";
import { motion } from "framer-motion";
import React from "react";

export default function HomePage() {
  return (
    <AuroraBackground>
      <motion.div
        initial={{ opacity: 0.0, y: 40 }}
        whileInView={{ opacity: 1, y: 0 }}
        transition={{
          delay: 0.3,
          duration: 0.8,
          ease: "easeInOut",
        }}
        className="relative flex flex-col items-center justify-center gap-4 px-4 text-center"
      >
        <p className="text-sm text-slate-300">Background lights are cool you know.</p>
        <h1 className="bg-gradient-to-r from-cyan-200 via-indigo-200 to-emerald-200 bg-clip-text text-4xl font-semibold text-transparent md:text-6xl">
          And this, is chemical burn.
        </h1>
        <button
          type="button"
          className="rounded-xl border border-slate-300/30 bg-white/10 px-5 py-2 text-sm font-medium text-slate-100 backdrop-blur hover:bg-white/20"
        >
          Debug now
        </button>
      </motion.div>
    </AuroraBackground>
  );
}
