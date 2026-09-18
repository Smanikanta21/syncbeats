"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import { createPortal } from "react-dom";
import { motion } from "framer-motion";
import { getSocket } from "../../lib/socket";

interface Reaction {
  id: string;
  emoji: string;
  count: number;
  lastUpdated: number;
  /** Viewport position in %, assigned once on spawn so bubbles don't stack */
  x: number;
  y: number;
  socketId?: string;
  userId?: string;
  displayName?: string;
}

interface FlyingEmoji {
  id: string;
  emoji: string;
  startX: number;
  startY: number;
  targetX: number;
  targetY: number;
  data: Reaction;
}

// Target the exact position where the latest chat message appears
function getChatBoxTarget(): { x: number; y: number } | null {
  // Try to target the messages-end anchor inside the chat box
  const msgEnd = document.getElementById("room-chat-messages-end");
  const chatBox = document.getElementById("room-chat-box");

  if (msgEnd && chatBox) {
    const msgRect = msgEnd.getBoundingClientRect();
    const boxRect = chatBox.getBoundingClientRect();
    // The anchor is a zero-height marker at the end of the scroll list, so it
    // can sit above the box (short list) or below it (scrolled up) — clamp into
    // the visible box rather than only guarding the top edge.
    const minY = boxRect.top + 40;
    const maxY = Math.max(minY, boxRect.bottom - 100);
    return {
      x: boxRect.left + boxRect.width / 2, // center of chat column
      y: Math.min(Math.max(msgRect.top, minY), maxY),
    };
  }

  if (chatBox) {
    const rect = chatBox.getBoundingClientRect();
    return {
      x: rect.left + rect.width / 2,
      y: rect.bottom - 100,
    };
  }

  return null;
}

// Portal flying emoji — rendered directly on body, unclipped by any parent
function FlyingEmojiPortal({
  flying,
  onComplete,
}: {
  flying: FlyingEmoji;
  onComplete: (id: string, data: Reaction) => void;
}) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;

    const { startX, startY, targetX, targetY } = flying;

    const dx = targetX - startX;
    const dy = targetY - startY;
    const arcDx = dx / 2;
    const arcDy = dy / 2 - 150;

    const keyframes: Keyframe[] = [
      { transform: "translate(0px, 0px) scale(1)", opacity: "1" },
      // arc peak
      { transform: `translate(${arcDx}px, ${arcDy}px) scale(0.95)`, opacity: "1", offset: 0.5 },
      // snap to destination — emoji stays raw the whole time
      { transform: `translate(${dx}px, ${dy}px) scale(0.9)`, opacity: "1" },
    ];

    const anim = el.animate(keyframes, {
      duration: 600,
      easing: "cubic-bezier(0.4, 0, 0.2, 1)",
      fill: "forwards", // hold the landing position until React unmounts us,
                        // otherwise the element snaps back to its origin for a
                        // frame between `finish` and the state update
    });

    let done = false;
    anim.addEventListener("finish", () => {
      if (!done) { done = true; onComplete(flying.id, flying.data); }
    });
    return () => anim.cancel();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return createPortal(
    <div
      ref={ref}
      className="fixed pointer-events-none text-6xl select-none drop-shadow-2xl"
      style={{
        top: `${flying.startY}px`,
        left: `${flying.startX}px`,
        zIndex: 999999,
        willChange: "transform, opacity",
      }}
    >
      {flying.emoji}
    </div>,
    document.body
  );
}

