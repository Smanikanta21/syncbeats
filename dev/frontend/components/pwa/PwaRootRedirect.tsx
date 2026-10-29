"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

/**
 * Older home-screen installs may keep the URL used when the app was added.
 * Keep the public landing page in browsers, but take every standalone launch
 * (including stale `/intro` installs) straight to the user's listening room.
 */
export function PwaRootRedirect() {
  const router = useRouter();

  useEffect(() => {
    const isStandalone =
      window.matchMedia("(display-mode: standalone)").matches ||
      (window.navigator as Navigator & { standalone?: boolean }).standalone === true;

    if (isStandalone) router.replace("/room/default");
  }, [router]);

  return null;
}
