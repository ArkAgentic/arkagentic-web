"use client";

import { cn } from "@/lib/cn";
import { motion, useReducedMotion } from "framer-motion";
import { useEffect, useMemo, useRef, useState } from "react";

export type TypewriterWord = {
  text: string;
  className?: string;
};

type TypewriterTimingOptions = {
  charDelayMs?: number;
  pauseEveryChars?: number;
  pauseDurationMs?: number;
  spacePauseMs?: number;
  punctuationPauseMs?: number;
};

type TypewriterEffectProps = TypewriterTimingOptions & {
  words: TypewriterWord[];
  className?: string;
  textClassName?: string;
  cursorClassName?: string;
  startDelayMs?: number;
  showCursor?: boolean;
  hideCursorOnComplete?: boolean;
  renderMode?: "char" | "substring";
};

type CharToken = {
  char: string;
  className?: string;
};

const PUNCTUATION_REGEX = /[，。！？；：,.!?;:]/;

function splitGraphemes(text: string): string[] {
  if (typeof Intl !== "undefined" && "Segmenter" in Intl) {
    const segmenter = new Intl.Segmenter(undefined, { granularity: "grapheme" });
    return Array.from(segmenter.segment(text), (x) => x.segment);
  }
  return Array.from(text);
}

function wordsToChars(words: TypewriterWord[]): CharToken[] {
  const chars: CharToken[] = [];
  words.forEach((word, index) => {
    splitGraphemes(word.text).forEach((char) => {
      chars.push({ char, className: word.className });
    });
    if (index < words.length - 1) chars.push({ char: " " });
  });
  return chars;
}

function buildRevealTimeline(chars: CharToken[], options: Required<TypewriterTimingOptions>) {
  const timeline: number[] = [];
  let elapsed = 0;
  let typedCharsSincePause = 0;

  chars.forEach((token) => {
    elapsed += options.charDelayMs;

    if (token.char === " ") {
      elapsed += options.spacePauseMs;
      typedCharsSincePause = 0;
    } else {
      typedCharsSincePause += 1;
      if (PUNCTUATION_REGEX.test(token.char)) elapsed += options.punctuationPauseMs;
      if (options.pauseEveryChars > 0 && typedCharsSincePause >= options.pauseEveryChars) {
        elapsed += options.pauseDurationMs;
        typedCharsSincePause = 0;
      }
    }

    timeline.push(elapsed);
  });

  return timeline;
}

export function estimateTypewriterDurationMs(words: TypewriterWord[], opts?: TypewriterTimingOptions): number {
  const chars = wordsToChars(words);
  if (chars.length === 0) return 0;
  const options: Required<TypewriterTimingOptions> = {
    charDelayMs: opts?.charDelayMs ?? 72,
    pauseEveryChars: opts?.pauseEveryChars ?? 4,
    pauseDurationMs: opts?.pauseDurationMs ?? 220,
    spacePauseMs: opts?.spacePauseMs ?? 180,
    punctuationPauseMs: opts?.punctuationPauseMs ?? 240,
  };
  const timeline = buildRevealTimeline(chars, options);
  return timeline[timeline.length - 1] ?? 0;
}

export function TypewriterEffect({
  words,
  className,
  textClassName,
  cursorClassName,
  charDelayMs = 72,
  startDelayMs = 180,
  pauseEveryChars = 4,
  pauseDurationMs = 220,
  spacePauseMs = 180,
  punctuationPauseMs = 240,
  showCursor = true,
  hideCursorOnComplete = true,
  renderMode = "char",
}: TypewriterEffectProps) {
  const reduceMotion = useReducedMotion();
  const chars = useMemo(() => wordsToChars(words), [words]);
  const [visibleCount, setVisibleCount] = useState(reduceMotion ? chars.length : 0);

  const frameRef = useRef<number | null>(null);
  const timeoutRef = useRef<number | null>(null);

  const revealTimeline = useMemo(
    () =>
      buildRevealTimeline(chars, {
        charDelayMs,
        pauseEveryChars,
        pauseDurationMs,
        spacePauseMs,
        punctuationPauseMs,
      }),
    [chars, charDelayMs, pauseEveryChars, pauseDurationMs, spacePauseMs, punctuationPauseMs],
  );

  useEffect(() => {
    if (timeoutRef.current) window.clearTimeout(timeoutRef.current);
    if (frameRef.current) window.cancelAnimationFrame(frameRef.current);

    if (reduceMotion) {
      setVisibleCount(chars.length);
      return;
    }

    setVisibleCount(0);

    timeoutRef.current = window.setTimeout(() => {
      const start = performance.now();
      const tick = (now: number) => {
        const elapsed = now - start;
        let count = 0;
        while (count < revealTimeline.length && elapsed >= revealTimeline[count]) count += 1;
        setVisibleCount(count);
        if (count < revealTimeline.length) frameRef.current = window.requestAnimationFrame(tick);
      };
      frameRef.current = window.requestAnimationFrame(tick);
    }, startDelayMs);

    return () => {
      if (timeoutRef.current) window.clearTimeout(timeoutRef.current);
      if (frameRef.current) window.cancelAnimationFrame(frameRef.current);
    };
  }, [chars.length, revealTimeline, startDelayMs, reduceMotion]);

  const fullText = useMemo(() => chars.map((c) => c.char).join(""), [chars]);
  const visibleText = useMemo(() => chars.slice(0, visibleCount).map((c) => c.char).join(""), [chars, visibleCount]);
  const cursorVisible = showCursor && visibleCount > 0 && !(hideCursorOnComplete && visibleCount >= chars.length);

  return (
    <span className={cn("relative inline-block align-top whitespace-pre", className)}>
      <span aria-hidden className="invisible whitespace-pre">
        {fullText}
        {cursorVisible ? <span className="ml-0.5 inline-block h-[0.95em] w-[2px]" /> : null}
      </span>

      <span aria-hidden className={cn("absolute inset-0 whitespace-pre", textClassName)}>
        {renderMode === "substring"
          ? (
            <motion.span
              key={`substring-${visibleCount}`}
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.32, ease: [0.22, 1, 0.36, 1] }}
              className={cn("inline", textClassName)}
            >
              {visibleText}
            </motion.span>
          )
          : chars.slice(0, visibleCount).map((token, index) => (
              <motion.span
                key={`${index}-${token.char}`}
                initial={{ opacity: 0, y: 6 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.32, ease: [0.22, 1, 0.36, 1] }}
                className={cn("inline", token.className)}
              >
                {token.char}
              </motion.span>
            ))}

        {cursorVisible ? (
          <motion.span
            className={cn(
              "ml-0.5 inline-block h-[0.95em] w-[2px] translate-y-[0.06em] rounded-full bg-[#B4693D]/85",
              cursorClassName,
            )}
            animate={{ opacity: [0.35, 1] }}
            transition={{ duration: 1.2, repeat: Number.POSITIVE_INFINITY, repeatType: "reverse", ease: "linear" }}
          />
        ) : null}
      </span>
    </span>
  );
}
