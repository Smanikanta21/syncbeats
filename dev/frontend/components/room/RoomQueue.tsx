"use client";

import { useState, useRef, useEffect } from "react";
import { createPortal } from "react-dom";
import { motion, AnimatePresence } from "framer-motion";
import { Music2, Shuffle, Repeat, Repeat1, Plus, Disc, Trash2, Play, RotateCcw } from "lucide-react";
import type { TrackQueueItem } from "../../lib/types";
import { SortableTrackItem, TrackItemRow } from "../SortableTrackItem";
import { ConfirmModal } from "../ConfirmModal";
import { 
  DndContext, 
  closestCenter, 
  KeyboardSensor, 
  MouseSensor,
  TouchSensor,
  useSensor, 
  useSensors,
  DragEndEvent,
  DragStartEvent,
  DragOverlay
} from "@dnd-kit/core";
import { 
  SortableContext, 
  verticalListSortingStrategy,
  arrayMove,
  sortableKeyboardCoordinates
} from "@dnd-kit/sortable";
import { roomsApi } from "../../lib/api";
import { restrictToVerticalAxis, restrictToParentElement } from "@dnd-kit/modifiers";
import { cn } from "../../lib/utils";

type RepeatMode = "off" | "track" | "all";

interface RoomQueueProps {
  queue: TrackQueueItem[];
  isHost: boolean;
  roomId: string;
  onTrackSelect?: (item: TrackQueueItem) => void;
  onAddSong?: () => void;
  onRemoveTrack: (id: string) => void;
  isPlaying?: boolean;
  shuffle: boolean;
  repeatMode: "off" | "all" | "track";
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
  const m = trackUrl.match(/^(?:ws-p2p:yt:|youtube:)([a-zA-Z0-9_-]{11})/);
  return m ? `https://i.ytimg.com/vi/${m[1]}/mqdefault.jpg` : null;
}

