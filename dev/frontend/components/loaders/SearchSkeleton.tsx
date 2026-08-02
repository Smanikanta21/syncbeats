"use client";

import React from "react";
import { cn } from "../../lib/utils";

interface SearchSkeletonProps {
  count?: number;
}

export function SearchSkeleton({ count = 4 }: SearchSkeletonProps) {
  return (
    <div className="space-y-2 w-full animate-pulse">
      {Array.from({ length: count }).map((_, idx) => (
        <div
          key={idx}
          className={cn(
            "flex items-center gap-3 p-2.5 rounded-xl bg-foreground/[0.04] border border-foreground/[0.06]"
          )}
        >
          {/* Thumbnail Skeleton */}
          <div className="w-14 h-14 rounded-lg bg-foreground/10 shrink-0" />

          {/* Title & Artist Skeletons */}
          <div className="flex-1 space-y-2 min-w-0 pr-2">
            <div className="h-4 bg-foreground/15 rounded-md w-3/4" />
            <div className="h-3 bg-foreground/10 rounded-md w-1/2" />
          </div>

          {/* Button Skeleton */}
          <div className="w-9 h-9 rounded-full bg-foreground/10 shrink-0" />
        </div>
      ))}
    </div>
  );
}
