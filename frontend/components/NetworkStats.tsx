"use client";

import { motion, AnimatePresence } from "framer-motion";
import { Activity, Clock, Zap, Signal, ArrowUpDown, Disc } from "lucide-react";
import {
  NetworkStats as NetworkStatsType,
  NetworkSample,
  qualityColor,
  qualityLabel,
  metricColor,
} from "../hooks/useNetworkStats";


// ── Sparkline (pure SVG) ────────────────────────────────────────────────────

interface SparklineProps {
  data:   number[];
  color:  string;
  height?: number;
  width?:  number | string;
}

function Sparkline({ data, color, height = 32, width = 120 }: SparklineProps) {
  if (data.length < 2) return null;
  const max = Math.max(...data, 1);
  const min = Math.min(...data, 0);
  const range = max - min || 1;
  const vw = 200;
  const vh = height;

  const points = data.map((v, i) => {
    const x = (i / (data.length - 1)) * vw;
    const y = vh - ((v - min) / range) * (vh - 4) - 2;
    return `${x},${y}`;
  }).join(" ");

  const areaPoints = `0,${vh} ${points} ${vw},${vh}`;

  return (
    <svg
      width={width}
      height={height}
      className="shrink-0 max-w-full overflow-hidden"
      viewBox={`0 0 ${vw} ${vh}`}
      preserveAspectRatio="none"
    >
      <defs>
        <linearGradient id={`grad-${color.replace("#", "")}`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={color} stopOpacity="0.25" />
          <stop offset="100%" stopColor={color} stopOpacity="0.02" />
        </linearGradient>
      </defs>
      <polygon points={areaPoints} fill={`url(#grad-${color.replace("#", "")})`} />
      <polyline points={points} fill="none" stroke={color} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" vectorEffect="non-scaling-stroke" />
      {data.length > 0 && (
        <circle cx={vw} cy={vh - ((data[data.length - 1] - min) / range) * (vh - 4) - 2} r="2.5" fill={color}>
          <animate attributeName="opacity" values="1;0.4;1" dur="1.5s" repeatCount="indefinite" />
        </circle>
      )}
    </svg>
  );
}

// ── Stat Card ───────────────────────────────────────────────────────────────

interface StatCardProps {
  icon:      React.ReactNode;
  label:     string;
  value:     string;
  unit:      string;
  color:     string;
  sparkData: number[];
  subValue?: string;
}

function StatCard({ icon, label, value, unit, color, sparkData, subValue }: StatCardProps) {
  return (
    <div className="flex-1 min-w-0 p-3 rounded-2xl bg-foreground/[0.03] border border-foreground/[0.06] hover:bg-foreground/[0.05] transition-colors">
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-1.5">
          <span style={{ color }}>{icon}</span>
          <span className="text-[10px] font-bold text-foreground/40 uppercase tracking-widest">{label}</span>
        </div>
        <Sparkline data={sparkData} color={color} height={20} width={56} />
      </div>
      <div className="flex items-baseline gap-1">
        <span className="text-xl font-black tabular-nums" style={{ color }}>{value}</span>
        <span className="text-[10px] font-bold text-foreground/30">{unit}</span>
      </div>
      {subValue && (
        <p className="text-[10px] text-foreground/30 font-medium mt-0.5">avg {subValue}</p>
      )}
    </div>
  );
}

// ── Collapsed Pill (mini stats) ─────────────────────────────────────────────

interface NetworkPillProps {
  stats: NetworkStatsType;
  onClick: () => void;
  onExpand: () => void;
  onSwap: () => void;
}

export function NetworkPill({ stats, onClick, onExpand, onSwap }: NetworkPillProps) {
  const qColor = qualityColor(stats.quality);

  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.95 }}
      animate={{ opacity: 1, scale: 1, transition: { duration: 0.3, delay: 0.15 } }}
      exit={{ opacity: 0, transition: { duration: 0.15 } }}
      className="px-4 py-2.5 flex items-center gap-4 sm:gap-6 md:gap-10 justify-between"
    >
      <div
        className="flex items-center gap-3 flex-1 min-w-0 cursor-pointer"
        onClick={(e) => { e.stopPropagation(); onExpand(); }}
      >
        <div
          className="w-9 h-9 rounded-full flex items-center justify-center shrink-0 border"
          style={{
            borderColor: `${qColor}30`,
            background: `${qColor}10`,
          }}
        >
          <Signal className="w-4 h-4" style={{ color: qColor }} />
        </div>
        <div className="flex flex-col min-w-0">
          <div className="flex items-center gap-2">
            <span className="text-sm font-bold text-foreground leading-tight">Network</span>
            <span
              className="text-[10px] font-bold px-1.5 py-0.5 rounded-full"
              style={{ color: qColor, background: `${qColor}15` }}
            >
              {qualityLabel(stats.quality)}
            </span>
          </div>
          <div className="flex items-center gap-3 mt-0.5">
            <span className="text-[10px] font-mono text-foreground/40">
              <span style={{ color: metricColor(stats.rtt, [50, 100, 200]) }}>{stats.rtt.toFixed(0)}</span>ms RTT
            </span>
            <span className="text-[10px] font-mono text-foreground/40">
              <span style={{ color: metricColor(stats.jitter, [5, 15, 30]) }}>{stats.jitter.toFixed(0)}</span>ms jitter
            </span>
            <span className="text-[10px] font-mono text-foreground/40 hidden sm:inline">
              {stats.clockOffset.toFixed(0)}ms offset
            </span>
          </div>
        </div>
      </div>

      {/* Mini sparkline */}
      <div className="shrink-0 hidden sm:block">
        <Sparkline
          data={stats.history.slice(-30).map(s => s.rtt)}
          color={qColor}
          height={24}
          width={80}
        />
      </div>

      {/* Swap back to player */}
      <button
        onClick={(e) => { e.stopPropagation(); onSwap(); }}
        className="w-6 h-6 rounded-full bg-foreground/5 border border-foreground/10 flex items-center justify-center hover:bg-foreground/10 transition-colors shrink-0"
        title="Back to player"
      >
        <Disc className="w-3 h-3 text-foreground/40" />
      </button>
    </motion.div>
  );
}

