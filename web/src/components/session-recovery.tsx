"use client";

import { useEffect, useRef } from "react";
import { usePathname, useRouter } from "next/navigation";
import { clearSessionUser } from "@/lib/auth-session";
import { clearAuthToken } from "@/lib/auth-provider";

const MIN_REVALIDATE_INTERVAL_MS = 60_000;
const SESSION_CHECK_TIMEOUT_MS = 8_000;
const HARD_RELOAD_IDLE_MS = 20 * 60_000;
const HARD_RELOAD_COOLDOWN_MS = 5 * 60_000;

function healInteractionLocks() {
  if (typeof document === "undefined") return;

  if (document.documentElement.style.pointerEvents === "none") {
    document.documentElement.style.pointerEvents = "";
  }
  if (document.body.style.pointerEvents === "none") {
    document.body.style.pointerEvents = "";
  }
}

export function SessionRecovery() {
  const pathname = usePathname();
  const router = useRouter();
  const inFlightRef = useRef(false);
  const lastRunRef = useRef(0);
  const lastHardReloadRef = useRef(0);
  const hiddenAtRef = useRef<number | null>(null);
  const interactionTriggeredRef = useRef(false);

  useEffect(() => {
    if (typeof window === "undefined") return;

    const hardReloadIfLikelyStale = (reason: string) => {
      const now = Date.now();
      if (now - lastHardReloadRef.current < HARD_RELOAD_COOLDOWN_MS) return;
      if (!interactionTriggeredRef.current) return;
      interactionTriggeredRef.current = false;
      lastHardReloadRef.current = now;
      window.location.reload();
    };

    const revalidateSession = async (reason: string) => {
      const now = Date.now();
      if (inFlightRef.current) return;
      if (now - lastRunRef.current < MIN_REVALIDATE_INTERVAL_MS) return;

      inFlightRef.current = true;
      lastRunRef.current = now;
      healInteractionLocks();

      const controller = new AbortController();
      const timeout = window.setTimeout(() => controller.abort(), SESSION_CHECK_TIMEOUT_MS);

      try {
        const resp = await fetch("/api/auth/session", {
          method: "GET",
          credentials: "include",
          cache: "no-store",
          signal: controller.signal,
          headers: {
            "x-ark-session-revalidate": reason,
          },
        });

        if (!resp.ok) {
          clearSessionUser();
          clearAuthToken();
          if ((pathname || "").startsWith("/console")) {
            const redirect = `${window.location.pathname}${window.location.search}`;
            router.replace(`/login?redirect=${encodeURIComponent(redirect || "/console/overview")}`);
          }
          return;
        }

        const data = (await resp.json()) as { user?: { email?: string } };
        if (!data?.user?.email) {
          clearSessionUser();
          clearAuthToken();
          if ((pathname || "").startsWith("/console")) {
            const redirect = `${window.location.pathname}${window.location.search}`;
            router.replace(`/login?redirect=${encodeURIComponent(redirect || "/console/overview")}`);
          }
          return;
        }

        router.refresh();
      } catch {
        // Keep current UI state on transient network errors.
      } finally {
        window.clearTimeout(timeout);
        inFlightRef.current = false;
      }
    };

    const onVisibilityChange = () => {
      if (document.visibilityState === "hidden") {
        hiddenAtRef.current = Date.now();
        return;
      }
      if (document.visibilityState === "visible") {
        const hiddenFor = hiddenAtRef.current ? Date.now() - hiddenAtRef.current : 0;
        if (hiddenFor >= HARD_RELOAD_IDLE_MS) {
          hardReloadIfLikelyStale("visibilitychange");
          return;
        }
        void revalidateSession("visibilitychange");
      }
    };

    const onFocus = () => {
      void revalidateSession("focus");
    };

    const onOnline = () => {
      void revalidateSession("online");
    };

    const onPageShow = (event: PageTransitionEvent) => {
      if (event.persisted) {
        void revalidateSession("pageshow-persisted");
      }
    };

    const onPointerDown = () => {
      interactionTriggeredRef.current = true;
    };

    const onClickCapture = () => {
      interactionTriggeredRef.current = true;
      const hiddenFor = hiddenAtRef.current ? Date.now() - hiddenAtRef.current : 0;
      if (hiddenFor >= HARD_RELOAD_IDLE_MS) {
        hardReloadIfLikelyStale("click-capture");
      }
    };

    document.addEventListener("visibilitychange", onVisibilityChange);
    window.addEventListener("focus", onFocus);
    window.addEventListener("online", onOnline);
    window.addEventListener("pageshow", onPageShow);
    document.addEventListener("pointerdown", onPointerDown, true);
    document.addEventListener("click", onClickCapture, true);

    return () => {
      document.removeEventListener("visibilitychange", onVisibilityChange);
      window.removeEventListener("focus", onFocus);
      window.removeEventListener("online", onOnline);
      window.removeEventListener("pageshow", onPageShow);
      document.removeEventListener("pointerdown", onPointerDown, true);
      document.removeEventListener("click", onClickCapture, true);
    };
  }, [pathname, router]);

  return null;
}
