"use client";

import { useEffect, useState, useRef } from "react";
import { getSocket } from "../lib/socket";
import { Terminal, X, ChevronUp, ChevronDown } from "lucide-react";

interface LogEntry {
  id: string;
  type: "log" | "warn" | "error" | "socket_in" | "socket_out";
  time: string;
  message: string;
}

export function DevConsole() {
  const [allowed, setAllowed] = useState(false);
  const [visible, setVisible] = useState(false);
  const [isHovered, setIsHovered] = useState(false);
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const logsEndRef = useRef<HTMLDivElement>(null);
  
  // High-frequency events we want to ignore in the console
  const IGNORED_EVENTS = ["sync:ping", "sync:pong", "playback:position", "room:state"];

  const deviceName = typeof window !== "undefined" 
    ? (/iPhone|iPad|iPod/.test(navigator.userAgent) ? "📱 iOS" 
      : /Android/.test(navigator.userAgent) ? "📱 Android" 
      : /Macintosh/.test(navigator.userAgent) ? "💻 Mac" 
      : /Windows/.test(navigator.userAgent) ? "💻 Win" 
      : "💻 Web") 
    : "";

  useEffect(() => {
    if (typeof window !== "undefined") {
      const isDev = window.location.hostname === "localhost" || window.location.hostname === "dev.syncbeats.app" || window.location.hostname.includes("192.168.");
      setAllowed(isDev);
    }
  }, []);

  useEffect(() => {
    if (!allowed) return;

    const origLog = console.log;
    const origWarn = console.warn;
    const origError = console.error;

    const addLog = (type: LogEntry["type"], args: any[]) => {
      const message = args.map(a => {
        if (typeof a === "object") {
          try {
            return JSON.stringify(a);
          } catch (e) {
            return "[Object]";
          }
        }
        return String(a);
      }).join(" ");
      
      setLogs(prev => [...prev, {
        id: Math.random().toString(36).slice(2),
        type,
        time: new Date().toLocaleTimeString([], { hour12: false, hour: '2-digit', minute: '2-digit', second: '2-digit', fractionalSecondDigits: 3 }),
        message
      }].slice(-200)); // Keep last 200 logs
    };

    console.log = (...args) => { addLog("log", args); origLog(...args); };
    console.warn = (...args) => { addLog("warn", args); origWarn(...args); };
    console.error = (...args) => { addLog("error", args); origError(...args); };

    const socket = getSocket();
    
    const onAny = (event: string, ...args: any[]) => {
      if (!IGNORED_EVENTS.includes(event)) {
        addLog("socket_in", [`↓ [${event}]`, ...args]);
      }
    };
    
    const onAnyOutgoing = (event: string, ...args: any[]) => {
      if (!IGNORED_EVENTS.includes(event)) {
        addLog("socket_out", [`↑ [${event}]`, ...args]);
      }
    };

    socket.onAny(onAny);
    socket.onAnyOutgoing(onAnyOutgoing);

    return () => {
      console.log = origLog;
      console.warn = origWarn;
      console.error = origError;
      socket.offAny(onAny);
      socket.offAnyOutgoing(onAnyOutgoing);
    };
  }, [allowed]);

  useEffect(() => {
    if (visible && !isHovered && logsEndRef.current) {
      logsEndRef.current.scrollIntoView({ behavior: "smooth" });
    }
  }, [logs, visible, isHovered]);

  if (!allowed) return null;

  return (
    <div className="fixed bottom-0 right-0 z-[9999] p-4 pointer-events-none w-full max-w-md">
      {!visible && (
        <button
          onClick={() => setVisible(true)}
          className="ml-auto pointer-events-auto flex items-center gap-2 bg-black/80 backdrop-blur-md border border-[#FF0000]/30 text-white px-3 py-2 rounded-xl text-xs font-mono shadow-xl hover:bg-black transition-colors"
        >
          <Terminal className="w-4 h-4 text-[#FF0000]" /> {deviceName} Console
        </button>
      )}

      {visible && (
        <div 
          className="pointer-events-auto w-full bg-black/95 backdrop-blur-xl border border-white/10 shadow-2xl rounded-2xl overflow-hidden flex flex-col h-[50vh] max-h-[400px]"
          onMouseEnter={() => setIsHovered(true)}
          onMouseLeave={() => setIsHovered(false)}
          onTouchStart={() => setIsHovered(true)}
          onTouchEnd={() => setIsHovered(false)}
        >
          <div className="flex items-center justify-between px-3 py-2 border-b border-white/10 bg-white/5 shrink-0">
            <div className="flex items-center gap-2 text-white/80 text-xs font-mono">
              <Terminal className="w-4 h-4 text-[#FF0000]" />
              <span>{deviceName} {isHovered && <span className="text-yellow-400 text-[10px] ml-1">(Paused)</span>}</span>
            </div>
            <div className="flex items-center gap-2">
              <button onClick={() => setLogs([])} className="text-white/40 hover:text-white text-xs px-2 py-1 rounded bg-white/5">Clear</button>
              <button onClick={() => setVisible(false)} className="text-white/40 hover:text-white p-1 bg-white/5 rounded"><ChevronDown className="w-4 h-4" /></button>
            </div>
          </div>
          
          <div className="flex-1 overflow-y-auto p-2 font-mono text-[10px] sm:text-xs space-y-1 custom-scrollbar">
            {logs.length === 0 ? (
              <div className="text-white/30 text-center py-4">Waiting for logs...</div>
            ) : (
              logs.map((log) => (
                <div key={log.id} className="flex gap-2 items-start break-words border-b border-white/5 pb-1">
                  <span className="text-white/30 shrink-0">[{log.time}]</span>
                  <span className={`flex-1 ${
                    log.type === 'error' ? 'text-red-400' :
                    log.type === 'warn' ? 'text-yellow-400' :
                    log.type === 'socket_in' ? 'text-cyan-400' :
                    log.type === 'socket_out' ? 'text-emerald-400' :
                    'text-white/80'
                  }`}>
                    {log.message}
                  </span>
                </div>
              ))
            )}
            <div ref={logsEndRef} />
          </div>
        </div>
      )}
    </div>
  );
}
