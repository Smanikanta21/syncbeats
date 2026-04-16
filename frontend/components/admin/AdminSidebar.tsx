"use client";

import { Database, Users, Radio, Smartphone, X } from "lucide-react";
import { TableKey } from "@/types/admin";
import { cn } from "@/lib/utils";

const ITEMS: Array<{ key: TableKey; label: string; icon: React.ComponentType<{ className?: string }> }> = [
  { key: "users", label: "Users", icon: Users },
  { key: "rooms", label: "Rooms", icon: Radio },
  { key: "devices", label: "Devices", icon: Smartphone },
  { key: "room_participants", label: "Room Participants", icon: Database },
];

interface AdminSidebarProps {
  active: TableKey;
  onSelect: (next: TableKey) => void;
  open: boolean;
  onClose: () => void;
}

export function AdminSidebar({ active, onSelect, open, onClose }: AdminSidebarProps) {
  return (
    <>
      <aside className="sticky top-30 hidden h-fit w-72 shrink-0 md:block">
        <SidebarContent active={active} onSelect={onSelect} onClose={onClose} />
      </aside>

      {open ? (
        <div className="fixed inset-0 z-40 md:hidden">
          <button className="absolute inset-0 bg-black/60" onClick={onClose} aria-label="Close navigation" />
          <aside className="glass-panel absolute left-3 top-3 h-[calc(100vh-1.5rem)] w-[86%] max-w-[320px] rounded-[2rem] p-4">
            <SidebarContent active={active} onSelect={onSelect} onClose={onClose} mobile />
          </aside>
        </div>
      ) : null}
    </>
  );
}

function SidebarContent({
  active,
  onSelect,
  onClose,
  mobile = false,
}: {
  active: TableKey;
  onSelect: (next: TableKey) => void;
  onClose: () => void;
  mobile?: boolean;
}) {
  return (
    <div className="glass-panel flex h-full flex-col rounded-[2rem] p-4">
      <div className="mb-4 flex items-center justify-between border-b border-white/10 px-2 pb-3">
        <div>
          <p className="text-[10px] uppercase tracking-[0.18em] text-zinc-500">Data Domains</p>
          <p className="text-sm font-semibold text-zinc-200">Admin Tables</p>
        </div>
        {mobile ? (
          <button onClick={onClose} className="rounded-md border border-white/10 p-1 text-zinc-300" aria-label="Close">
            <X className="h-4 w-4" />
          </button>
        ) : null}
      </div>

      <nav className="space-y-1">
        {ITEMS.map((item) => {
          const Icon = item.icon;
          return (
            <button
              key={item.key}
              onClick={() => {
                onSelect(item.key);
                onClose();
              }}
              className={cn(
                "flex w-full items-center gap-3 rounded-2xl px-3 py-2.5 text-left text-sm transition",
                active === item.key
                  ? "border text-white"
                  : "border border-transparent text-zinc-300 hover:border-white/10 hover:bg-white/5",
              )}
              style={
                active === item.key
                  ? {
                      borderColor: "color-mix(in srgb, var(--accent-secondary) 40%, transparent)",
                      background: "color-mix(in srgb, var(--accent-secondary) 18%, transparent)",
                    }
                  : undefined
              }
            >
              <Icon className="h-4 w-4" />
              {item.label}
            </button>
          );
        })}
      </nav>

      <div className="mt-6 rounded-2xl border border-white/10 bg-white/5 p-3 text-xs text-zinc-400">
        Designed to match the Syncbeats shell: clean controls, high contrast data, minimal distractions.
      </div>
    </div>
  );
}
