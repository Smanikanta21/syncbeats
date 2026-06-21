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

function ThemeSync() {
  const { setTheme } = useTheme();
  React.useEffect(() => {
    // 1. Listen to storage events (fallback)
    const handleStorage = (e: StorageEvent) => {
      if (e.key === "theme" && e.newValue) {
        document.documentElement.setAttribute("data-theme", e.newValue);
        setTheme(e.newValue);
      }
    };
    window.addEventListener("storage", handleStorage);

    // 2. Listen to BroadcastChannel for instant sync
    const channel = new BroadcastChannel("theme-sync");
    channel.onmessage = (e) => {
      if (e.data && e.data.theme) {
        document.documentElement.setAttribute("data-theme", e.data.theme);
        setTheme(e.data.theme);
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
      defaultTheme="light" 
      enableSystem
      disableTransitionOnChange
      {...props}
    >
      <ThemeSync />
      {children}
    </NextThemesProvider>
  );
}
