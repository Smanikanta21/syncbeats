"use client";

import { useState, useRef, useEffect, useMemo } from "react";
import { createPortal } from "react-dom";
import { motion } from "framer-motion";
import { Music2, Shuffle, Repeat, Repeat1, Plus, Trash2, RotateCcw, Star, MoreHorizontal, Search } from "lucide-react";
import type { TrackQueueItem } from "../../lib/types";
import { SortableTrackItem, TrackItemRow, cleanTitle, ytThumb } from "../SortableTrackItem";
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
import { useRoomSearch } from "../../context/RoomSearchContext";
import { AccountSongs, type AccountSong } from "./AccountSongs";
import { cn } from "../../lib/utils";

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

export function RoomQueue({
  queue, isHost, roomId, onTrackSelect, onAddSong, onRemoveTrack,
  shuffle, repeatMode, onToggleShuffle, onToggleRepeat, jumpingTrackId, isPlaying = false
}: RoomQueueProps) {
  const { query } = useRoomSearch(roomId);
  const songsPanelId = `room-songs-${roomId}`;
  const [view, setView] = useState<"queue" | "history" | "all">("queue");
  const [hoveredId, setHoveredId] = useState<string | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const [optimisticQueue, setOptimisticQueue] = useState(queue);
  const [activeDragId, setActiveDragId] = useState<string | null>(null);
  const [mounted, setMounted] = useState(false);

  // Track Menu Modal State

  useEffect(() => {
    setMounted(true);
  }, []);

  const currentIndex = optimisticQueue.findIndex(q => q.isCurrent);
  const needle = query.trim().toLocaleLowerCase();
  const matches = (item: TrackQueueItem) => !needle || `${cleanTitle(item.title)} ${item.artist || ""}`.toLocaleLowerCase().includes(needle);
  const selectedSongs = view === "history" ? optimisticQueue.filter(q => q.playedAt && !q.isCurrent) : optimisticQueue.filter(q => q.isCurrent || !q.playedAt);
  const visibleSongs = selectedSongs.filter(matches);
  const currentSong = currentIndex >= 0 ? optimisticQueue[currentIndex] : null;
  const draggableQueue = optimisticQueue.filter(q => !q.playedAt && !q.isCurrent);

  // Row numbers are full-queue positions. History is no longer a prefix slice, so a
  // section-local index would misnumber every row — look the real one up instead.
  const positionById = useMemo(
    () => new Map(optimisticQueue.map((q, i) => [q.id, i])),
    [optimisticQueue],
  );

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

    // Resolve straight to full-queue indices — the draggable list is a filtered subset,
    // not a contiguous tail, so an offset from currentIndex would land on the wrong row.
    const oldFullIdx = optimisticQueue.findIndex(q => q.id === active.id);
    const newFullIdx = optimisticQueue.findIndex(q => q.id === over.id);

    if (oldFullIdx === -1 || newFullIdx === -1) return;

    {
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

  const accountSongToTrack = (song: AccountSong): TrackQueueItem => ({
    id: `account-${song.id}`, title: song.title, artist: song.artist || undefined,
    trackUrl: `https://www.youtube.com/watch?v=${encodeURIComponent(song.youtubeId || '')}`,
    fileName: song.title, queueIndex: 0, isCurrent: false, addedBy: '', createdAt: 0,
    thumbnail: song.thumbnail || undefined,
    metadataSource: 'library',
  });

  const [promptTrack, setPromptTrack] = useState<TrackQueueItem | null>(null);

  const executeEnqueueAndPlay = async (track: TrackQueueItem, playNow: boolean) => {
    try {
      const res = await roomsApi.enqueueYoutube(roomId, track.trackUrl || "", track.title, {
        artist: track.artist, thumbnail: track.thumbnail, metadataSource: track.metadataSource,
      });
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

  // Find the actively dragged item for overlay
  const activeDragItem = activeDragId ? draggableQueue.find(q => q.id === activeDragId) : null;

  return (
    <div className="flex flex-col h-full overflow-hidden">
      <div className="flex items-center gap-1 pb-3">
        <div className="flex min-w-0" role="tablist" aria-label="Room songs">
          {([['queue', 'Queue'], ['history', 'History'], ['all', 'All songs']] as const).map(([id, label], index, tabs) => (
            <button key={id} id={`${songsPanelId}-${id}`} type="button" role="tab"
              aria-selected={view === id} aria-controls={songsPanelId} tabIndex={view === id ? 0 : -1}
              onClick={() => setView(id)}
              onKeyDown={event => {
                const next = event.key === 'ArrowRight' ? (index + 1) % tabs.length
                  : event.key === 'ArrowLeft' ? (index + tabs.length - 1) % tabs.length
                  : event.key === 'Home' ? 0 : event.key === 'End' ? tabs.length - 1 : -1;
                if (next < 0) return;
                event.preventDefault();
                setView(tabs[next][0]);
                document.getElementById(`${songsPanelId}-${tabs[next][0]}`)?.focus();
              }}
              className={cn("min-h-10 px-2.5 rounded-lg text-sm font-medium cursor-pointer transition-colors focus-visible:outline-2 focus-visible:outline-foreground", view === id ? "bg-foreground/8 text-foreground" : "text-foreground/50 hover:text-foreground")}>
              {label}
            </button>
          ))}
        </div>
        <button type="button" aria-label="Open Dynamic Island search" onClick={onAddSong}
          className="ml-auto min-h-10 min-w-10 flex items-center justify-center rounded-lg hover:bg-foreground/5 cursor-pointer focus-visible:outline-2 focus-visible:outline-foreground">
          <Search size={17} />
        </button>
      </div>
      {view === "queue" && <div className="flex items-center justify-end px-3 pt-3 pb-2 shrink-0 border-b border-foreground/[0.06] mb-1">
        <div className="flex items-center gap-0.5 shrink-0">
          {/* Clear Queue (Single Click Lock + Halfway Load Animation) */}
          {draggableQueue.length > 0 && (
            <button
              disabled={isClearing}
              onClick={handleClearQueue}
              className={cn(
                "p-1.5 rounded-md text-foreground/40 hover:text-bad-700 dark:text-bad-400 hover:bg-bad-500/10 transition-colors",
                isClearing && "opacity-50 cursor-not-allowed text-bad-700 dark:text-bad-400"
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
      </div>}
      {view !== "all" && <p role="status" className="text-xs text-foreground/50 mb-2">{query ? `${visibleSongs.length} matching ${visibleSongs.length === 1 ? 'song' : 'songs'}` : `${selectedSongs.length} ${selectedSongs.length === 1 ? 'song' : 'songs'}`}</p>}
      {view === "all" ? (
        <div id={songsPanelId} role="tabpanel" aria-labelledby={`${songsPanelId}-${view}`} className="flex-1 min-h-0 overflow-y-auto" data-lenis-prevent="true">
          <AccountSongs query={query} onChooseSong={song => setPromptTrack(accountSongToTrack(song))} />
        </div>
      ) : view === "history" ? (
        <div id={songsPanelId} role="tabpanel" aria-labelledby={`${songsPanelId}-${view}`} className="flex-1 min-h-0 overflow-y-auto space-y-1.5 pr-0.5" data-lenis-prevent="true">
          {visibleSongs.length === 0 ? <p className="px-2 py-6 text-sm text-foreground/50">{query ? 'No history songs match your search.' : 'Songs appear here after they finish playing.'}</p> : visibleSongs.map(item => (
            <SortableTrackItem key={item.id} item={item} idx={positionById.get(item.id) ?? 0}
              isCurrent={false} isPlaying={false} isHovered={hoveredId === item.id} isHost={isHost}
              onHoverStart={() => setHoveredId(item.id)} onHoverEnd={() => setHoveredId(null)}
              onTrackSelect={track => setPromptTrack(track)} onAddTrack={track => executeEnqueueAndPlay(track, false)}
              onRemoveTrack={handleRemoveTrack} disableDrag isHistory isJumping={jumpingTrackId === item.id} />
          ))}
        </div>
      ) : needle ? (
        <div id={songsPanelId} role="tabpanel" aria-labelledby={`${songsPanelId}-${view}`} className="flex-1 min-h-0 overflow-y-auto space-y-1" data-lenis-prevent="true">
          {visibleSongs.length === 0 ? (
            <p className="px-2 py-6 text-sm text-foreground/50">{query ? "No songs match your search." : "No songs here yet."}</p>
          ) : visibleSongs.map(item => (
            <TrackItemRow key={item.id} item={item} idx={positionById.get(item.id) ?? 0}
              isCurrent={!!item.isCurrent} isPlaying={isPlaying} isHovered={hoveredId === item.id} isHost={isHost}
              disableDrag searchQuery={query} isHistory={!!item.playedAt && !item.isCurrent} isJumping={jumpingTrackId === item.id}
              onHoverStart={() => setHoveredId(item.id)} onHoverEnd={() => setHoveredId(null)}
              onTrackSelect={track => track.playedAt && !track.isCurrent ? setPromptTrack(track) : onTrackSelect?.(track)}
              onRemoveTrack={handleRemoveTrack} onAddTrack={track => executeEnqueueAndPlay(track, false)} />
          ))}
        </div>
      ) : optimisticQueue.length === 0 ? (
        <div id={songsPanelId} role="tabpanel" aria-labelledby={`${songsPanelId}-${view}`} className="flex-1 flex flex-col items-center justify-center gap-3 opacity-40 select-none px-6">
          <Music2 className="w-10 h-10" />
          <p className="text-sm font-semibold text-center">Queue is empty</p>
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
            ref={scrollRef}
            id={songsPanelId}
            role="tabpanel"
            aria-labelledby={`${songsPanelId}-${view}`}
            className="flex-1 overflow-y-auto space-y-1.5 pr-0.5 min-h-0"
            data-lenis-prevent="true"
            style={{ scrollbarWidth: "thin", scrollbarColor: "rgba(128,128,128,0.15) transparent" }}
          >
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
                    <div className="font-semibold text-foreground text-base tracking-tight truncate leading-snug">
                      {cleanTitle(currentSong.title)}
                    </div>
                    <div className="text-foreground/60 text-xs truncate font-medium mt-0.5">
                      {currentSong.artist || "Unknown Artist"}
                    </div>
                  </div>
                  {/* Actions */}
                  <div className="flex items-center gap-1 shrink-0 text-foreground/60">
                    <button className="p-2 hover:text-foreground transition-colors rounded-full hover:bg-foreground/10">
                      <Star className="w-5 h-5" />
                    </button>
                    <button 
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
                      isResetting ? "bg-warn-500/20 text-warn-600 opacity-50 cursor-not-allowed" : "bg-foreground/10 text-foreground/80 hover:bg-warn-500/15 hover:text-warn-600"
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
              <div className="font-bold text-foreground/80 text-sm mt-2 mb-3 pl-2">
                Continue Playing
              </div>
            )}

            {/* Draggable upcoming songs (after current) */}
            <SortableContext items={draggableQueue.map(q => q.id)} strategy={verticalListSortingStrategy}>
              {draggableQueue.map((item) => (
                <SortableTrackItem
                  key={item.id}
                  item={item}
                  idx={positionById.get(item.id) ?? 0}
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
                    idx={positionById.get(activeDragId!) ?? 0}
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
