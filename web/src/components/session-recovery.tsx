"use client";

import { useEffect, useRef } from "react";
import { usePathname, useRouter } from "next/navigation";
import { clearSessionUser } from "@/lib/auth-session";
import { clearAuthToken } from "@/lib/auth-provider";

const MIN_REVALIDATE_INTERVAL_MS = 60_000;

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

  useEffect(() => {
    if (typeof window === "undefined") return;

    const revalidateSession = async (reason: string) => {
      const now = Date.now();
      if (inFlightRef.current) return;
      if (now - lastRunRef.current < MIN_REVALIDATE_INTERVAL_MS) return;

      inFlightRef.current = true;
      lastRunRef.current = now;
      healInteractionLocks();

      try {
        const resp = await fetch("/api/auth/session", {
          method: "GET",
          credentials: "include",
          cache: "no-store",
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
        inFlightRef.current = false;
      }
    };

    const onVisibilityChange = () => {
      if (document.visibilityState === "visible") {
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

    document.addEventListener("visibilitychange", onVisibilityChange);
    window.addEventListener("focus", onFocus);
    window.addEventListener("online", onOnline);
    window.addEventListener("pageshow", onPageShow);

    return () => {
      document.removeEventListener("visibilitychange", onVisibilityChange);
      window.removeEventListener("focus", onFocus);
      window.removeEventListener("online", onOnline);
      window.removeEventListener("pageshow", onPageShow);
    };
  }, [pathname, router]);

  return null;
}
