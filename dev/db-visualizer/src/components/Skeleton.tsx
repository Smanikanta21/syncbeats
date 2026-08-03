"use client";

import React from "react";
import { cn } from "@/lib/utils";

export function Skeleton({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn("animate-pulse rounded-xl bg-zinc-900/90 border border-zinc-800/80 relative overflow-hidden", className)}
      {...props}
    >
      <div className="absolute inset-0 -translate-x-full bg-gradient-to-r from-transparent via-white/10 to-transparent animate-[shimmer_1.5s_infinite]" />
    </div>
  );
}

export function MetricCardSkeleton() {
  return (
    <div className="p-6 bg-zinc-900/80 border border-zinc-800/80 rounded-3xl shadow-xl backdrop-blur-xl space-y-3 relative overflow-hidden animate-pulse">
      <div className="flex items-center justify-between">
        <Skeleton className="h-3 w-24 rounded-md" />
        <Skeleton className="h-8 w-8 rounded-xl" />
      </div>
      <Skeleton className="h-8 w-20 rounded-lg" />
      <Skeleton className="h-3 w-32 rounded-md" />
    </div>
  );
}

export function MapSkeleton() {
  return (
    <div className="relative w-full h-[450px] bg-zinc-900/90 rounded-2xl border border-zinc-800/80 overflow-hidden shadow-inner flex flex-col items-center justify-center space-y-4 animate-pulse">
      <Skeleton className="w-16 h-16 rounded-full" />
      <Skeleton className="h-4 w-48 rounded-lg" />
      <Skeleton className="h-3 w-64 rounded-md" />
    </div>
  );
}

export function TableRowSkeleton() {
  return (
    <tr className="animate-pulse border-b border-zinc-800/40">
      <td className="py-4 px-4"><Skeleton className="h-4 w-32 mb-1" /><Skeleton className="h-3 w-40" /></td>
      <td className="py-4 px-4"><Skeleton className="h-6 w-20 rounded-lg" /></td>
      <td className="py-4 px-4"><Skeleton className="h-6 w-16 rounded-lg" /></td>
      <td className="py-4 px-4"><Skeleton className="h-4 w-44 mb-1" /><Skeleton className="h-3 w-28" /></td>
      <td className="py-4 px-4"><Skeleton className="h-3 w-32" /></td>
    </tr>
  );
}

export function LogEntrySkeleton() {
  return (
    <div className="p-4 bg-zinc-900/40 border border-zinc-800/60 rounded-2xl animate-pulse space-y-2">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Skeleton className="h-5 w-16 rounded-md" />
          <Skeleton className="h-5 w-24 rounded-md" />
          <Skeleton className="h-5 w-32 rounded-md" />
        </div>
        <Skeleton className="h-4 w-20 rounded-md" />
      </div>
      <Skeleton className="h-4 w-3/4 rounded-md" />
    </div>
  );
}
