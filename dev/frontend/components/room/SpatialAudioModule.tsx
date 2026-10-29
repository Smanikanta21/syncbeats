"use client";

import { AudioLines } from "lucide-react";
import { cn } from "../../lib/utils";

export interface SpatialBetaCardProps {
  compact?: boolean;
  className?: string;
  onExplore?: () => void;
}

/**
 * SpatialBetaCard
 *
 * Parked beta banner for Spatial Audio features while audio quality and device controls
 * are being refined. Extracted into its own component so it can be edited, styled,
 * or replaced independently.
 */
export function SpatialBetaCard({ compact = false, className, onExplore }: SpatialBetaCardProps) {
  return (
    <div
      onClick={onExplore}
      className={cn(
        "flex h-full min-h-36 items-center justify-between gap-5 rounded-3xl border border-foreground/10 bg-foreground/[0.035] p-5 sm:p-6 transition-colors",
        compact ? "" : "flex-col items-start",
        onExplore ? "cursor-pointer hover:bg-foreground/[0.06]" : "",
        className
      )}
    >
      <div className="min-w-0">
        <div className="mb-3 flex items-center gap-2 text-foreground/55">
          <AudioLines className="h-4 w-4" />
          <span className="text-[11px] font-semibold uppercase tracking-[0.14em]">Spatial audio</span>
          <span className="rounded-full border border-foreground/15 px-2 py-0.5 text-[10px] font-semibold text-foreground/65">
            Beta
          </span>
        </div>
        <h2 className="text-lg font-semibold tracking-tight text-foreground">Coming soon</h2>
        <p className="mt-1 max-w-xl text-sm leading-5 text-foreground/55">
          Spatial placement is paused while we refine its audio quality and device controls. Playback remains available in the room player.
        </p>
      </div>
      {compact && (
        <span className="hidden shrink-0 rounded-full bg-foreground/5 px-3 py-1.5 text-xs text-foreground/50 sm:inline-flex">
          Unavailable in this beta
        </span>
      )}
    </div>
  );
}

export interface SpatialAudioModuleProps {
  mode?: "preview" | "full";
  compact?: boolean;
  className?: string;
}

/**
 * SpatialAudioModule
 *
 * Pluggable component for Spatial Audio features in SyncBeats.
 * Can be plugged into RoomDashboard or any view simply by rendering:
 * `<SpatialAudioModule compact />` or passed into `<RoomDashboard spatialSlot={<SpatialAudioModule />} />`.
 *
 * Switch `mode="full"` when ready to connect the 3D canvas stage (`SpatialPanel`).
 */
export function SpatialAudioModule({
  mode = "preview",
  compact = false,
  className,
}: SpatialAudioModuleProps) {
  if (mode === "preview") {
    return <SpatialBetaCard compact={compact} className={className} />;
  }

  // When full spatial mode is ready to be plugged in:
  return <SpatialBetaCard compact={compact} className={className} />;
}

export default SpatialAudioModule;
