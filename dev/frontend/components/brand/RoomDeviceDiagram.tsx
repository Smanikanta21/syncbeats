import { useId } from "react";
import { Headphones, Laptop, Smartphone, Speaker } from "lucide-react";

const devices = [
  { label: "Phone", Icon: Smartphone, position: "left-[12%] top-[18%] sm:top-[12%]" },
  { label: "Laptop", Icon: Laptop, position: "bottom-[9%] left-[12%]" },
  { label: "Speaker", Icon: Speaker, position: "bottom-[9%] left-[88%]" },
  { label: "Headphones", Icon: Headphones, position: "left-[88%] top-[18%] sm:top-[12%]" },
];

/** Responsive room illustration with device positions anchored to the room, not a row. */
export function RoomDeviceDiagram({ compact = false }: { compact?: boolean }) {
  const trailId = `device-trail-${useId().replace(/:/g, "")}`;

  return (
    <div
      className={`relative isolate mx-auto mt-4 w-full max-w-[40rem] ${compact ? "h-[clamp(14rem,48vw,16rem)] sm:h-[clamp(12rem,40vw,15rem)]" : "h-[clamp(15rem,68vw,18rem)] sm:h-[clamp(13rem,46vw,17rem)]"}`}
      role="img"
      aria-label="A phone, laptop, speaker and headphones connected to one listening room"
    >
      <div className="pointer-events-none absolute left-1/2 top-1/2 h-36 w-36 -translate-x-1/2 -translate-y-1/2 rounded-full bg-foreground/[0.035] blur-2xl sm:h-48 sm:w-48" />

      <svg
        aria-hidden="true"
        viewBox="0 0 100 100"
        preserveAspectRatio="none"
        className="pointer-events-none absolute inset-0 z-0 h-full w-full overflow-visible text-foreground"
      >
        <defs>
          <linearGradient id={trailId} x1="0" y1="0" x2="1" y2="0">
            <stop offset="0%" stopColor="currentColor" stopOpacity="0.04" />
            <stop offset="50%" stopColor="currentColor" stopOpacity="0.26" />
            <stop offset="100%" stopColor="currentColor" stopOpacity="0.04" />
          </linearGradient>
        </defs>
        <g fill="none" stroke={`url(#${trailId})`} strokeWidth="1.1" strokeDasharray="1.4 2.2" strokeLinecap="round" vectorEffect="non-scaling-stroke">
          <path d="M 17 26 C 25 26, 32 34, 42 43" />
          <path d="M 83 26 C 75 26, 68 34, 58 43" />
          <path d="M 17 73 C 25 73, 32 64, 42 57" />
          <path d="M 83 73 C 75 73, 68 64, 58 57" />
        </g>
      </svg>

      {devices.map(({ label, Icon, position }) => (
        <div key={label} className={`absolute z-10 flex -translate-x-1/2 flex-col items-center gap-1.5 sm:gap-2 ${position}`}>
          <span className="flex h-9 w-9 items-center justify-center rounded-2xl border border-foreground/10 bg-background/75 shadow-[var(--glass-shadow)] backdrop-blur-xl sm:h-12 sm:w-12">
            <Icon className="h-4 w-4 text-foreground/65 sm:h-[18px] sm:w-[18px]" strokeWidth={1.7} />
          </span>
          <span className="whitespace-nowrap text-[10px] leading-tight text-foreground/45 sm:text-[11px]">{label}</span>
        </div>
      ))}

      <div className="absolute left-1/2 top-1/2 z-20 flex h-16 w-16 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-[1.35rem] border border-foreground/10 bg-background/85 shadow-[var(--glass-shadow)] backdrop-blur-2xl sm:h-28 sm:w-28 sm:rounded-[1.8rem]">
        <div className="flex h-12 w-12 items-center justify-center rounded-full border border-foreground/10 bg-[radial-gradient(circle_at_35%_30%,var(--warm-tint),transparent_55%),linear-gradient(145deg,var(--surface),var(--background))] sm:h-20 sm:w-20">
          <span className="flex items-end gap-1" aria-hidden="true">
            {[12, 22, 15, 27, 11].map((height, index) => <span key={index} className="w-1 rounded-full bg-foreground/70" style={{ height }} />)}
          </span>
        </div>
      </div>
    </div>
  );
}