// ── Expanded Panel ──────────────────────────────────────────────────────────

interface NetworkExpandedProps {
  stats:   NetworkStatsType;
  onClose: () => void;
}

export function NetworkExpanded({ stats, onClose }: NetworkExpandedProps) {
  const qColor = qualityColor(stats.quality);
  const h = stats.history;

  return (
    <motion.div
      key="net-full"
      initial={{ opacity: 0, y: 10, scale: 0.98 }}
      animate={{ opacity: 1, y: 0, scale: 1, transition: { duration: 0.4, delay: 0.15 } }}
      exit={{ opacity: 0, scale: 0.95, transition: { duration: 0.2 } }}
      className="p-6 md:p-8 flex flex-col"
    >
      {/* Header */}
      <div className="flex items-center justify-between mb-5">
        <div className="flex items-center gap-3">
          <span className="text-xs font-bold tracking-widest text-foreground/50 uppercase flex items-center gap-2">
            <span
              className="w-2 h-2 rounded-full animate-pulse"
              style={{ background: qColor }}
            />
            Network Diagnostics
          </span>
          <span
            className="text-[10px] font-bold px-2 py-0.5 rounded-full"
            style={{ color: qColor, background: `${qColor}15` }}
          >
            {qualityLabel(stats.quality)}
          </span>
        </div>
        <button
          onClick={onClose}
          className="text-xs text-foreground/40 hover:text-foreground/60 font-bold transition-colors"
        >
          ESC
        </button>
      </div>

      {/* Main stat cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-2.5 mb-5">
        <StatCard
          icon={<ArrowUpDown className="w-3.5 h-3.5" />}
          label="RTT"
          value={stats.rtt.toFixed(0)}
          unit="ms"
          color={metricColor(stats.rtt, [50, 100, 200])}
          sparkData={h.map(s => s.rtt)}
          subValue={`${stats.avgRtt.toFixed(0)}ms`}
        />
        <StatCard
          icon={<Activity className="w-3.5 h-3.5" />}
          label="Latency"
          value={stats.latency.toFixed(0)}
          unit="ms"
          color={metricColor(stats.latency, [25, 50, 100])}
          sparkData={h.map(s => s.latency)}
          subValue={`${stats.avgLatency.toFixed(0)}ms`}
        />
        <StatCard
          icon={<Zap className="w-3.5 h-3.5" />}
          label="Jitter"
          value={stats.jitter.toFixed(0)}
          unit="ms"
          color={metricColor(stats.jitter, [5, 15, 30])}
          sparkData={h.map(s => s.jitter)}
          subValue={`${stats.avgJitter.toFixed(0)}ms`}
        />
        <StatCard
          icon={<Clock className="w-3.5 h-3.5" />}
          label="Offset"
          value={stats.clockOffset.toFixed(0)}
          unit="ms"
          color={metricColor(Math.abs(stats.clockOffset), [20, 50, 100])}
          sparkData={h.map(s => s.offset)}
          subValue={`sync drift`}
        />
      </div>

      {/* RTT History Graph (full width) */}
      <div className="rounded-2xl bg-foreground/[0.03] border border-foreground/[0.06] p-4 mb-5">
        <div className="flex items-center justify-between mb-3">
          <span className="text-[10px] font-bold text-foreground/40 uppercase tracking-widest">RTT History (60s)</span>
          <div className="flex items-center gap-3">
            <span className="flex items-center gap-1 text-[10px] text-foreground/30">
              <span className="w-2 h-2 rounded-full bg-green-500" /> &lt;50ms
            </span>
            <span className="flex items-center gap-1 text-[10px] text-foreground/30">
              <span className="w-2 h-2 rounded-full bg-blue-500" /> &lt;100ms
            </span>
            <span className="flex items-center gap-1 text-[10px] text-foreground/30">
              <span className="w-2 h-2 rounded-full bg-amber-500" /> &lt;200ms
            </span>
            <span className="flex items-center gap-1 text-[10px] text-foreground/30">
              <span className="w-2 h-2 rounded-full bg-red-500" /> 200ms+
            </span>
          </div>
        </div>
        <Sparkline
          data={h.map(s => s.rtt)}
          color={qColor}
          height={48}
          width="100%"
        />
        <div className="flex justify-between mt-1.5 text-[9px] text-foreground/20 font-mono">
          <span>{h.length > 0 ? `-${h.length}s` : "0s"}</span>
          <span>now</span>
        </div>
      </div>
    </motion.div>
  );
}
