// components/feedback/AppFeedback.tsx — Unified Error & Warning display component
// Translates technical/internal error strings into human-readable messages.

import React from "react";
import { AlertCircle, AlertTriangle, Info, CheckCircle, RefreshCw } from "lucide-react";
import { cn } from "../../lib/utils";

export type FeedbackSeverity = "error" | "warning" | "info" | "success";

interface AppFeedbackProps {
  message: string | null | undefined;
  severity?: FeedbackSeverity;
  className?: string;
  onRetry?: () => void;
  onDismiss?: () => void;
}

const ERROR_TRANSLATIONS: Record<string, string> = {
  "DecodeAudioData failed": "Unable to process audio file format. Please try another track.",
  "CORS error": "Network security prevented loading audio from this source.",
  "Failed to fetch": "Connection lost. Please check your internet connection.",
  "NetworkError when attempting to fetch resource": "Network error. Reconnecting...",
  "The play() request was interrupted by a new load request": "Switching tracks...",
  "NotAllowedError": "Autoplay blocked by your browser. Click anywhere to enable audio.",
  "YouTube Proxy failed": "YouTube audio stream failed. Please try a different song or server.",
  "Playlist not found or empty": "This playlist is private or has no playable songs.",
  "Invalid YouTube URL": "Please enter a valid YouTube video link.",
};

export function formatHumanMessage(rawMessage: string | null | undefined): string {
  if (!rawMessage) return "An unexpected error occurred.";
  for (const [key, humanText] of Object.entries(ERROR_TRANSLATIONS)) {
    if (rawMessage.toLowerCase().includes(key.toLowerCase())) {
      return humanText;
    }
  }
  return rawMessage;
}

export function AppFeedback({
  message,
  severity = "error",
  className,
  onRetry,
  onDismiss,
}: AppFeedbackProps) {
  if (!message) return null;

  const humanMessage = formatHumanMessage(message);

  const styleMap = {
    error: {
      container: "border-red-500/30 bg-red-500/10 text-red-200",
      icon: <AlertCircle className="w-4 h-4 text-red-400 shrink-0" />,
    },
    warning: {
      container: "border-amber-500/30 bg-amber-500/10 text-amber-200",
      icon: <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0" />,
    },
    info: {
      container: "border-blue-500/30 bg-blue-500/10 text-blue-200",
      icon: <Info className="w-4 h-4 text-blue-400 shrink-0" />,
    },
    success: {
      container: "border-emerald-500/30 bg-emerald-500/10 text-emerald-200",
      icon: <CheckCircle className="w-4 h-4 text-emerald-400 shrink-0" />,
    },
  };

  const currentStyle = styleMap[severity];

  return (
    <div
      className={cn(
        "flex items-center justify-between gap-3 rounded-2xl border px-4 py-3 text-xs font-medium backdrop-blur-xl shadow-lg transition-all",
        currentStyle.container,
        className
      )}
    >
      <div className="flex items-center gap-2.5 min-w-0">
        {currentStyle.icon}
        <span className="truncate">{humanMessage}</span>
      </div>

      <div className="flex items-center gap-2 shrink-0">
        {onRetry && (
          <button
            onClick={onRetry}
            className="flex items-center gap-1 font-bold underline hover:opacity-80 transition-opacity"
          >
            <RefreshCw className="w-3 h-3" /> Retry
          </button>
        )}
        {onDismiss && (
          <button
            onClick={onDismiss}
            className="font-bold opacity-60 hover:opacity-100 transition-opacity px-1"
          >
            ✕
          </button>
        )}
      </div>
    </div>
  );
}
