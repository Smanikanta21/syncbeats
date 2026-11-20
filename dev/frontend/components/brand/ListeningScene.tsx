import { RoomDeviceDiagram } from "./RoomDeviceDiagram";

/** Lightweight, reusable room artwork for the landing page. */
export function ListeningScene({ compact = false, className = "" }: { compact?: boolean; className?: string }) {
  return (
    <div className={`relative isolate overflow-hidden rounded-[2rem] border border-foreground/10 bg-foreground/[0.025] ${compact ? "p-4 sm:p-5" : "p-5 sm:p-7"} ${className}`}>
      <div className="pointer-events-none absolute -right-14 -top-20 -z-10 h-60 w-60 rounded-full bg-(--warm-tint)/30 blur-3xl" />
      <div className="pointer-events-none absolute -bottom-24 -left-12 -z-10 h-64 w-64 rounded-full bg-(--cool-tint)/25 blur-3xl" />

      <div>
        <p className="micro-label">A shared listening room</p>
        <p className="mt-1 text-sm font-semibold">One track, all together</p>
      </div>

      <RoomDeviceDiagram compact={compact} />
    </div>
  );
}
