"use client";

import { useId, type CSSProperties } from "react";
import brand from "../lib/brand-shape.json";
import styles from "./SyncBeatsLoader.module.css";

interface SyncBeatsLoaderProps {
  title: string;
  detail?: string;
  progress?: number;
  compact?: boolean;
  className?: string;
}

/** The same Linked Play geometry and 1.8-second cycle as NativeLoadingSignal. */
export function SyncBeatsLoader({ title, detail, progress, compact = false, className = "" }: SyncBeatsLoaderProps) {
  const maskID = useId().replace(/:/g, "");
  const bounded = typeof progress === "number" && Number.isFinite(progress)
    ? Math.min(100, Math.max(0, progress)) : null;
  const traceStyle = bounded === null ? undefined : {
    strokeDasharray: `${bounded / 100} 1`,
    strokeDashoffset: 0,
    animation: "none",
  } satisfies CSSProperties;

  return (
    <div className={`${styles.loader} ${compact ? styles.compact : ""} ${className}`} aria-busy="true">
      <div className={styles.content}>
        <svg className={styles.signal} viewBox="0 0 64 64" fill="none" aria-hidden="true">
          <defs>
            <mask id={maskID}>
              <rect width="64" height="64" fill="white" />
              <path d={brand.path} transform={brand.offset} stroke="black" strokeWidth="10" strokeLinejoin="round" />
            </mask>
          </defs>
          <g strokeWidth={brand.strokeWidth} strokeLinejoin="round" strokeLinecap="round">
            <g mask={`url(#${maskID})`}>
              <path className={styles.track} d={brand.path} />
              <path className={styles.trace} d={brand.path} pathLength="1" style={traceStyle} />
            </g>
            <g transform={brand.offset} className={styles.second}>
              <path className={styles.track} d={brand.path} />
              <path className={styles.trace} d={brand.path} pathLength="1" style={traceStyle} />
            </g>
          </g>
        </svg>
        <div className={styles.copy} role="status" aria-live="polite" aria-atomic="true">
          <p className={styles.title}>{title}</p>
          {detail && <p className={styles.detail}>{detail}</p>}
        </div>
      </div>
      {bounded !== null && (
        <div className={styles.progress} role="progressbar" aria-label={title} aria-valuemin={0} aria-valuemax={100} aria-valuenow={bounded}>
          <div className={styles.rail}><div className={styles.fill} style={{ width: `${bounded}%` }} /></div>
          <span className={styles.percentage} aria-hidden="true">{Math.floor(bounded)}%</span>
        </div>
      )}
    </div>
  );
}
