"use client";

import * as React from "react";
import { ThemeProvider as NextThemesProvider, useTheme } from "next-themes";

if (typeof window !== "undefined" && process.env.NODE_ENV === "development") {
  const orig = console.error;
  console.error = (...args: unknown[]) => {
    if (typeof args[0] === "string") {
      if (args[0].includes("Encountered a script tag while rendering React component")) return;
      if (args[0].includes("[GSI_LOGGER]: FedCM get() rejects with AbortError")) return;
    }
    orig.apply(console, args);
  };
}

import { runCelestialTransition } from "../components/ThemeToggle";

function ThemeSync() {
  const { setTheme } = useTheme();
  React.useEffect(() => {
    // 1. Listen to storage events (fallback)
    const handleStorage = (e: StorageEvent) => {
      if (e.key === "theme" && e.newValue) {
        document.documentElement.setAttribute("data-theme", e.newValue);
        setTimeout(() => setTheme(e.newValue!), 0);
      }
    };
    window.addEventListener("storage", handleStorage);

    // 2. Listen to BroadcastChannel for instant multi-tab sync with animation
    const channel = new BroadcastChannel("theme-sync");
    channel.onmessage = (e) => {
      if (e.data && e.data.theme) {
        const nextTheme = e.data.theme;
        const x = e.data.x ?? window.innerWidth / 2;
        const y = e.data.y ?? window.innerHeight / 2;

        runCelestialTransition(
          x,
          y,
          nextTheme === "dark",
          () => {
            document.documentElement.setAttribute("data-theme", nextTheme);
            setTimeout(() => setTheme(nextTheme), 0);
          },
          () => {}
        );
      }
    };

    return () => {
      window.removeEventListener("storage", handleStorage);
      channel.close();
    };
  }, [setTheme]);
  return null;
}

export function ThemeProvider({ 
  children, 
  ...props 
}: React.ComponentProps<typeof NextThemesProvider>) {
  return (
    <NextThemesProvider 
      attribute="data-theme" 
      defaultTheme="dark" 
      enableSystem
      {...props}
    >
      <ThemeSync />
      {children}
    </NextThemesProvider>
  );
}
