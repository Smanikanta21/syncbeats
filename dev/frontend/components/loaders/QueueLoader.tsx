"use client";

import React from "react";
import { cn } from "../../lib/utils";

interface QueueLoaderProps {
  count?: number;
}

export function QueueLoader({ count = 5 }: QueueLoaderProps) {
  return (
    <div className="space-y-2 w-full animate-pulse">
      {Array.from({ length: count }).map((_, idx) => (
        <div
          key={idx}
          className={cn(
            "flex items-center gap-3 px-3 py-2.5 rounded-2xl bg-foreground/[0.03] border border-foreground/[0.05]"
          )}
        >
          {/* Track Number */}
          <div className="w-4 h-4 bg-foreground/10 rounded shrink-0" />

          {/* Thumbnail */}
          <div className="w-10 h-10 rounded-lg bg-foreground/15 shrink-0" />

          {/* Details */}
          <div className="flex-1 space-y-1.5 min-w-0">
            <div className="h-3.5 bg-foreground/15 rounded w-2/3" />
            <div className="h-2.5 bg-foreground/10 rounded w-1/3" />
          </div>

          {/* Action icon skeleton */}
          <div className="w-7 h-7 rounded-full bg-foreground/10 shrink-0" />
        </div>
      ))}
    </div>
  );
}
