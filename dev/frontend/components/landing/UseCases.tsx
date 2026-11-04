"use client";

import { motion } from "framer-motion";
import { 
  PartyPopper, 
  Globe2, 
  Headphones, 
  Compass, 
  CheckCircle2,
  ArrowRight
} from "lucide-react";
import Link from "next/link";

const USE_CASES = [
  {
    id: "party",
    badge: "Parties & Hangouts",
    title: "The Pocket Sound System",
    subtitle: "Louder than a Bluetooth speaker, using the phones already in the room.",
    description:
      "Forgot your portable speaker at a beach day, picnic, or house party? Put 4 to 8 phones on counters and tables around the room. SyncBeats synchronizes them all together, creating a distributed soundstage that fills the entire space with balanced, room-filling sound.",
    metric: "4–12 phones combined",
    icon: PartyPopper,
    highlights: ["No Bluetooth pairing limits", "Balanced 360° sound distribution", "Anyone can queue the next song"],
  },
  {
    id: "distance",
    badge: "Long-Distance & Study",
    title: "Listen Together from Anywhere",
    subtitle: "Pristine local playback instead of muffled Discord or Zoom streams.",
    description:
      "Share music moments with friends, partners, or study groups across the city or across the globe. Unlike screensharing apps that crush audio into a robotic telephone codec, SyncBeats commands each user's local hardware to stream direct from the source in perfect clock sync.",
    metric: "Zero distance limit",
    icon: Globe2,
    highlights: ["High-definition lossless audio", "Sub-25ms global clock synchronization", "Real-time shared queue and live lyrics"],
  },
  {
    id: "spatial",
    badge: "Desk & Studio",
    title: "Multi-Device Spatial Surround",
    subtitle: "Turn your desk devices into an immersive 3D personal soundstage.",
    description:
      "Place your iPhone to your left, iPad to your right, and MacBook in the center. Use the SyncBeats Spatial Soundstage to pan channels left and right. Hear vocals centered in front of you while synths and rhythms pan wide around your workspace.",
    metric: "True left/right stereo separation",
    icon: Compass,
    highlights: ["Drag-and-drop spatial node positioning", "Individual hardware delay calibration", "Works across macOS, iOS, Windows, Android"],
  },
  {
    id: "silent-disco",
    badge: "Dance & Fitness",
    title: "Silent Discos & Dance Rehearsals",
    subtitle: "Every dancer on the identical beat without expensive RF transmitter gear.",
    description:
      "Dance troupes, choreography rehearsals, and late-night dorm listening sessions: everyone puts in their own AirPods or headphones. All dancers hear the exact microsecond count of the track together without renting $1,000 wireless headphone transmitters.",
    metric: "Microsecond beat alignment",
    icon: Headphones,
    highlights: ["No expensive hardware rentals", "Zero bleed through apartment walls", "Instant play/pause control by the instructor"],
  },
];

export function UseCases() {
  return (
    <section id="use-cases" className="relative z-10 w-full px-5 py-24 sm:px-8 md:py-32">
      <div className="mx-auto max-w-6xl">
        <div className="flex flex-col items-center text-center">
          <p className="micro-label mb-3">Built for real-world listening</p>
          <h2 className="max-w-[20ch] font-display text-display font-semibold text-balance">
            One room. Endless ways to listen together.
          </h2>
          <p className="mt-5 max-w-[50ch] text-lead text-foreground/60 text-pretty">
            SyncBeats eliminates the need for expensive multi-room speaker systems or messy cable splitters. Here is how people use it every day.
          </p>
        </div>

        {/* Use Cases Grid */}
        <div className="mt-16 grid grid-cols-1 gap-6 md:grid-cols-2">
          {USE_CASES.map((uc, index) => {
            const Icon = uc.icon;
            return (
              <motion.div
                key={uc.id}
                initial={{ opacity: 0, y: 20 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true, margin: "-40px" }}
                transition={{ duration: 0.5, delay: index * 0.1 }}
                className="group relative flex flex-col justify-between overflow-hidden rounded-[2rem] border border-foreground/10 bg-foreground/[0.025] p-7 transition-all duration-300 hover:border-foreground/25 hover:bg-foreground/[0.04] sm:p-9"
              >
                {/* Background subtle tint on hover */}
                <div className="pointer-events-none absolute -right-16 -top-16 -z-10 h-44 w-44 rounded-full bg-(--warm-tint)/20 blur-3xl opacity-0 transition-opacity duration-500 group-hover:opacity-100 dark:bg-amber-500/10" />

                <div>
                  <div className="flex items-center justify-between gap-3">
                    <span className="inline-flex items-center gap-1.5 rounded-full border border-foreground/10 bg-background/80 px-3 py-1 text-xs font-semibold text-foreground/75 backdrop-blur-md">
                      <Icon className="h-3.5 w-3.5" />
                      {uc.badge}
                    </span>
                    <span className="font-mono text-[11px] font-medium text-foreground/40">{uc.metric}</span>
                  </div>

                  <h3 className="mt-6 font-display text-xl sm:text-2xl font-semibold tracking-tight text-foreground">
                    {uc.title}
                  </h3>

                  <p className="mt-1 text-sm font-medium text-foreground/75">
                    {uc.subtitle}
                  </p>

                  <p className="mt-4 text-sm leading-relaxed text-foreground/60">
                    {uc.description}
                  </p>
                </div>

                <div className="mt-8 border-t border-foreground/10 pt-5">
                  <p className="text-xs font-semibold text-foreground/45 uppercase tracking-wider mb-3">Key Advantages</p>
                  <ul className="space-y-2">
                    {uc.highlights.map((hl) => (
                      <li key={hl} className="flex items-center gap-2.5 text-xs text-foreground/70">
                        <CheckCircle2 className="h-3.5 w-3.5 text-foreground/50 shrink-0" />
                        <span>{hl}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              </motion.div>
            );
          })}
        </div>

        {/* Bottom CTA Banner */}
        <div className="mt-12 flex flex-col items-center justify-between gap-6 rounded-3xl border border-foreground/10 bg-foreground/[0.02] p-8 text-center sm:flex-row sm:text-left sm:p-10">
          <div>
            <h4 className="text-lg font-semibold text-foreground">Have a group ready right now?</h4>
            <p className="mt-1 text-sm text-foreground/60">It takes 5 seconds to open a room and invite your friends. No sign-up required for guests.</p>
          </div>
          <Link
            href="/hub"
            className="inline-flex h-12 shrink-0 items-center justify-center gap-2 rounded-2xl bg-foreground px-6 text-xs sm:text-sm font-semibold text-background transition-transform hover:-translate-y-0.5"
          >
            Create Your Room Now
            <ArrowRight className="h-4 w-4" />
          </Link>
        </div>
      </div>
    </section>
  );
}
