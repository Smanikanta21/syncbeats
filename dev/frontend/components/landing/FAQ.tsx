/**
 * FAQ
 *
 * Visible answers to the questions people actually type into a search box
 * before they trust a link like this one, plus the FAQPage structured data
 * built from the same array — so the copy on the page and the copy Google and
 * LLMs are told about can never drift apart.
 */

const FAQS = [
  {
    q: "Do I need to install an app to use SyncBeats?",
    a: "No. SyncBeats runs entirely in modern web browsers on iPhone, Android, Mac, Windows, and Linux. Simply open the room link or enter the 6-digit room code, and your device instantly joins the synchronized sound system.",
  },
  {
    q: "When will the native macOS desktop app be released?",
    a: "The native macOS companion app is launching soon! It features menu bar quick controls, system-wide audio broadcasting (stream directly from Spotify Desktop, Apple Music, Ableton Live, or DJ apps into your room), and sub-15ms hardware CoreAudio synchronization. You can join the early access waitlist above.",
  },
  {
    q: "Does everyone need to be connected to the same Wi-Fi network?",
    a: "No. Devices do not need to be on the same local Wi-Fi. SyncBeats synchronizes each device directly against our master server clock via adaptive NTP algorithms. A phone on 5G mobile data stays in microsecond lockstep with a laptop on fiber Wi-Fi across the room or across the globe.",
  },
  {
    q: "Where does the music come from? Can I use Spotify or YouTube?",
    a: "Yes. You can search and stream millions of songs directly via YouTube, import public Spotify playlists (which SyncBeats automatically maps to high-quality audio streams), or drag-and-drop your own local audio files (MP3, WAV, FLAC, AAC). Anyone in the room can contribute to the shared queue.",
  },
  {
    q: "How accurate is the audio synchronization?",
    a: "Synchronization is maintained under 25 milliseconds between devices, which is below the threshold human hearing perceives as an echo. When a new device joins, it locks onto the clock within a few seconds and continuously corrects any hardware drift without changing playback pitch.",
  },
  {
    q: "How is SyncBeats different from AmpMe, AirPlay, or Bluetooth party speakers?",
    a: "Bluetooth only pairs to one or two devices of the same brand, and AirPlay is locked to Apple hardware. AmpMe requires downloading a heavy mobile app, creating accounts, and suffers from audible drift. SyncBeats works in any browser, across iOS, Android, Mac, and Windows simultaneously, with zero setup and advanced spatial 3D audio panning.",
  },
  {
    q: "How many devices can join a single room?",
    a: "There is no hard limit. Rooms routinely run with 4 to 12 devices at parties, picnics, and long-distance listening sessions. The practical limit depends only on network bandwidth.",
  },
  {
    q: "Can I lock my room so strangers cannot join?",
    a: "Yes. As the room host, you can toggle 'Private Mode' with one tap. Any new participant must be approved by you before their audio unmutes.",
  },
  {
    q: "Is SyncBeats free to use?",
    a: "Yes, SyncBeats is 100% free to use. All core features — real-time synchronization, spatial soundstage routing, synced lyrics, shared queue, and private rooms — are completely free.",
  },
];

export function FAQ() {
  return (
    <section id="faq" className="relative z-10 w-full px-5 py-24 md:py-32">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify({
            "@context": "https://schema.org",
            "@type": "FAQPage",
            mainEntity: FAQS.map(({ q, a }) => ({
              "@type": "Question",
              name: q,
              acceptedAnswer: { "@type": "Answer", text: a },
            })),
          }),
        }}
      />

      <div className="mx-auto grid w-full max-w-6xl gap-10 lg:grid-cols-[minmax(0,0.6fr)_minmax(0,1fr)] lg:gap-20">
        <div>
          <p className="micro-label mb-3">Frequently asked questions</p>
          <h2 className="font-display text-display font-semibold text-balance lg:sticky lg:top-32 lg:self-start">
            Everything you need to know.
          </h2>
          <p className="mt-4 text-sm text-foreground/60 leading-relaxed max-w-[32ch]">
            Have a question that isn't answered here? Reach out via our contact form below and we'll help you out.
          </p>
        </div>

        <div className="border-t border-foreground/10">
          {FAQS.map(({ q, a }) => (
            <details key={q} className="group border-b border-foreground/10">
              <summary className="flex cursor-pointer list-none items-center justify-between gap-6 py-5 text-left text-base font-medium transition-colors hover:text-foreground/70 focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-foreground md:text-lg">
                {q}
                <span
                  aria-hidden
                  className="relative h-3 w-3 shrink-0 text-foreground/40 transition-transform duration-300 group-open:rotate-45"
                >
                  <span className="absolute top-1/2 left-0 h-px w-3 -translate-y-1/2 bg-current" />
                  <span className="absolute top-0 left-1/2 h-3 w-px -translate-x-1/2 bg-current" />
                </span>
              </summary>
              <p className="max-w-[62ch] pr-10 pb-6 text-sm leading-relaxed text-foreground/60">
                {a}
              </p>
            </details>
          ))}
        </div>
      </div>
    </section>
  );
}
