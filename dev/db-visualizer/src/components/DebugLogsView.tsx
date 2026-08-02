"use client";

import { useEffect, useState } from "react";

interface LogEntry {
  id: string;
  action: string;
  level: "ERROR" | "WARN" | "INFO" | "SECURITY";
  message: string;
  ip: string;
  timestamp: string;
}

interface LogCounts {
  total: number;
  errors: number;
  warnings: number;
  security: number;
  info: number;
}

export default function DebugLogsView() {
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [counts, setCounts] = useState<LogCounts>({ total: 0, errors: 0, warnings: 0, security: 0, info: 0 });
  const [levelFilter, setLevelFilter] = useState<string>("ALL");
  const [searchTerm, setSearchTerm] = useState<string>("");
  const [autoRefresh, setAutoRefresh] = useState<boolean>(true);
  const [loading, setLoading] = useState<boolean>(true);
  const [selectedLog, setSelectedLog] = useState<LogEntry | null>(null);

  const fetchLogs = async () => {
    try {
      const res = await fetch(`/api/dashboard/logs?level=${levelFilter}`);
      if (res.ok) {
        const data = await res.json();
        setLogs(data.logs || []);
        setCounts(data.counts || { total: 0, errors: 0, warnings: 0, security: 0, info: 0 });
      }
    } catch (err) {
      console.error("[DebugLogs] Fetch error:", err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchLogs();
  }, [levelFilter]);

  useEffect(() => {
    if (!autoRefresh) return;
    const interval = setInterval(fetchLogs, 3000);
    return () => clearInterval(interval);
  }, [autoRefresh, levelFilter]);

  const handleClearLogs = async () => {
    if (!confirm("Are you sure you want to clear all audit debug logs?")) return;
    try {
      const res = await fetch("/api/dashboard/logs", { method: "DELETE" });
      if (res.ok) {
        setLogs([]);
        setCounts({ total: 0, errors: 0, warnings: 0, security: 0, info: 0 });
      }
    } catch (e) {
      alert("Failed to clear logs");
    }
  };

  const filteredLogs = logs.filter((log) => {
    if (!searchTerm) return true;
    const q = searchTerm.toLowerCase();
    return (
      log.action.toLowerCase().includes(q) ||
      log.message.toLowerCase().includes(q) ||
      log.ip.toLowerCase().includes(q) ||
      log.level.toLowerCase().includes(q)
    );
  });

  const getLevelBadgeClass = (level: string) => {
    switch (level) {
      case "ERROR":
        return "bg-red-500/20 text-red-400 border-red-500/30";
      case "WARN":
        return "bg-amber-500/20 text-amber-400 border-amber-500/30";
      case "SECURITY":
        return "bg-purple-500/20 text-purple-400 border-purple-500/30";
      case "INFO":
      default:
        return "bg-emerald-500/20 text-emerald-400 border-emerald-500/30";
    }
  };

  return (
    <div className="flex flex-col h-full bg-zinc-950 text-white rounded-3xl border border-zinc-800/80 shadow-2xl overflow-hidden backdrop-blur-xl">
      {/* Header */}
      <div className="p-6 border-b border-zinc-800 bg-zinc-950/80 flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-3">
            <span className="p-2 rounded-xl bg-zinc-900 border border-zinc-800 text-emerald-400">
              <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="4 17 10 11 4 5"/><line x1="12" x2="20" y1="19" y2="19"/></svg>
            </span>
            <div>
              <h2 className="text-xl font-bold text-white tracking-tight">Console & Audit Debug Logs</h2>
              <p className="text-xs text-zinc-400 mt-0.5">Real-time system events, audit trails, and server diagnostics</p>
            </div>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          {/* Auto Refresh Toggle */}
          <button
            onClick={() => setAutoRefresh(!autoRefresh)}
            className={`px-3 py-1.5 rounded-xl text-xs font-semibold border transition-all flex items-center gap-2 ${
              autoRefresh
                ? "bg-emerald-500/10 text-emerald-400 border-emerald-500/30"
                : "bg-zinc-900 text-zinc-400 border-zinc-800"
            }`}
          >
            <span className={`w-2 h-2 rounded-full ${autoRefresh ? "bg-emerald-400 animate-ping" : "bg-zinc-600"}`} />
            {autoRefresh ? "Auto-refreshing (3s)" : "Paused"}
          </button>

          {/* Refresh Button */}
          <button
            onClick={fetchLogs}
            className="p-2 bg-zinc-900 hover:bg-zinc-800 text-zinc-300 rounded-xl border border-zinc-800 transition-colors"
            title="Refresh logs"
          >
            <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={loading ? "animate-spin" : ""}><path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8"/><path d="M3 3v5h5"/></svg>
          </button>

          {/* Clear Logs Button */}
          <button
            onClick={handleClearLogs}
            className="px-3 py-1.5 bg-red-500/10 hover:bg-red-500/20 text-red-400 text-xs font-semibold rounded-xl border border-red-500/20 transition-colors flex items-center gap-1.5"
          >
            <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 6h18"/><path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6"/><path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2"/></svg>
            Clear Logs
          </button>
        </div>
      </div>

      {/* Bar Controls & Filters */}
      <div className="p-4 bg-zinc-950/60 border-b border-zinc-800 flex flex-col sm:flex-row sm:items-center justify-between gap-4 text-xs">
        {/* Level Filters */}
        <div className="flex items-center bg-zinc-900 border border-zinc-800 rounded-2xl p-1">
          {[
            { id: "ALL", label: `All (${counts.total})` },
            { id: "ERROR", label: `Errors (${counts.errors})` },
            { id: "WARN", label: `Warnings (${counts.warnings})` },
            { id: "SECURITY", label: `Security (${counts.security})` },
            { id: "INFO", label: `Info (${counts.info})` },
          ].map((f) => (
            <button
              key={f.id}
              onClick={() => setLevelFilter(f.id)}
              className={`px-3 py-1.5 rounded-xl font-bold transition-all ${
                levelFilter === f.id
                  ? f.id === "ERROR"
                    ? "bg-red-500 text-white shadow-md shadow-red-500/20"
                    : f.id === "WARN"
                    ? "bg-amber-500 text-zinc-950 shadow-md shadow-amber-500/20"
                    : f.id === "SECURITY"
                    ? "bg-purple-500 text-white shadow-md shadow-purple-500/20"
                    : "bg-emerald-500 text-zinc-950 shadow-md shadow-emerald-500/20"
                  : "text-zinc-400 hover:text-white"
              }`}
            >
              {f.label}
            </button>
          ))}
        </div>

        {/* Search */}
        <div className="relative">
          <input
            type="text"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            placeholder="Search log messages, actions, IPs..."
            className="w-full sm:w-72 px-4 py-2 bg-zinc-900 border border-zinc-800 rounded-xl text-xs text-white placeholder-zinc-500 focus:outline-none focus:border-emerald-500 font-mono"
          />
        </div>
      </div>

      {/* Terminal View Feed */}
      <div className="flex-1 overflow-y-auto p-4 font-mono text-xs leading-relaxed space-y-1 bg-zinc-950">
        {filteredLogs.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 text-zinc-500">
            <svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="mb-3 opacity-50"><polyline points="4 17 10 11 4 5"/><line x1="12" x2="20" y1="19" y2="19"/></svg>
            <p>No log records match your filter criteria.</p>
          </div>
        ) : (
          filteredLogs.map((log, index) => (
            <div
              key={log.id || index}
              onClick={() => setSelectedLog(log)}
              className="p-3 bg-zinc-900/40 hover:bg-zinc-900 border border-zinc-800/60 hover:border-zinc-700 rounded-xl transition-all cursor-pointer flex flex-col md:flex-row md:items-center justify-between gap-3 group"
            >
              <div className="flex items-start md:items-center gap-3 overflow-hidden">
                {/* Timestamp */}
                <span className="text-zinc-500 shrink-0 text-[11px]">
                  [{new Date(log.timestamp).toLocaleTimeString()}]
                </span>

                {/* Level Badge */}
                <span
                  className={`px-2 py-0.5 rounded-md text-[10px] font-extrabold border shrink-0 ${getLevelBadgeClass(
                    log.level
                  )}`}
                >
                  {log.level}
                </span>

                {/* Action */}
                <span className="text-emerald-400 font-bold shrink-0 uppercase tracking-wide">
                  [{log.action}]
                </span>

                {/* Message */}
                <span className="text-zinc-200 truncate group-hover:text-white transition-colors">
                  {log.message}
                </span>
              </div>

              {/* IP & Inspect trigger */}
              <div className="flex items-center gap-3 shrink-0 text-zinc-500 text-[11px]">
                <span className="bg-zinc-950 px-2 py-1 rounded-md border border-zinc-800">{log.ip}</span>
                <span className="text-zinc-600 group-hover:text-emerald-400 transition-colors">Inspect →</span>
              </div>
            </div>
          ))
        )}
      </div>

      {/* Detailed Log Modal */}
      {selectedLog && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-zinc-950/90 backdrop-blur-xl p-4">
          <div className="w-full max-w-2xl bg-zinc-900 border border-zinc-800 rounded-3xl p-6 shadow-2xl overflow-hidden">
            <div className="flex items-center justify-between border-b border-zinc-800 pb-4 mb-4">
              <div className="flex items-center gap-2">
                <span className={`px-2.5 py-1 rounded-lg text-xs font-bold border ${getLevelBadgeClass(selectedLog.level)}`}>
                  {selectedLog.level}
                </span>
                <h3 className="text-base font-bold text-white font-mono">Log Details [{selectedLog.action}]</h3>
              </div>
              <button onClick={() => setSelectedLog(null)} className="p-2 text-zinc-400 hover:text-white rounded-xl">
                <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M18 6 6 18"/><path d="m6 6 12 12"/></svg>
              </button>
            </div>

            <div className="space-y-3 font-mono text-xs">
              <div>
                <span className="text-zinc-500 block text-[10px] uppercase font-semibold mb-1">Timestamp</span>
                <span className="text-zinc-200">{new Date(selectedLog.timestamp).toLocaleString()}</span>
              </div>

              <div>
                <span className="text-zinc-500 block text-[10px] uppercase font-semibold mb-1">IP Address</span>
                <span className="text-emerald-400">{selectedLog.ip}</span>
              </div>

              <div>
                <span className="text-zinc-500 block text-[10px] uppercase font-semibold mb-1">Message & Payload</span>
                <pre className="p-4 bg-zinc-950 rounded-xl border border-zinc-800 text-zinc-300 overflow-x-auto whitespace-pre-wrap leading-relaxed">
                  {selectedLog.message}
                </pre>
              </div>
            </div>

            <div className="mt-6 pt-4 border-t border-zinc-800 flex justify-end">
              <button
                onClick={() => setSelectedLog(null)}
                className="px-4 py-2 bg-zinc-800 hover:bg-zinc-700 text-white rounded-xl text-xs font-bold transition-all"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