// Individual stationary reaction bubble
function ReactionBubble({
  reaction,
  onSnap,
}: {
  reaction: Reaction;
  onSnap: (data: Reaction, rect: DOMRect) => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const snappedRef = useRef(false);
  const scale = Math.min(1 + (reaction.count - 1) * 0.25, 4);

  useEffect(() => {
    const checkExpiry = () => {
      if (snappedRef.current) return;
      if (Date.now() - reaction.lastUpdated > 4000) {
        snappedRef.current = true;
        const rect = ref.current?.getBoundingClientRect();
        if (rect) onSnap(reaction, rect);
      }
    };
    const interval = setInterval(checkExpiry, 300);
    return () => clearInterval(interval);
  }, [reaction.lastUpdated, onSnap]);

  const handleDragEnd = () => {
    if (snappedRef.current) return;
    snappedRef.current = true;
    const rect = ref.current?.getBoundingClientRect();
    if (rect) onSnap(reaction, rect);
  };

  return (
    <motion.div
      ref={ref}
      initial={{ opacity: 0, scale: 0.3 }}
      animate={{ opacity: 1, scale }}
      exit={{ opacity: 0, scale: 0, transition: { duration: 0.1 } }}
      transition={{ type: "spring", stiffness: 280, damping: 20 }}
      drag
      dragMomentum={false}
      whileDrag={{ scale: scale * 1.1 }}
      onDragEnd={handleDragEnd}
      className="text-7xl select-none drop-shadow-2xl cursor-grab active:cursor-grabbing flex items-center justify-center relative pointer-events-auto"
    >
      {reaction.emoji}
      {reaction.count > 1 && (
        <motion.span
          key={reaction.count}
          initial={{ scale: 0.5, opacity: 0, y: 10 }}
          animate={{ scale: 1, opacity: 1, y: 0 }}
          transition={{ type: "spring", stiffness: 400, damping: 10 }}
          className="absolute -top-3 -right-6 bg-foreground text-background text-[11px] font-black px-2 py-0.5 rounded-full shadow-xl"
        >
          x{reaction.count}
        </motion.span>
      )}
    </motion.div>
  );
}

export function RoomReactions() {
  const [reactions, setReactions] = useState<Record<string, Reaction>>({});
  const [flyingEmojis, setFlyingEmojis] = useState<FlyingEmoji[]>([]);

  const addReaction = useCallback(
    (data: { emoji: string; socketId?: string; userId?: string; displayName?: string }) => {
      setReactions((prev) => {
        const next = { ...prev };
        const existing = next[data.emoji];
        if (existing) {
          next[data.emoji] = {
            ...existing,
            count: existing.count + 1,
            lastUpdated: Date.now(),
          };
        } else {
          next[data.emoji] = {
            id: data.emoji,
            emoji: data.emoji,
            count: 1,
            lastUpdated: Date.now(),
            // Scatter across the middle of the viewport — bubbles grow up to 4x
            // and are draggable, so keep them clear of the edges.
            x: 20 + Math.random() * 60,
            y: 30 + Math.random() * 40,
            socketId: data.socketId,
            userId: data.userId,
            displayName: data.displayName,
          };
        }
        return next;
      });
    },
    []
  );

  const handleSnap = useCallback((data: Reaction, emojiRect: DOMRect) => {
    const target = getChatBoxTarget();

    // Remove from floating state immediately
    setReactions((prev) => {
      const n = { ...prev };
      delete n[data.emoji];
      return n;
    });

    if (!target) {
      // No chat box — just dispatch
      window.dispatchEvent(new CustomEvent("syncbeats:reaction_snap", { detail: data }));
      return;
    }

    const startX = emojiRect.left + emojiRect.width / 2;
    const startY = emojiRect.top + emojiRect.height / 2;

    const flyId = `fly-${Date.now()}-${data.emoji}`;
    setFlyingEmojis((prev) => [
      ...prev,
      {
        id: flyId,
        emoji: data.emoji,
        startX: startX - 36,  // offset so element appears centered on emoji
        startY: startY - 36,
        targetX: target.x - 40, // target center of bubble
        targetY: target.y - 28,
        data,
      },
    ]);
  }, []);

  const handleFlyComplete = useCallback((flyId: string, data: Reaction) => {
    window.dispatchEvent(
      new CustomEvent("syncbeats:reaction_snap", {
        detail: {
          emoji: data.emoji,
          socketId: data.socketId,
          userId: data.userId,
          displayName: data.displayName,
        },
      })
    );
    setFlyingEmojis((prev) => prev.filter((f) => f.id !== flyId));
  }, []);

  useEffect(() => {
    const socket = getSocket();

    const handleLocalReaction = (e: Event) => {
      const customEvent = e as CustomEvent;
      if (customEvent.detail?.emoji) addReaction(customEvent.detail);
    };

    const handleSocketReaction = (data: {
      emoji: string;
      socketId?: string;
      userId?: string;
      displayName?: string;
    }) => addReaction(data);

    window.addEventListener("syncbeats:reaction", handleLocalReaction);
    socket.on("room:reaction", handleSocketReaction);

    return () => {
      window.removeEventListener("syncbeats:reaction", handleLocalReaction);
      socket.off("room:reaction", handleSocketReaction);
    };
  }, [addReaction]);

  return (
    <>
      {/* Stationary floating reactions */}
      <div className="fixed inset-0 pointer-events-none z-[99998]">
        {Object.values(reactions).map((reaction) => (
          <div
            key={reaction.id}
            className="absolute -translate-x-1/2 -translate-y-1/2"
            style={{ left: `${reaction.x}%`, top: `${reaction.y}%` }}
          >
            <ReactionBubble reaction={reaction} onSnap={handleSnap} />
          </div>
        ))}
      </div>

      {/* Flying emojis rendered on document.body via portal — completely unclipped */}
      {flyingEmojis.map((flying) => (
        <FlyingEmojiPortal
          key={flying.id}
          flying={flying}
          onComplete={handleFlyComplete}
        />
      ))}
    </>
  );
}
