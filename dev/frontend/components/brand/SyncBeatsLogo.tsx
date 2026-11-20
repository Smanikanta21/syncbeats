import type { SVGProps } from "react";
import brand from "@/lib/brand-shape.json";
import { cn } from "../../lib/utils";

type MarkProps = SVGProps<SVGSVGElement>;

/** Linked Play: two play loops sharing one direction and one beat. */
export function SyncBeatsMark({ className, ...props }: MarkProps) {
  return (
    <svg
      viewBox="0 0 64 64"
      className={cn("shrink-0", className)}
      fill="none"
      aria-hidden="true"
      {...props}
    >
      <rect width="64" height="64" rx="15" fill={brand.background} />
      <g fill="none" strokeLinejoin="round" strokeWidth={brand.strokeWidth}>
        <path d={brand.path} stroke={brand.foreground} />
        <g transform={brand.offset}>
          <path d={brand.path} stroke={brand.background} strokeWidth="10" />
          <path d={brand.path} stroke={brand.accent} />
        </g>
      </g>
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
      <span
        className={cn(
          "font-display font-semibold tracking-tight",
          wordmarkClassName,
        )}
      >
        SyncBeats
      </span>
    </span>
  );
}
