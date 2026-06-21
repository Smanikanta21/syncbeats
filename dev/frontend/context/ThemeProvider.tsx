"use client";

import * as React from "react";
import { ThemeProvider as NextThemesProvider } from "next-themes";

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
      {children}
    </NextThemesProvider>
  );
}
