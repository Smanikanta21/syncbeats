"use client";

import { useState, useRef, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Music2, Shuffle, Repeat, Repeat1, Plus, Disc, Trash2, Play } from "lucide-react";
import type { TrackQueueItem } from "../../lib/types";
import { SortableTrackItem } from "../SortableTrackItem";
import { 
  DndContext, 
  closestCenter, 
  KeyboardSensor, 
  PointerSensor, 
  useSensor, 
  useSensors,
  DragEndEvent,
  DragStartEvent
} from "@dnd-kit/core";
import { 
  SortableContext, 
  verticalListSortingStrategy,
  arrayMove,
  sortableKeyboardCoordinates
} from "@dnd-kit/sortable";
import { roomsApi } from "../../lib/api";
import { restrictToVerticalAxis, restrictToParentElement } from "@dnd-kit/modifiers";

type RepeatMode = "off" | "track" | "all";

interface RoomQueueProps {
  queue: TrackQueueItem[];
  isHost: boolean;
  roomId: string;
  onTrackSelect?: (item: TrackQueueItem) => void;
  onAddSong?: () => void;
  onRemoveTrack?: (id: string) => void;
  isPlaying?: boolean;
  shuffle: boolean;
  repeatMode: RepeatMode;
  onToggleShuffle: () => void;
  onToggleRepeat: () => void;
}

function cleanTitle(t: string) {
  return (
    t
      .replace(/\s*[\[\(].*?(official|music|video|audio|lyric|hd|hq|4k|live).*?[\)\]]/gi, "")
      .replace(/\s*-\s*.*?(official|music|video|audio).*$/gi, "")
      .trim() || t
  );
}

function ytThumb(trackUrl: string | null | undefined) {
  if (!trackUrl) return null;
  const m = trackUrl.match(/^ws-p2p:yt:([^_]+)_/);
  return m ? `https://i.ytimg.com/vi/${m[1]}/mqdefault.jpg` : null;
}

export function RoomQueue({
  queue, isHost, roomId, onTrackSelect, onAddSong, onRemoveTrack, isPlaying = false,
  shuffle, repeatMode, onToggleShuffle, onToggleRepeat
}: RoomQueueProps) {
  const [hoveredId, setHoveredId] = useState<string | null>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const [optimisticQueue, setOptimisticQueue] = useState(queue);
  const [activeDragId, setActiveDragId] = useState<string | null>(null);

  // Keep optimistic queue synced with server updates, UNLESS we are dragging
  useEffect(() => {
    if (!activeDragId) {
      setOptimisticQueue(queue);
    }
  }, [queue, activeDragId]);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  );

  const handleDragStart = (event: DragStartEvent) => {
    setActiveDragId(event.active.id as string);
  };

  const handleDragEnd = async (event: DragEndEvent) => {
    const { active, over } = event;
    setActiveDragId(null);
    if (!over || active.id === over.id) return;

    const oldIndex = optimisticQueue.findIndex(q => q.id === active.id);
    const newIndex = optimisticQueue.findIndex(q => q.id === over.id);
    
    if (oldIndex !== -1 && newIndex !== -1) {
      const reordered = arrayMove(optimisticQueue, oldIndex, newIndex);
      setOptimisticQueue(reordered);
      
      try {
        await roomsApi.reorderQueue(roomId, active.id as string, newIndex);
      } catch (err) {
        console.error("Failed to reorder queue", err);
        // Revert on error
        setOptimisticQueue(queue);
      }
    }
  };

  const RepeatIcon = repeatMode === "track" ? Repeat1 : Repeat;

  return (
    <div className="h-full flex flex-col min-h-0">
      {/* Header */}
      <div className="flex items-center justify-between px-1 pb-3 shrink-0">
        <div className="flex items-center gap-2">
          <Music2 className="w-4 h-4 text-foreground dark:text-foreground" />
          <span className="text-xs font-black uppercase tracking-widest text-foreground/50">Queue</span>
          {queue.length > 0 && (
            <span className="text-[10px] font-black text-foreground/20">{queue.length}</span>
          )}
        </div>

        <div className="flex items-center gap-1">
          {/* Shuffle */}
          <button
            onClick={onToggleShuffle}
            className={`p-2 rounded-xl transition-all duration-200 ${
              shuffle
                ? "bg-foreground/20 text-foreground dark:text-foreground"
                : "text-foreground/30 hover:text-foreground/60 hover:bg-foreground/[0.05]"
            }`}
            title="Shuffle"
          >
            <Shuffle className="w-3.5 h-3.5" />
          </button>

          {/* Repeat */}
          <button
            onClick={onToggleRepeat}
            className={`p-2 rounded-xl transition-all duration-200 relative ${
              repeatMode !== "off"
                ? "bg-foreground/20 text-foreground dark:text-foreground"
                : "text-foreground/30 hover:text-foreground/60 hover:bg-foreground/[0.05]"
            }`}
            title={`Repeat: ${repeatMode}`}
          >
            <RepeatIcon className="w-3.5 h-3.5" />
          </button>

          {/* Add */}
          <button
            onClick={onAddSong}
            className="p-2 rounded-xl text-foreground/30 hover:text-foreground/60 hover:bg-foreground/[0.05] transition-all"
            title="Add song"
          >
            <Plus className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {/* Queue list */}
      {queue.length === 0 ? (
        <div className="flex-1 flex flex-col items-center justify-center gap-3 text-center">
          <div className="w-12 h-12 rounded-2xl bg-foreground/[0.05] flex items-center justify-center">
            <Disc className="w-6 h-6 text-foreground/20 animate-[spin_6s_linear_infinite]" />
          </div>
          <div>
            <p className="text-foreground/30 text-sm font-semibold">Queue is empty</p>
            <p className="text-foreground/15 text-xs mt-1">Add songs to get the party started</p>
          </div>
          <button
            onClick={onAddSong}
            className="mt-2 flex items-center gap-2 px-4 py-2 rounded-xl bg-foreground/20 text-foreground dark:text-foreground text-xs font-bold hover:bg-foreground/20 transition-colors"
          >
            <Plus className="w-3.5 h-3.5" />
            Add a song
          </button>
        </div>
      ) : (
        <DndContext
          sensors={sensors}
          collisionDetection={closestCenter}
          onDragStart={handleDragStart}
          onDragEnd={handleDragEnd}
          modifiers={[restrictToVerticalAxis, restrictToParentElement]}
        >
          <div
            ref={listRef}
            data-lenis-prevent="true"
            className="flex-1 overflow-y-auto space-y-1.5 pr-0.5 min-h-0"
            style={{ scrollbarWidth: "thin", scrollbarColor: "rgba(128,128,128,0.15) transparent" }}
          >
            <SortableContext items={optimisticQueue.map(q => q.id)} strategy={verticalListSortingStrategy}>
              {optimisticQueue.map((item, idx) => (
                <SortableTrackItem
                  key={item.id}
                  item={item}
                  idx={idx}
                  isCurrent={item.isCurrent}
                  isPlaying={isPlaying}
                  isHovered={hoveredId === item.id}
                  isHost={isHost}
                  onHoverStart={() => setHoveredId(item.id)}
                  onHoverEnd={() => setHoveredId(null)}
                  onTrackSelect={onTrackSelect!}
                  onRemoveTrack={onRemoveTrack!}
                  disableDrag={!isHost}
                />
              ))}
            </SortableContext>
          </div>
        </DndContext>
      )}
    </div>
  );
}