export function RoomQueue({
  queue, isHost, roomId, onTrackSelect, onAddSong, onRemoveTrack, isPlaying = false,
  shuffle, repeatMode, onToggleShuffle, onToggleRepeat
}: RoomQueueProps) {
  const [hoveredId, setHoveredId] = useState<string | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const [optimisticQueue, setOptimisticQueue] = useState(queue);
  const [activeDragId, setActiveDragId] = useState<string | null>(null);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  const currentIndex = optimisticQueue.findIndex(q => q.isCurrent);
  const splitIndex = currentIndex >= 0 ? currentIndex : 0;
  const historyQueue = optimisticQueue.slice(0, splitIndex);
  // Current song is separate — not draggable
  const currentSong = currentIndex >= 0 ? optimisticQueue[currentIndex] : null;
  // Only songs AFTER current are draggable
  const draggableQueue = currentIndex >= 0 ? optimisticQueue.slice(currentIndex + 1) : optimisticQueue;

  // Track which IDs are newly added for snap animation
  const knownIdsRef = useRef<Set<string>>(new Set());
  const [newIds, setNewIds] = useState<Set<string>>(new Set());

  // Keep optimistic queue synced with server updates, UNLESS we are dragging
  useEffect(() => {
    if (!activeDragId) {
      const incoming = queue.map(q => q.id);
      const added = incoming.filter(id => !knownIdsRef.current.has(id));
      if (added.length > 0) {
        setNewIds(new Set(added));
        setTimeout(() => setNewIds(new Set()), 1000);
      }
      knownIdsRef.current = new Set(incoming);
      setOptimisticQueue(queue);
    }
  }, [queue, activeDragId]);

  const sensors = useSensors(
    useSensor(MouseSensor, { activationConstraint: { distance: 8 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 250, tolerance: 6 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  );

  const handleDragStart = (event: DragStartEvent) => {
    setActiveDragId(event.active.id as string);
  };

  const handleDragEnd = async (event: DragEndEvent) => {
    const { active, over } = event;
    setActiveDragId(null);
    if (!over || active.id === over.id) return;

    // Find indices within the draggable (post-current) portion
    const oldDragIdx = draggableQueue.findIndex(q => q.id === active.id);
    const newDragIdx = draggableQueue.findIndex(q => q.id === over.id);

    if (oldDragIdx === -1 || newDragIdx === -1) return;

    // Map to full queue indices for the server
    const offsetFromStart = (currentIndex >= 0 ? currentIndex + 1 : 0);
    const oldFullIdx = offsetFromStart + oldDragIdx;
    const newFullIdx = offsetFromStart + newDragIdx;

    if (oldFullIdx !== -1 && newFullIdx !== -1) {
      const reordered = arrayMove(optimisticQueue, oldFullIdx, newFullIdx);
      setOptimisticQueue(reordered);

      try {
        await roomsApi.reorderQueue(roomId, active.id as string, newFullIdx);
      } catch (err) {
        console.error("Failed to reorder queue", err);
        setOptimisticQueue(queue);
      }
    }
  };

  const [confirmConfig, setConfirmConfig] = useState<{
    isOpen: boolean;
    title: string;
    message: string;
    confirmText?: string;
    isDanger?: boolean;
    onConfirm: () => void;
  }>({
    isOpen: false,
    title: "",
    message: "",
    onConfirm: () => {},
  });

  const handleClearQueue = () => {
    setConfirmConfig({
      isOpen: true,
      title: "Clear Upcoming Queue",
      message: "Are you sure you want to clear all upcoming songs in the queue?",
      confirmText: "Clear Queue",
      isDanger: true,
      onConfirm: async () => {
        try {
          await roomsApi.clearQueue(roomId);
        } catch (err) {
          console.error("Failed to clear queue", err);
        }
      },
    });
  };

  const handleResetRoom = () => {
    setConfirmConfig({
      isOpen: true,
      title: "Reset Room",
      message: "Are you sure you want to reset the room? This will stop playback and clear all queue items across all connected devices.",
      confirmText: "Reset Room",
      isDanger: true,
      onConfirm: async () => {
        try {
          await roomsApi.reset(roomId);
        } catch (err) {
          console.error("Failed to reset room", err);
        }
      },
    });
  };

  const RepeatIcon = repeatMode === "track" ? Repeat1 : Repeat;

  // Find the actively dragged item for overlay
  const activeDragItem = activeDragId ? draggableQueue.find(q => q.id === activeDragId) : null;

  return (
    <div className={cn('flex', 'flex-col', 'h-full', 'overflow-hidden')}>
      {/* Header Section */}
      <div className="flex items-center justify-between px-3 pt-3 pb-2 shrink-0 border-b border-foreground/[0.06] mb-1">
        <div className="flex items-center gap-1.5 min-w-0 shrink-0">
          <Disc className="w-3.5 h-3.5 text-foreground/50 shrink-0" />
          <h3 className="text-xs font-black uppercase tracking-wider text-foreground/70 truncate">
            Queue
          </h3>
          <span className="text-[10px] font-bold px-1.5 py-0.2 rounded-full bg-foreground/10 text-foreground/50 shrink-0">
            {optimisticQueue.length}
          </span>
        </div>
        <div className="flex items-center gap-0.5 shrink-0">
          <button
            onClick={onToggleShuffle}
            className={cn(
              "p-1.5 rounded-md transition-colors",
              shuffle ? "bg-foreground/15 text-foreground font-bold" : "text-foreground/40 hover:text-foreground/70 hover:bg-foreground/5"
            )}
            title="Shuffle Queue"
          >
            <Shuffle className="w-3.5 h-3.5" />
          </button>
          <button
            onClick={onToggleRepeat}
            className={cn(
              "p-1.5 rounded-md transition-colors",
              repeatMode !== "off" ? "bg-foreground/15 text-foreground font-bold" : "text-foreground/40 hover:text-foreground/70 hover:bg-foreground/5"
            )}
            title={`Repeat (${repeatMode})`}
          >
            <RepeatIcon className="w-3.5 h-3.5" />
          </button>
          {/* Spotify Import */}
          <button
            onClick={() => document.dispatchEvent(new CustomEvent("island:expand-spotify"))}
            className="p-1.5 rounded-md text-foreground/40 hover:text-[#1DB954] hover:bg-foreground/5 transition-colors"
            title="Import from Spotify"
          >
            <svg viewBox="0 0 24 24" className="w-3.5 h-3.5 fill-current">
              <path d="M12 0C5.4 0 0 5.4 0 12s5.4 12 12 12 12-5.4 12-12S18.66 0 12 0zm5.521 17.34c-.24.359-.66.48-1.021.24-2.82-1.74-6.36-2.101-10.561-1.141-.418.122-.779-.179-.899-.539-.12-.421.18-.78.54-.9 4.56-1.021 8.52-.6 11.64 1.32.42.18.479.659.301 1.02zm1.44-3.3c-.301.42-.841.6-1.262.3-3.239-1.98-8.159-2.58-11.939-1.38-.479.12-1.02-.12-1.14-.6-.12-.48.12-1.021.6-1.141C9.6 9.9 15 10.561 18.72 12.84c.361.181.54.78.241 1.2zm.12-3.36C15.24 8.4 8.82 8.16 5.16 9.301c-.6.179-1.2-.181-1.38-.721-.18-.601.18-1.2.72-1.381 4.26-1.26 11.28-1.02 15.721 1.621.539.3.719 1.02.419 1.56-.299.421-1.02.599-1.559.3z" />
            </svg>
          </button>
          {/* Clear Queue */}
          {draggableQueue.length > 0 && (
            <button
              onClick={handleClearQueue}
              className="p-1.5 rounded-md text-foreground/40 hover:text-red-400 hover:bg-red-500/10 transition-colors"
              title="Clear upcoming queue"
            >
              <Trash2 className="w-3.5 h-3.5" />
            </button>
          )}
          {/* Reset Room */}
          <button
            onClick={handleResetRoom}
            className="p-1.5 rounded-md text-foreground/40 hover:text-amber-400 hover:bg-amber-500/10 transition-colors"
            title="Reset Room (Clear Queue & State)"
          >
            <RotateCcw className="w-3.5 h-3.5" />
          </button>
          {/* Add Song */}
          {onAddSong && (
            <button
              onClick={onAddSong}
              className="p-1.5 rounded-md text-foreground/40 hover:text-foreground hover:bg-foreground/10 transition-colors"
              title="Add a song"
            >
              <Plus className="w-3.5 h-3.5" />
            </button>
          )}
        </div>
      </div>

      {optimisticQueue.length === 0 ? (
        <div className={cn('flex-1', 'flex', 'flex-col', 'items-center', 'justify-center', 'gap-3', 'opacity-40', 'select-none', 'px-6')}>
          <Music2 className={cn('w-10', 'h-10')} />
          <p className={cn('text-sm', 'font-semibold', 'text-center')}>Queue is empty</p>
          <button
            onClick={onAddSong}
            className={cn('mt-2', 'flex', 'items-center', 'gap-2', 'px-4', 'py-2', 'rounded-xl', 'bg-foreground/20', 'text-foreground', 'dark:text-foreground', 'text-xs', 'font-bold', 'hover:bg-foreground/20', 'transition-colors')}
          >
            <Plus className={cn('w-3.5', 'h-3.5')} />
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
            ref={scrollRef}
            className={cn('flex-1', 'overflow-y-auto', 'space-y-1.5', 'pr-0.5', 'min-h-0')}
            data-lenis-prevent="true"
            style={{ scrollbarWidth: "thin", scrollbarColor: "rgba(128,128,128,0.15) transparent" }}
          >
            {/* History Section */}
            {historyQueue.length > 0 && (
              <div className={cn('space-y-1.5', 'mb-6')}>
                {historyQueue.map((item, idx) => (
                  <SortableTrackItem
                    key={item.id}
                    item={item}
                    idx={idx}
                    isCurrent={false}
                    isPlaying={false}
                    isHovered={hoveredId === item.id}
                    isHost={isHost}
                    onHoverStart={() => setHoveredId(item.id)}
                    onHoverEnd={() => setHoveredId(null)}
                    onTrackSelect={onTrackSelect!}
                    onRemoveTrack={onRemoveTrack!}
                    disableDrag={true}
                    isHistory={true}
                  />
                ))}
              </div>
            )}

            {/* Continue Playing Header */}
            {(historyQueue.length > 0 || currentSong || draggableQueue.length > 0) && (
              <div className={cn('font-bold', 'text-foreground/80', 'text-sm', 'mt-4', 'mb-3', 'pl-2')}>
                Continue Playing
              </div>
            )}

            {/* Currently Playing — NOT draggable, pinned at top of upcoming */}
            {currentSong && (
              <SortableTrackItem
                key={currentSong.id}
                item={currentSong}
                idx={splitIndex}
                isCurrent={true}
                isPlaying={isPlaying}
                isHovered={hoveredId === currentSong.id}
                isHost={isHost}
                onHoverStart={() => setHoveredId(currentSong.id)}
                onHoverEnd={() => setHoveredId(null)}
                onTrackSelect={onTrackSelect!}
                onRemoveTrack={onRemoveTrack!}
                disableDrag={true}
              />
            )}

            {/* Draggable upcoming songs (after current) */}
            <SortableContext items={draggableQueue.map(q => q.id)} strategy={verticalListSortingStrategy}>
              {draggableQueue.map((item, idx) => (
                <SortableTrackItem
                  key={item.id}
                  item={item}
                  idx={splitIndex + 1 + idx}
                  isCurrent={false}
                  isPlaying={false}
                  isHovered={hoveredId === item.id}
                  isHost={isHost}
                  onHoverStart={() => setHoveredId(item.id)}
                  onHoverEnd={() => setHoveredId(null)}
                  onTrackSelect={onTrackSelect!}
                  onRemoveTrack={onRemoveTrack!}
                  disableDrag={false}
                  isNew={newIds.has(item.id)}
                />
              ))}
            </SortableContext>
          </div>

          {mounted && typeof document !== "undefined" && createPortal(
            <DragOverlay adjustScale={false}>
              {activeDragItem ? (
                <div style={{ width: scrollRef.current?.clientWidth ?? '100%' }}>
                  <TrackItemRow
                    item={activeDragItem}
                    idx={optimisticQueue.findIndex(q => q.id === activeDragId)}
                    isCurrent={false}
                    isPlaying={false}
                    isHovered={false}
                    isHost={isHost}
                    disableDrag={true}
                    style={{
                      scale: 1.08,
                      transform: 'rotate(-1deg)',
                      boxShadow: '0 16px 48px rgba(0,0,0,0.45), 0 4px 12px rgba(0,0,0,0.3), 0 0 0 1px rgba(255,255,255,0.08)',
                      backgroundColor: 'rgba(255,255,255,0.12)',
                      backdropFilter: 'blur(20px)',
                      borderRadius: '1rem',
                    }}
                  />
                </div>
              ) : null}
            </DragOverlay>,
            document.body
          )}
        </DndContext>
      )}

      <ConfirmModal
        isOpen={confirmConfig.isOpen}
        title={confirmConfig.title}
        message={confirmConfig.message}
        confirmText={confirmConfig.confirmText}
        isDanger={confirmConfig.isDanger}
        onConfirm={confirmConfig.onConfirm}
        onClose={() => setConfirmConfig(prev => ({ ...prev, isOpen: false }))}
      />
    </div>
  );
}
