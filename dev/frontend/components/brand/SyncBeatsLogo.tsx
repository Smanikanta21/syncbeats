import type { SVGProps } from "react";
import { cn } from "../../lib/utils";

type MarkProps = SVGProps<SVGSVGElement>;

/** SyncBeats' phase-ring waveform mark, shared by product chrome and loading UI. */
export function SyncBeatsMark({ className, ...props }: MarkProps) {
  return (
    <svg
      viewBox="0 0 64 64"
      className={cn("shrink-0", className)}
      fill="none"
      aria-hidden="true"
      {...props}
    >
      <rect width="64" height="64" fill="#111213" />
      <rect x="1" y="1" width="62" height="62" rx="18" fill="#111213" />
      <circle cx="32" cy="32" r="22" stroke="#EAEAE8" strokeOpacity=".16" strokeWidth="1.5" />
      <path d="M11 32h42" stroke="#EAEAE8" strokeOpacity=".28" strokeWidth="2" strokeLinecap="round" />
      <g fill="#EAEAE8">
        <rect x="17" y="26" width="4" height="12" rx="2" />
        <rect x="25" y="20" width="4" height="24" rx="2" />
        <rect x="41" y="22" width="4" height="20" rx="2" />
        <rect x="49" y="27" width="4" height="10" rx="2" />
      </g>
      <rect x="33" y="15" width="4" height="34" rx="2" fill="#62D6AE" />
    </svg>
  );
}

export function SyncBeatsLogo({
  className,
  markClassName,
  wordmarkClassName,
}: {
  className?: string;
  markClassName?: string;
  wordmarkClassName?: string;
}) {
  return (
    <span className={cn("inline-flex items-center gap-2.5", className)}>
      <SyncBeatsMark className={cn("h-8 w-8", markClassName)} />
      <span className={cn("font-display font-semibold tracking-tight", wordmarkClassName)}>SyncBeats</span>
    </span>
  );
}
