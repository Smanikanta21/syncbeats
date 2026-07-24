"use client";

import { useState, useEffect, useRef } from "react";
import { Send, MessageSquare, X, Smile, Sparkles } from "lucide-react";
import { getSocket } from "../../lib/socket";
import { ThemeToggle } from "../ThemeToggle";
import { cn } from "../../lib/utils";
import type { Participant } from "../../lib/types";

export interface ChatMessage {
  id: string;
  roomId?: string;
  socketId: string;
  userId?: string;
  displayName: string;
  message: string;
  timestamp: number;
}

interface RoomChatProps {
  roomId: string;
  mySocketId: string | null;
  myUserId?: string | null;
  participants: Participant[];
  onClose?: () => void;
  className?: string;
}

const EMOJI_REACTIONS = ["🔥", "❤️", "🎉", "👏", "🎵", "🙌", "🚀", "⚡"];

// Module-level cache so chat messages persist across tab switches in a room session
const roomChatCache: Record<string, ChatMessage[]> = {};

export function RoomChat({ roomId, mySocketId, myUserId, participants, onClose, className }: RoomChatProps) {
  const socket = getSocket();
  const [messages, setMessages] = useState<ChatMessage[]>(() => roomChatCache[roomId] || []);
  const [input, setInput] = useState("");
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  useEffect(() => {
    const handleChat = (msg: ChatMessage) => {
      setMessages((prev) => {
        if (prev.some((m) => m.id === msg.id)) return prev;
        const next = [...prev, msg];
        roomChatCache[roomId] = next;
        return next;
      });
    };

    const handleHistory = (data: { roomId: string; messages: ChatMessage[] }) => {
      if (data.roomId === roomId && Array.isArray(data.messages)) {
        setMessages((prev) => {
          const map = new Map<string, ChatMessage>();
          // Combine stored history and current messages
          data.messages.concat(prev).forEach((m) => map.set(m.id, m));
          const sorted = Array.from(map.values()).sort((a, b) => a.timestamp - b.timestamp);
          roomChatCache[roomId] = sorted;
          return sorted;
        });
      }
    };

    socket.on("room:chat", handleChat);
    socket.on("room:chat_history", handleHistory);

    // Request chat history from room backend on mount
    socket.emit("room:get_chat_history", { roomId });

    return () => {
      socket.off("room:chat", handleChat);
      socket.off("room:chat_history", handleHistory);
    };
  }, [socket, roomId]);

  const handleSend = (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    const text = input.trim();
    if (!text || !roomId) return;

    socket.emit("room:chat", { roomId, message: text });
    setInput("");
  };

  const sendReaction = (emoji: string) => {
    if (!roomId) return;
    socket.emit("room:reaction", { roomId, emoji });
    if (typeof window !== "undefined") {
      window.dispatchEvent(new CustomEvent("syncbeats:reaction", { detail: { emoji } }));
    }
  };

  return (
    <div className={cn("flex flex-col h-full w-full bg-background/90 dark:bg-black/90 backdrop-blur-2xl border border-foreground/10 rounded-3xl overflow-hidden shadow-2xl relative select-none", className)}>
      {/* Header Bar */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-foreground/10 bg-foreground/5 shrink-0">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-xl bg-foreground/10 flex items-center justify-center">
            <MessageSquare className="w-4 h-4 text-foreground/80" />
          </div>
          <div>
            <h3 className="text-sm font-black text-foreground tracking-tight flex items-center gap-2">
              Room Chat
              <span className="px-2 py-0.5 rounded-full bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 text-[9px] font-bold uppercase tracking-wider flex items-center gap-1">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                {participants.length} online
              </span>
            </h3>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {onClose && (
            <button
              onClick={onClose}
              className="p-1.5 rounded-full bg-foreground/5 hover:bg-foreground/10 text-foreground/50 hover:text-foreground transition-colors"
              title="Close"
            >
              <X className="w-4 h-4" />
            </button>
          )}
        </div>
      </div>

      {/* Quick Emoji Reaction Bar */}
      <div className="flex items-center gap-1.5 px-3 py-2 border-b border-foreground/5 bg-foreground/[0.02] overflow-x-auto shrink-0 no-scrollbar">
        <Smile className="w-4 h-4 text-foreground/30 shrink-0 ml-1" />
        {EMOJI_REACTIONS.map((emoji) => (
          <button
            key={emoji}
            onClick={() => sendReaction(emoji)}
            className="px-2.5 py-1 rounded-xl bg-foreground/5 hover:bg-foreground/15 text-sm transition-transform active:scale-125 shrink-0"
            title={`Send ${emoji} Reaction`}
          >
            {emoji}
          </button>
        ))}
      </div>

      {/* Messages Stream Area */}
      <div className="flex-1 overflow-y-auto p-4 space-y-3 min-h-0 custom-scrollbar" data-lenis-prevent="true">
        {messages.length === 0 ? (
          <div className="h-full flex flex-col items-center justify-center text-center p-6 text-foreground/40">
            <Sparkles className="w-10 h-10 mb-2 opacity-30 animate-pulse" />
            <p className="text-xs font-bold uppercase tracking-wider">No messages yet</p>
            <p className="text-[11px] text-foreground/30 mt-1">Say hello to everyone connected to this room!</p>
          </div>
        ) : (
          messages.map((msg) => {
            const isMe = Boolean(
              (msg.userId && myUserId && msg.userId === myUserId) ||
              (mySocketId && msg.socketId === mySocketId)
            );
            const initials = (msg.displayName || "User").slice(0, 2).toUpperCase();
            const timeStr = new Date(msg.timestamp).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });

            return (
              <div
                key={msg.id}
                className={cn("flex flex-col max-w-[85%]", isMe ? "ml-auto items-end" : "mr-auto items-start")}
              >
                <div className="flex items-center gap-1.5 mb-1 px-1">
                  {!isMe && (
                    <span className="w-4 h-4 rounded-full bg-foreground/10 text-[8px] font-black flex items-center justify-center text-foreground/70">
                      {initials}
                    </span>
                  )}
                  <span className="text-[10px] font-bold text-foreground/60">{isMe ? "You" : msg.displayName}</span>
                  <span className="text-[9px] text-foreground/30">{timeStr}</span>
                </div>
                <div
                  className={cn(
                    "px-4 py-2.5 rounded-2xl text-xs font-medium leading-relaxed break-words shadow-sm transition-all",
                    isMe
                      ? "bg-foreground text-background font-semibold rounded-tr-xs"
                      : "bg-foreground/10 text-foreground border border-foreground/10 rounded-tl-xs"
                  )}
                >
                  {msg.message}
                </div>
              </div>
            );
          })
        )}
        <div ref={messagesEndRef} />
      </div>

      {/* Input Form Bar */}
      <form onSubmit={handleSend} className="p-3 border-t border-foreground/10 bg-foreground/5 shrink-0 flex items-center pr-20 md:pr-3">
        <div className="relative flex-1 flex items-center">
          <input
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="Type a message..."
            className="w-full bg-foreground/5 border border-foreground/10 rounded-2xl pl-4 pr-11 py-2.5 text-[16px] md:text-xs text-foreground placeholder:text-foreground/40 outline-none focus:border-foreground/30 transition-colors"
          />
          <button
            type="submit"
            disabled={!input.trim()}
            className="absolute right-1.5 w-8 h-8 rounded-xl bg-primary text-primary-foreground flex items-center justify-center disabled:opacity-30 transition-all hover:scale-105 active:scale-95 shrink-0 cursor-pointer"
            title="Send Message"
          >
            <Send className="w-3.5 h-3.5" />
          </button>
        </div>
      </form>
    </div>
  );
}
