"use client";

import { useEffect, useState, useRef } from "react";
import { getSocket } from "../lib/socket";
import { Terminal, X, ChevronUp, ChevronDown, Activity, AlignLeft } from "lucide-react";

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
  const [activeTab, setActiveTab] = useState<"logs" | "sync">("logs");
  const [consoleLogs, setConsoleLogs] = useState<LogEntry[]>([]);
  const [syncLogs, setSyncLogs] = useState<LogEntry[]>([]);
  
  const consoleEndRef = useRef<HTMLDivElement>(null);
  const syncEndRef = useRef<HTMLDivElement>(null);
  
  // High-frequency events we ignore in the general "logs" tab but keep in "sync"
  const IGNORED_EVENTS = ["sync:ping", "sync:pong", "playback:position", "room:state"];

  const deviceName = typeof window !== "undefined" 
    ? (/iPhone|iPad|iPod/.test(navigator.userAgent) ? "iOS" 
      : /Android/.test(navigator.userAgent) ? "Android" 
      : /Macintosh/.test(navigator.userAgent) ? "Mac" 
      : /Windows/.test(navigator.userAgent) ? "Win" 
      : "Web") 
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

    const formatArgs = (args: any[]) => args.map(a => {
      if (typeof a === "object") {
        try {
          return JSON.stringify(a);
        } catch (e) {
          return "[Object]";
        }
      }
      return String(a);
    }).join(" ");

    const createLog = (type: LogEntry["type"], msg: string): LogEntry => ({
      id: Math.random().toString(36).slice(2),
      type,
      time: new Date().toLocaleTimeString([], { hour12: false, hour: '2-digit', minute: '2-digit', second: '2-digit', fractionalSecondDigits: 3 }),
      message: msg
    });

    console.log = (...args) => { setConsoleLogs(p => [...p, createLog("log", formatArgs(args))].slice(-200)); origLog(...args); };
    console.warn = (...args) => { setConsoleLogs(p => [...p, createLog("warn", formatArgs(args))].slice(-200)); origWarn(...args); };
    console.error = (...args) => { setConsoleLogs(p => [...p, createLog("error", formatArgs(args))].slice(-200)); origError(...args); };

    const socket = getSocket();
    
    const onAny = (event: string, ...args: any[]) => {
      const log = createLog("socket_in", `↓ [${event}] ${formatArgs(args)}`);
      setSyncLogs(p => [...p, log].slice(-300));
      if (!IGNORED_EVENTS.includes(event)) {
        setConsoleLogs(p => [...p, log].slice(-200));
      }
    };
    
    const onAnyOutgoing = (event: string, ...args: any[]) => {
      const log = createLog("socket_out", `↑ [${event}] ${formatArgs(args)}`);
      setSyncLogs(p => [...p, log].slice(-300));
      if (!IGNORED_EVENTS.includes(event)) {
        setConsoleLogs(p => [...p, log].slice(-200));
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
    if (visible && !isHovered) {
      if (activeTab === "logs" && consoleEndRef.current) consoleEndRef.current.scrollIntoView({ behavior: "smooth" });
      if (activeTab === "sync" && syncEndRef.current) syncEndRef.current.scrollIntoView({ behavior: "smooth" });
    }
  }, [consoleLogs, syncLogs, visible, isHovered, activeTab]);

  if (!allowed) return null;

  const currentLogs = activeTab === "logs" ? consoleLogs : syncLogs;

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
          <div className="flex items-center justify-between px-2 pt-2 border-b border-white/10 bg-white/5 shrink-0">
            <div className="flex gap-1 h-full">
              <button 
                onClick={() => setActiveTab("logs")}
                className={`px-3 py-2 text-xs font-mono font-bold flex items-center gap-1.5 border-b-2 transition-colors ${activeTab === 'logs' ? 'text-white border-[#FF0000]' : 'text-white/40 border-transparent hover:text-white/80'}`}
              >
                <AlignLeft className="w-3.5 h-3.5" /> Logs
              </button>
              <button 
                onClick={() => setActiveTab("sync")}
                className={`px-3 py-2 text-xs font-mono font-bold flex items-center gap-1.5 border-b-2 transition-colors ${activeTab === 'sync' ? 'text-white border-[#FF0000]' : 'text-white/40 border-transparent hover:text-white/80'}`}
              >
                <Activity className="w-3.5 h-3.5" /> Sync Engine
              </button>
            </div>
            <div className="flex items-center gap-2 pb-1">
              <span className="text-white/40 text-[10px] font-mono mr-2">{deviceName} {isHovered && <span className="text-yellow-400 ml-1">(Paused)</span>}</span>
              <button onClick={() => activeTab === 'logs' ? setConsoleLogs([]) : setSyncLogs([])} className="text-white/40 hover:text-white text-[10px] px-2 py-1 rounded bg-white/5 font-mono uppercase tracking-wider">Clear</button>
              <button onClick={() => setVisible(false)} className="text-white/40 hover:text-white p-1 bg-white/5 rounded mr-1"><ChevronDown className="w-4 h-4" /></button>
            </div>
          </div>
          
          <div className="flex-1 overflow-y-auto p-2 font-mono text-[10px] sm:text-xs space-y-1 custom-scrollbar">
            {currentLogs.length === 0 ? (
              <div className="text-white/30 text-center py-4">Waiting for {activeTab}...</div>
            ) : (
              currentLogs.map((log) => (
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
            <div ref={activeTab === 'logs' ? consoleEndRef : syncEndRef} />
          </div>
        </div>
      )}
    </div>
  );
}
