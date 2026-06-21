import React from "react";
import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { Music2, Trash2, GripVertical } from "lucide-react";
import { TrackQueueItem } from "../lib/types";

interface SortableTrackItemProps {
  item: TrackQueueItem;
  onRemove: (e: React.MouseEvent, id: string) => void;
  onPlay?: (e: React.MouseEvent, id: string) => void;
  addedByName?: string;
}

export function SortableTrackItem({ item, onRemove, onPlay, addedByName }: SortableTrackItemProps) {
  const {
    attributes,
    listeners,
    setNodeRef,
    setActivatorNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: item.id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    // Add z-index and box-shadow when dragging for the "pop out" effect
    zIndex: isDragging ? 50 : "auto",
    opacity: isDragging ? 0.9 : 1,
    boxShadow: isDragging ? "0 10px 30px rgba(0,0,0,0.5)" : "none",
    scale: isDragging ? "1.02" : "1",
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      // On mobile we attach listeners to the whole row
      // On desktop we rely on the specific handle (the grip icon)
      // Since dnd-kit can just use listeners on the Grip handle, we'll assign the activator ref to the handle
      {...(typeof window !== "undefined" && window.matchMedia("(max-width: 768px)").matches
        ? listeners
        : {})}
      className={`rounded-2xl px-3 py-2 text-sm border flex items-center gap-3 relative transition-colors ${
        item.isCurrent
          ? "border-green-500/40 bg-green-500/10 text-green-600 font-medium dark:text-green-300"
          : "border-foreground/5 bg-foreground/5 text-foreground/70"
      }`}
    >
      <div
        // Attach activator ref for the drag handle
        ref={setActivatorNodeRef}
        {...(typeof window !== "undefined" && !window.matchMedia("(max-width: 768px)").matches
          ? listeners
          : {})}
        {...attributes}
        className="cursor-grab active:cursor-grabbing p-1.5 -ml-1 text-foreground/30 hover:text-foreground/60 transition-colors hidden md:flex items-center justify-center shrink-0"
      >
        <GripVertical className="w-4 h-4" />
      </div>

      <div className="w-8 h-8 rounded-xl bg-foreground/10 flex items-center justify-center shrink-0 md:ml-0 ml-1">
        <Music2 className="w-3.5 h-3.5 text-foreground/50" />
      </div>
      <div className="flex-1 min-w-0">
        <div className="font-semibold truncate text-green-600 dark:text-green-300">{item.title}</div>
        <div className="text-[11px] uppercase tracking-widest flex flex-col gap-1 mt-0.5 text-green-600/90 dark:text-green-300/80">
          <div className="flex items-center gap-2 flex-wrap">
            <span>{item.queueIndex + 1} {item.isCurrent ? "• now playing" : "• queued"}</span>
          </div>
          <span className="text-[9px] normal-case font-bold">Added by: {addedByName}</span>
        </div>
      </div>

      {onPlay && (
        <button
          type="button"
          onClick={(e) => onPlay(e, item.id)}
          title="Play this track now"
          className="w-8 h-8 rounded-full hover:bg-green-500/10 text-foreground/20 hover:text-green-600 dark:hover:text-green-500 flex items-center justify-center transition-colors shrink-0 z-10 relative cursor-pointer"
        >
          <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polygon points="6 3 20 12 6 21 6 3"/></svg>
        </button>
      )}

      <button
        type="button"
        onClick={async (e) => {
          e.stopPropagation();
          const btn = e.currentTarget;
          btn.disabled = true;
          try {
            await onRemove(e, item.id);
          } finally {
            btn.disabled = false;
          }
        }}
        className="w-8 h-8 rounded-full hover:bg-red-500/10 text-foreground/20 hover:text-red-600 dark:hover:text-red-500 flex items-center justify-center transition-colors shrink-0 z-10 relative cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
      >
        <Trash2 className="w-4 h-4" />
      </button>
    </div>
  );
}
