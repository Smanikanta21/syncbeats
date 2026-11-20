"use client";

/**
 * RoomCodeEntry
 *
 * The join flow, carried over verbatim from CircularJoinRing: 4+ characters,
 * upper-cased, straight to `/room/CODE`; clipboard paste while the field is
 * empty. The field does not auto-focus, so opening the hub never steals the
 * pointer or opens a mobile keyboard unexpectedly.
 *
 * The four concentric spinning rings and orbiting device icons are gone — the
 * hero graphic is the WebGL field now, and the ring was competing with it. The
 * field waits for an intentional tap instead of stealing focus on page load.
 */

import { useState, ChangeEvent, FormEvent } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { ArrowRight, Clipboard } from "lucide-react";
import { useRouter } from "next/navigation";
import { cn } from "@/lib/utils";

export function RoomCodeEntry({ className }: { className?: string }) {
  const router = useRouter();
  const [joinCode, setJoinCode] = useState("");

  const handleJoin = (e: FormEvent) => {
    e.preventDefault();
    if (joinCode.trim().length >= 4) {
      router.push(`/room/${joinCode.trim().toUpperCase()}`);
    }
  };

  const handlePasteClipboard = async () => {
    try {
      if (navigator.clipboard) {
        const text = await navigator.clipboard.readText();
        const cleaned = text.trim().toUpperCase().slice(0, 6);
        if (cleaned) setJoinCode(cleaned);
      }
    } catch {}
  };

  const ready = joinCode.trim().length >= 4;

  return (
    <form
      onSubmit={handleJoin}
      className={cn(
        "group glass-panel relative flex items-center gap-2 rounded-2xl border p-2 pl-4 transition-shadow duration-500",
        "border-foreground/10 focus-within:border-(--accent-border)",
        "focus-within:shadow-[0_0_0_4px_var(--accent-glow)]",
        className,
      )}
    >
      <label
        htmlFor="room-code"
        className="text-data font-semibold text-foreground/45 select-none"
      >
        Code
      </label>

      <input
        id="room-code"
        name="syncbeats-room-join-code"
        type="text"
        inputMode="text"
        maxLength={6}
        value={joinCode}
        onChange={(e: ChangeEvent<HTMLInputElement>) => setJoinCode(e.target.value.toUpperCase())}
        placeholder="––––––"
        autoComplete="off"
        autoCorrect="off"
        autoCapitalize="none"
        spellCheck="false"
        data-1p-ignore="true"
        data-lpignore="true"
        data-form-type="other"
        className="w-[7ch] bg-transparent font-mono text-xl font-semibold outline-none placeholder:text-foreground/20"
      />

      <AnimatePresence initial={false}>
        {joinCode.length === 0 ? (
          <motion.button
            key="paste"
            type="button"
            onClick={handlePasteClipboard}
            initial={{ opacity: 0, scale: 0.8 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.8 }}
            transition={{ duration: 0.18 }}
            className="ml-auto flex items-center gap-1.5 rounded-xl bg-foreground/5 px-3 py-2.5 text-data font-semibold text-foreground/50 transition-colors hover:bg-foreground/10 hover:text-foreground/80"
          >
            <Clipboard className="h-3.5 w-3.5" />
            Paste
          </motion.button>
        ) : (
          <motion.button
            key="go"
            type="submit"
            disabled={!ready}
            initial={{ opacity: 0, scale: 0.8 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.8 }}
            transition={{ type: "spring", bounce: 0.4, duration: 0.35 }}
            aria-label="Join room"
            className="ml-auto flex h-10 w-10 items-center justify-center rounded-xl text-background transition-opacity disabled:opacity-40"
            style={{ background: "var(--accent-gradient)" }}
          >
            <ArrowRight className="h-4.5 w-4.5" />
          </motion.button>
        )}
      </AnimatePresence>
    </form>
  );
}
