"use client";

import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Star, X, MessageSquare, Check, Loader2, Sparkles } from "lucide-react";
import { useAsync } from "../hooks/useAsync";
import { submitFeedback } from "../lib/feedbackApi";
import { cn } from "../lib/utils";

interface FeedbackModalProps {
  isOpen: boolean;
  onClose: () => void;
  pageName?: string;
  sessionId?: string;
}

const CATEGORIES = [
  { id: "general", label: "General" },
  { id: "audio", label: "Audio Quality" },
  { id: "sync", label: "Syncing" },
  { id: "ui", label: "UI / Design" },
  { id: "bug", label: "Bug Report" },
] as const;

export function FeedbackModal({ isOpen, onClose, pageName, sessionId }: FeedbackModalProps) {
  const [rating, setRating] = useState<number>(5);
  const [hoverRating, setHoverRating] = useState<number>(0);
  const [category, setCategory] = useState<"general" | "audio" | "sync" | "ui" | "bug">("general");
  const [comment, setComment] = useState("");
  const [isSuccess, setIsSuccess] = useState(false);

  const submitAsync = useAsync(async () => {
    await submitFeedback({
      rating,
      category,
      comment: comment.trim() || undefined,
      page: pageName || typeof window !== "undefined" ? window.location.pathname : undefined,
      sessionId,
    });
    setIsSuccess(true);
    setTimeout(() => {
      setIsSuccess(false);
      onClose();
    }, 1500);
  });

  if (!isOpen) return null;

  return (
    <AnimatePresence>
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-background/80 backdrop-blur-md">
        <motion.div
          initial={{ opacity: 0, scale: 0.95, y: 15 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.95, y: 15 }}
          transition={{ type: "spring", stiffness: 350, damping: 28 }}
          className={cn(
            "w-full max-w-md rounded-3xl border border-foreground/10 bg-background/95 p-6 shadow-2xl relative overflow-hidden",
            submitAsync.isPending && "cursor-wait pointer-events-none"
          )}
        >
          {/* Top Close Button */}
          <button
            onClick={onClose}
            disabled={submitAsync.isPending}
            className="absolute top-5 right-5 p-2 rounded-full text-foreground/50 hover:text-foreground hover:bg-foreground/5 transition-colors disabled:opacity-40"
          >
            <X className="w-5 h-5" />
          </button>

          {isSuccess ? (
            <div className="py-8 flex flex-col items-center justify-center text-center space-y-3">
              <div className="w-14 h-14 rounded-full bg-emerald-500/20 text-emerald-400 flex items-center justify-center border border-emerald-500/30">
                <Check className="w-7 h-7" />
              </div>
              <h3 className="text-xl font-bold text-foreground">Thank you for rating!</h3>
              <p className="text-sm text-foreground/60">Your feedback helps us make SyncBeats better.</p>
            </div>
          ) : (
            <div className="space-y-5">
              {/* Header */}
              <div>
                <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-amber-400">
                  <Sparkles className="w-4 h-4" /> Rate your experience
                </div>
                <h2 className="text-2xl font-black text-foreground mt-1">How are we doing?</h2>
                <p className="text-xs text-foreground/60 mt-1">
                  Rate your session and let us know what we can improve.
                </p>
              </div>

              {/* Star Rating */}
              <div className="flex items-center justify-center gap-2 py-2">
                {[1, 2, 3, 4, 5].map((star) => {
                  const active = (hoverRating || rating) >= star;
                  return (
                    <button
                      key={star}
                      type="button"
                      onMouseEnter={() => setHoverRating(star)}
                      onMouseLeave={() => setHoverRating(0)}
                      onClick={() => setRating(star)}
                      disabled={submitAsync.isPending}
                      className="p-1 transition-transform hover:scale-110 active:scale-95 focus:outline-none disabled:cursor-wait"
                    >
                      <Star
                        className={cn(
                          "w-8 h-8 transition-colors",
                          active
                            ? "text-amber-400 fill-amber-400 drop-shadow-[0_0_8px_rgba(251,191,36,0.5)]"
                            : "text-foreground/20 fill-transparent"
                        )}
                      />
                    </button>
                  );
                })}
              </div>

              {/* Category Pills */}
              <div className="space-y-1.5">
                <label className="text-xs font-bold text-foreground/60 uppercase tracking-wider">
                  Category
                </label>
                <div className="flex flex-wrap gap-1.5">
                  {CATEGORIES.map((cat) => (
                    <button
                      key={cat.id}
                      type="button"
                      onClick={() => setCategory(cat.id)}
                      disabled={submitAsync.isPending}
                      className={cn(
                        "px-3 py-1.5 rounded-full text-xs font-semibold transition-all border disabled:cursor-wait",
                        category === cat.id
                          ? "bg-foreground text-background border-foreground shadow-sm"
                          : "bg-foreground/5 text-foreground/70 border-foreground/10 hover:border-foreground/20"
                      )}
                    >
                      {cat.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Comment Textarea */}
              <div className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <label className="text-xs font-bold text-foreground/60 uppercase tracking-wider flex items-center gap-1.5">
                    <MessageSquare className="w-3.5 h-3.5" /> Comments (Private)
                  </label>
                  <span className="text-[10px] text-foreground/40">{comment.length}/500</span>
                </div>
                <textarea
                  value={comment}
                  onChange={(e) => setComment(e.target.value.slice(0, 500))}
                  disabled={submitAsync.isPending}
                  placeholder="Tell us what you liked or what broke..."
                  rows={3}
                  className="w-full rounded-2xl border border-foreground/10 bg-foreground/5 p-3 text-sm text-foreground placeholder:text-foreground/30 focus:border-foreground/30 focus:outline-none transition-colors resize-none disabled:cursor-wait"
                />
              </div>

              {/* Submit Button with Shimmer & Loading State */}
              <button
                type="button"
                onClick={() => submitAsync.run()}
                disabled={submitAsync.isPending}
                className={cn(
                  "w-full h-12 rounded-2xl bg-foreground text-background font-bold text-sm transition-all flex items-center justify-center gap-2 relative overflow-hidden shadow-lg active:scale-98",
                  submitAsync.isPending && "cursor-wait opacity-90"
                )}
              >
                {submitAsync.isPending ? (
                  <>
                    {/* Shimmer loading bar background */}
                    <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/20 to-transparent animate-shimmer" />
                    <Loader2 className="w-5 h-5 animate-spin relative z-10" />
                    <span className="relative z-10">Submitting...</span>
                  </>
                ) : (
                  <span>Submit Rating</span>
                )}
              </button>
            </div>
          )}
        </motion.div>
      </div>
    </AnimatePresence>
  );
}
