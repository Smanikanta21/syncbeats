"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Send } from "lucide-react";
import { getSocket } from "../../lib/socket";

const EMOJIS = ["❤️", "🔥", "💀", "🎵", "😂", "🤯", "⚡", "👏"];

interface FloatingEmoji {
  id: string;
  emoji: string;
  x: number; // 0..100%
}

export interface ChatMessage {
  id: string;
  socketId: string;
  displayName: string;
  message: string;
  timestamp: number;
}

interface EmojiReactionsProps {
  roomId: string;
}

export function EmojiReactions({ roomId }: EmojiReactionsProps) {
  const [floaters, setFloaters] = useState<FloatingEmoji[]>([]);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [inputText, setInputText] = useState("");
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const idRef = useRef(0);

  const spawnEmoji = useCallback((emoji: string) => {
    const id = `emoji-${idRef.current++}`;
    const x = 10 + Math.random() * 80; // avoid edges
    setFloaters(prev => [...prev, { id, emoji, x }]);
    setTimeout(() => {
      setFloaters(prev => prev.filter(f => f.id !== id));
    }, 2500);
  }, []);

  const sendReaction = useCallback((emoji: string) => {
    spawnEmoji(emoji);
    const socket = getSocket();
    socket.emit("room:reaction", { roomId, emoji });
  }, [roomId, spawnEmoji]);

  const sendChat = useCallback((e: React.FormEvent) => {
    e.preventDefault();
    if (!inputText.trim()) return;
    const socket = getSocket();
    socket.emit("room:chat", { roomId, message: inputText.trim() });
    setInputText("");
  }, [roomId, inputText]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  useEffect(() => {
    const socket = getSocket();
    
    const onReaction = ({ emoji }: { emoji: string }) => spawnEmoji(emoji);
    const onChat = (msg: ChatMessage) => {
      setMessages(prev => [...prev, msg]);
    };
    
    socket.on("room:reaction", onReaction);
    socket.on("room:chat", onChat);
    
    return () => { 
      socket.off("room:reaction", onReaction); 
      socket.off("room:chat", onChat);
    };
  }, [spawnEmoji]);

  return (
    <div className="md:flex-1 md:min-h-0 md:flex md:flex-col relative w-full">
      {/* Floating emojis container */}
      <div className="absolute bottom-full left-0 right-0 h-32 md:absolute md:bottom-[50px] md:h-[120px] pointer-events-none overflow-hidden rounded-lg z-50">
        <AnimatePresence>
          {floaters.map(f => (
            <motion.div
              key={f.id}
              initial={{ opacity: 1, y: 0, scale: 0.6 }}
              animate={{ opacity: 0, y: -100, scale: 1.4 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 2.4, ease: [0.2, 0.8, 0.4, 1] }}
              className="absolute bottom-0 text-2xl select-none"
              style={{ left: `${f.x}%` }}
            >
              {f.emoji}
            </motion.div>
          ))}
        </AnimatePresence>
      </div>
      
      {/* Chat Area (Blurred / Coming Soon) */}
      <div className="hidden md:flex flex-1 min-h-0 flex-col relative mb-3">
        <div className="absolute inset-0 z-10 backdrop-blur-md bg-background/20 rounded-xl flex items-center justify-center">
          <span className="text-foreground/50 font-bold uppercase tracking-widest text-xs tracking-[0.2em] bg-background/80 px-4 py-2 rounded-full shadow-xl border border-white/5">Coming Soon</span>
        </div>
        
        <div className="flex-1 min-h-0 flex flex-col opacity-30 pointer-events-none overflow-hidden select-none">
          {/* Chat Messages */}
          <div className="flex-1 min-h-0 flex-col overflow-y-auto mb-2 space-y-1.5 scrollbar-thin scrollbar-thumb-foreground/10 scrollbar-track-transparent">
            {messages.map(msg => (
              <div key={msg.id} className="text-[11px] leading-tight">
                <span className="font-bold text-foreground/70 mr-1.5">{msg.displayName}:</span>
                <span className="text-foreground/90 break-words">{msg.message}</span>
              </div>
            ))}
            <div ref={messagesEndRef} />
          </div>

          {/* Input Form */}
          <form onSubmit={sendChat} className="flex items-center gap-2 bg-foreground/5 rounded-full px-3 py-1.5 shrink-0">
            <input
              type="text"
              value={inputText}
              onChange={(e) => setInputText(e.target.value)}
              placeholder="Say something..."
              className="flex-1 min-w-0 bg-transparent text-[11px] outline-none placeholder:text-foreground/40"
              disabled
            />
            <button type="submit" disabled className="text-foreground opacity-50 hover:text-foreground">
              <Send className="w-3.5 h-3.5" />
            </button>
          </form>
        </div>
      </div>

      {/* Emoji strip */}
      <div className="flex items-center justify-between shrink-0">
        {EMOJIS.map(e => (
          <motion.button
            key={e}
            whileTap={{ scale: 0.75 }}
            whileHover={{ scale: 1.3, y: -4 }}
            onClick={() => sendReaction(e)}
            className="text-xl leading-none p-1.5 rounded-xl hover:bg-white/10 transition-colors"
          >
            {e}
          </motion.button>
        ))}
      </div>
    </div>
  );
}
