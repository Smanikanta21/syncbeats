"use client";

import { useEffect, useRef } from "react";
import { useRouter } from "next/navigation";

/**
 * Older home-screen installs may keep the URL used when the app was added.
 * Keep the public landing page in browsers, but take every standalone launch
 * (including stale `/intro` installs) straight to the user's listening room.
 */
export function PwaRootRedirect() {
  const router = useRouter();
  const receivedOAuthReturn = useRef(false);

  useEffect(() => {
    // AuthProvider consumes the fragment asynchronously. Remember this launch
    // across effect replays so the PWA cannot interrupt the app handoff.
    const fragment = new URLSearchParams(window.location.hash.slice(1));
    if (fragment.has("state") || fragment.has("id_token") || fragment.has("error")) {
      receivedOAuthReturn.current = true;
    }
    if (receivedOAuthReturn.current) return;
    const isStandalone =
      window.matchMedia("(display-mode: standalone)").matches ||
      (window.navigator as Navigator & { standalone?: boolean }).standalone === true;

    if (isStandalone) router.replace("/room/default");
  }, [router]);

  return null;
}
