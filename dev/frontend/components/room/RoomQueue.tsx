"use client";

import { useState, useRef, useEffect } from "react";
import { createPortal } from "react-dom";
import { motion, AnimatePresence } from "framer-motion";
import { Music2, Shuffle, Repeat, Repeat1, Plus, Disc, Trash2, Play, RotateCcw, Infinity, Timer, Star, MoreHorizontal } from "lucide-react";
import type { TrackQueueItem } from "../../lib/types";
import { SortableTrackItem, TrackItemRow } from "../SortableTrackItem";
import { ConfirmModal } from "../ConfirmModal";
import { PlayOrEnqueueModal } from "./PlayOrEnqueueModal";
import { getSocket } from "../../lib/socket";
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
  jumpingTrackId?: string | null;
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
  shuffle, repeatMode, onToggleShuffle, onToggleRepeat, jumpingTrackId
}: RoomQueueProps) {
  const [hoveredId, setHoveredId] = useState<string | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const [optimisticQueue, setOptimisticQueue] = useState(queue);
  const [activeDragId, setActiveDragId] = useState<string | null>(null);
  const [mounted, setMounted] = useState(false);
  
  // Track Menu Modal State
  const [menuTrackId, setMenuTrackId] = useState<string | null>(null);
  const [showPlaylistModal, setShowPlaylistModal] = useState(false);

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
        setTimeout(() => setNewIds(new Set()), 1200);

        // Auto-scroll queue container to show newly added song
        if (scrollRef.current) {
          setTimeout(() => {
            scrollRef.current?.scrollTo({
              top: scrollRef.current.scrollHeight,
              behavior: "smooth"
            });
          }, 150);
        }
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

  const handleRemoveTrack = (id: string) => {
    // Optimistically remove the track from local state so the UI snaps instantly
    setOptimisticQueue(prev => prev.filter(q => q.id !== id));
    // Call the parent handler to actually hit the DB
    onRemoveTrack?.(id);
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

  const [promptTrack, setPromptTrack] = useState<TrackQueueItem | null>(null);

  const executeEnqueueAndPlay = async (track: TrackQueueItem, playNow: boolean) => {
    try {
      const res = await roomsApi.enqueueYoutube(roomId, track.trackUrl || "", track.title);
      if (playNow && res?.item?.id) {
        getSocket().emit("playback:jumpTo", { roomId, trackId: res.item.id });
      }
    } catch (e) {
      console.error("Failed to enqueue history track", e);
    }
  };

  const [isClearing, setIsClearing] = useState(false);
  const [isResetting, setIsResetting] = useState(false);

  const handleClearQueue = () => {
    if (isClearing) return;
    setConfirmConfig({
      isOpen: true,
      title: "Clear Upcoming Queue",
      message: "Are you sure you want to clear all upcoming songs in the queue?",
      confirmText: "Clear Queue",
      isDanger: true,
      onConfirm: async () => {
        if (isClearing) return;
        setIsClearing(true);
        try {
          await roomsApi.clearQueue(roomId);
          await new Promise(r => setTimeout(r, 600));
        } catch (err) {
          console.error("Failed to clear queue", err);
        } finally {
          setIsClearing(false);
        }
      },
    });
  };

  const handleResetRoom = () => {
    if (isResetting) return;
    setConfirmConfig({
      isOpen: true,
      title: "Reset Room",
      message: "Are you sure you want to reset the room? This will stop playback and clear all queue items across all connected devices.",
      confirmText: "Reset Room",
      isDanger: true,
      onConfirm: async () => {
        if (isResetting) return;
        setIsResetting(true);
        setOptimisticQueue([]);
        try {
          await roomsApi.reset(roomId);
        } catch (err) {
          console.error("Failed to reset room", err);
        } finally {
          setIsResetting(false);
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
      <div className="flex items-center justify-end px-3 pt-3 pb-2 shrink-0 border-b border-foreground/[0.06] mb-1">
        <div className="flex items-center gap-0.5 shrink-0">
          {/* Clear Queue (Single Click Lock + Halfway Load Animation) */}
          {draggableQueue.length > 0 && (
            <button
              disabled={isClearing}
              onClick={handleClearQueue}
              className={cn(
                "p-1.5 rounded-md text-foreground/40 hover:text-red-400 hover:bg-red-500/10 transition-colors",
                isClearing && "opacity-50 cursor-not-allowed text-red-400"
              )}
              title="Clear upcoming queue"
            >
              <motion.div
                animate={isClearing ? { rotate: 180, scale: 0.85 } : { rotate: 0, scale: 1 }}
                transition={{ duration: 0.4, ease: "easeInOut" }}
              >
                <Trash2 className="w-3.5 h-3.5" />
              </motion.div>
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
              <div className={cn('space-y-1.5', 'mb-6', 'pb-4', 'border-b', 'border-foreground/[0.06]')}>
                <div className="flex items-center justify-between px-2 mb-3 mt-1">
                  <h3 className="font-bold text-foreground text-sm">History</h3>
                  <button 
                    onClick={() => console.log('Clear history')} 
                    className="text-foreground/50 text-xs hover:text-foreground font-semibold transition-colors"
                  >
                    Clear
                  </button>
                </div>
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
                    onAddTrack={setPromptTrack}
                    onRemoveTrack={handleRemoveTrack}
                    disableDrag={true}
                    isHistory={true}
                    isJumping={jumpingTrackId === item.id}
                  />
                ))}
              </div>
            )}

            {/* Currently Playing Header (Spotify-like) */}
            {currentSong && (
              <div className="mb-6 px-1 flex flex-col gap-4 relative z-10">
                <div className="flex items-center gap-3">
                  {/* Thumbnail */}
                  <div className="w-14 h-14 rounded-md overflow-hidden bg-foreground/10 shrink-0 relative flex items-center justify-center border border-foreground/10 shadow-sm">
                    {ytThumb(currentSong.trackUrl) ? (
                      <img src={ytThumb(currentSong.trackUrl)!} alt="Thumbnail" className="w-full h-full object-cover" />
                    ) : (
                      <Music2 className="w-6 h-6 text-foreground/30" />
                    )}
                  </div>
                  {/* Info */}
                  <div className="flex-1 min-w-0 flex flex-col justify-center">
                    <div className="font-bold text-foreground text-base tracking-tight truncate leading-snug">
                      {cleanTitle(currentSong.title)}
                    </div>
                    <div className="text-foreground/60 text-xs truncate uppercase tracking-widest font-medium mt-0.5">
                      {currentSong.artist || "Unknown Artist"}
                    </div>
                  </div>
                  {/* Actions */}
                  <div className="flex items-center gap-1 shrink-0 text-foreground/60">
                    <button className="p-2 hover:text-foreground transition-colors rounded-full hover:bg-foreground/10">
                      <Star className="w-5 h-5" />
                    </button>
                    <button 
                      onClick={() => setMenuTrackId(currentSong.id)}
                      className="p-2 hover:text-foreground transition-colors rounded-full hover:bg-foreground/10"
                    >
                      <MoreHorizontal className="w-5 h-5" />
                    </button>
                  </div>
                </div>

                {/* Queue controls */}
                <div className="flex items-center gap-2">
                  <button 
                    onClick={onToggleShuffle}
                    className={cn(
                      "flex-1 h-9 rounded-full flex items-center justify-center transition-all",
                      shuffle ? "bg-foreground text-background" : "bg-foreground/10 text-foreground/80 hover:bg-foreground/15"
                    )}
                  >
                    <Shuffle className="w-4 h-4" />
                  </button>
                  <button 
                    onClick={onToggleRepeat}
                    className={cn(
                      "flex-1 h-9 rounded-full flex items-center justify-center transition-all",
                      repeatMode !== "off" ? "bg-foreground text-background" : "bg-foreground/10 text-foreground/80 hover:bg-foreground/15"
                    )}
                  >
                    {repeatMode === "track" ? <Repeat1 className="w-4 h-4" /> : <Repeat className="w-4 h-4" />}
                  </button>
                  <button 
                    onClick={onAddSong}
                    title="Add Song"
                    className="flex-1 h-9 rounded-full bg-foreground/10 text-foreground/80 hover:bg-foreground/15 hover:text-foreground flex items-center justify-center transition-all"
                  >
                    <Plus className="w-4 h-4" />
                  </button>
                  <button 
                    disabled={isResetting}
                    onClick={handleResetRoom}
                    title="Reset Room"
                    className={cn(
                      "flex-1 h-9 rounded-full flex items-center justify-center transition-all",
                      isResetting ? "bg-amber-500/20 text-amber-500 opacity-50 cursor-not-allowed" : "bg-foreground/10 text-foreground/80 hover:bg-amber-500/15 hover:text-amber-400"
                    )}
                  >
                    <motion.div
                      animate={isResetting ? { rotate: -180, scale: 0.85 } : { rotate: 0, scale: 1 }}
                      transition={{ duration: 0.4, ease: "easeInOut" }}
                    >
                      <RotateCcw className="w-4 h-4" />
                    </motion.div>
                  </button>
                </div>
              </div>
            )}

            {/* Continue Playing Header */}
            {draggableQueue.length > 0 && (
              <div className={cn('font-bold', 'text-foreground/80', 'text-sm', 'mt-2', 'mb-3', 'pl-2')}>
                Continue Playing
              </div>
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
                  onRemoveTrack={handleRemoveTrack}
                  disableDrag={false}
                  isNew={newIds.has(item.id)}
                  isJumping={jumpingTrackId === item.id}
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

      <PlayOrEnqueueModal
        isOpen={!!promptTrack}
        track={promptTrack ? {
          title: promptTrack.title,
          artist: promptTrack.artist,
          thumbnail: promptTrack.thumbnail,
          url: promptTrack.trackUrl || promptTrack.id,
        } : null}
        onPlayNow={() => {
          if (promptTrack) executeEnqueueAndPlay(promptTrack, true);
          setPromptTrack(null);
        }}
        onAddToQueue={() => {
          if (promptTrack) executeEnqueueAndPlay(promptTrack, false);
          setPromptTrack(null);
        }}
        onClose={() => setPromptTrack(null)}
      />
    </div>
  );
}
