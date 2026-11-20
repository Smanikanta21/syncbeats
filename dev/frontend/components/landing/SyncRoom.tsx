const playbackSteps = [
  {
    number: "01",
    title: "Estimate each device’s clock",
    description: "Devices compare timestamps with SyncBeats and account for network delay.",
  },
  {
    number: "02",
    title: "Schedule one shared start",
    description: "Once devices are ready, the room gives them the same playback start time.",
  },
  {
    number: "03",
    title: "Keep checking as the song plays",
    description: "Each client watches playback position and corrects meaningful drift when needed.",
  },
];

/** A plain-language explanation of the playback system, without simulated live data. */
export function SyncRoom() {
  return (
    <section className="relative z-10 w-full px-5 py-24 sm:px-8 md:py-32" aria-labelledby="playback-story-title">
      <div className="mx-auto grid w-full max-w-6xl gap-10 lg:grid-cols-[minmax(0,0.8fr)_minmax(0,1.2fr)] lg:gap-20">
        <div className="max-w-xl">
          <p className="micro-label mb-4">What happens when you press play</p>
          <h2 id="playback-story-title" className="max-w-[13ch] font-display text-display font-semibold leading-[1.02] text-balance">
            One start time for the whole room.
          </h2>
          <p className="mt-5 max-w-[42ch] text-lead leading-relaxed text-foreground/60 text-pretty">
            SyncBeats schedules playback after devices are ready. While the song plays, each device checks its position and corrects meaningful drift.
          </p>
        </div>

        <ol className="self-center border-t border-foreground/12">
          {playbackSteps.map(({ number, title, description }) => (
            <li key={number} className="grid grid-cols-[2.75rem_minmax(0,1fr)] gap-3 border-b border-foreground/12 py-5 sm:grid-cols-[4rem_minmax(0,1fr)] sm:gap-5 sm:py-6">
              <span className="pt-1 font-mono text-xs tabular text-foreground/35">{number}</span>
              <div className="grid gap-1.5 sm:grid-cols-[minmax(11rem,0.8fr)_minmax(0,1fr)] sm:items-baseline sm:gap-6">
                <h3 className="text-base font-semibold tracking-tight">{title}</h3>
                <p className="max-w-[38ch] text-sm leading-relaxed text-foreground/55">{description}</p>
              </div>
            </li>
          ))}
        </ol>
      </div>
    </section>
  );
}
