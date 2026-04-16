"use client";

import { Search, RefreshCw, LogOut, Menu } from "lucide-react";

interface AdminNavbarProps {
  search: string;
  onSearch: (value: string) => void;
  onRefresh: () => void;
  onLogout: () => void;
  refreshing?: boolean;
  onOpenDrawer: () => void;
}

export function AdminNavbar({
  search,
  onSearch,
  onRefresh,
  onLogout,
  refreshing,
  onOpenDrawer,
}: AdminNavbarProps) {
  return (
    <header className="fixed left-3 right-3 top-4 z-30 flex justify-center sm:left-8 sm:right-8 sm:top-6">
      <div className="w-full max-w-6xl rounded-full border border-[#cbd5e1]/30 bg-black/80 px-4 py-3 shadow-[0_0_35px_rgba(200,203,212,0.18)] backdrop-blur-3xl sm:px-6">
      <div className="flex items-center gap-3">
        <button
          onClick={onOpenDrawer}
          className="rounded-lg border border-white/10 bg-white/5 p-2 text-zinc-200 md:hidden"
          aria-label="Open navigation"
        >
          <Menu className="h-4 w-4" />
        </button>

        <div className="min-w-0">
          <h1 className="truncate text-base font-black tracking-tight text-zinc-100 sm:text-lg">
            SYNC<span className="text-zinc-500">BEATS</span> ADMIN
          </h1>
          <p className="hidden text-[10px] uppercase tracking-[0.18em] text-zinc-500 sm:block">Internal Control Center</p>
        </div>

        <div className="ml-auto flex w-full max-w-xl items-center gap-2">
          <div className="relative hidden flex-1 md:block">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-500" />
            <input
              value={search}
              onChange={(e) => onSearch(e.target.value)}
              placeholder="Search all visible columns..."
              className="w-full rounded-full border border-white/10 bg-zinc-900/50 py-2 pl-10 pr-3 text-sm text-zinc-100 outline-none focus:border-white/30"
            />
          </div>

          <button
            onClick={onRefresh}
            className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-3 py-2 text-xs text-zinc-200 hover:bg-white/10"
          >
            <RefreshCw className={`h-4 w-4 ${refreshing ? "animate-spin" : ""}`} />
            <span className="hidden sm:inline">Refresh</span>
          </button>

          <button
            onClick={onLogout}
            className="inline-flex items-center gap-2 rounded-full px-3 py-2 text-xs hover:opacity-90"
            style={{
              border: "1px solid color-mix(in srgb, var(--accent-tertiary) 40%, transparent)",
              background: "color-mix(in srgb, var(--accent-tertiary) 14%, transparent)",
              color: "color-mix(in srgb, var(--accent-tertiary) 72%, white)",
            }}
          >
            <LogOut className="h-4 w-4" />
            <span className="hidden sm:inline">Logout</span>
          </button>
        </div>
      </div>

      <div className="mt-3 md:hidden">
        <div className="relative">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-500" />
          <input
            value={search}
            onChange={(e) => onSearch(e.target.value)}
            placeholder="Search records"
            className="w-full rounded-full border border-white/10 bg-zinc-900/50 py-2 pl-10 pr-3 text-sm text-zinc-100 outline-none focus:border-white/30"
          />
        </div>
      </div>
      </div>
    </header>
  );
}
