/**
 * FAQ
 *
 * Visible answers to the questions people actually type into a search box
 * before they trust a link like this one, plus the FAQPage structured data
 * built from the same array — so the copy on the page and the copy Google is
 * told about can never drift apart.
 *
 * This section is also what replaces the `sr-only` keyword block that used to
 * sit in the hero. That block carried roughly 90 words of hidden text ending
 * in "the best AmpMe and BeatSync alternative", which is the hidden-text
 * pattern Google's spam policies name directly — a risk taken in exchange for
 * keywords that now appear in real, readable copy instead.
 *
 * Open/close is `<details>`: it is keyboard accessible, announced correctly,
 * searchable by Ctrl-F in Chrome even while collapsed, and costs no JS.
 */

const FAQS = [
  {
    q: "Do I need to install an app?",
    a: "No. SyncBeats runs in the browser on iPhone, Android, Mac, Windows and Linux. Open the link, type the room code, and you are in.",
  },
  {
    q: "Does everyone have to be on the same Wi-Fi?",
    a: "No. Each device syncs against the server's clock rather than the local network, so a phone on mobile data stays in step with a laptop on Wi-Fi.",
  },
  {
    q: "How close to perfect is the sync?",
    a: "Under 25 milliseconds between devices, which is below the gap most people can hear as an echo. A device that has just joined takes five to ten seconds to settle while it works out its clock offset.",
  },
  {
    q: "How many devices can join one room?",
    a: "There is no fixed cap. Rooms have run with everything from two phones to a dozen devices; the practical limit is how much the room's network can carry.",
  },
  {
    q: "Where does the music come from?",
    a: "Upload your own files, search YouTube from inside the room, or import a Spotify playlist and let SyncBeats match the tracks. The queue is shared, and anyone in the room can add to it.",
  },
  {
    q: "Do I need an account?",
    a: "Yes, a free one. Sign in with Google or an email address. The account is what keeps your rooms, your devices and your history attached to you between sessions.",
  },
  {
    q: "Is SyncBeats free?",
    a: "Yes. Every feature — spatial routing, the shared queue, private rooms, lyrics — is free to use.",
  },
  {
    q: "How is this different from AmpMe or a Bluetooth party speaker?",
    a: "A Bluetooth speaker is one speaker. SyncBeats turns every phone, tablet and laptop already in the room into its own speaker, each positionable left or right, all playing the same instant of the same track.",
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
        <h2 className="font-display text-display font-semibold text-balance lg:sticky lg:top-32 lg:self-start">
          Before you ask
        </h2>

        <div className="border-t border-foreground/10">
          {FAQS.map(({ q, a }) => (
            <details key={q} className="group border-b border-foreground/10">
              <summary className="flex cursor-pointer list-none items-center justify-between gap-6 py-5 text-left text-base font-medium transition-colors hover:text-foreground/70 focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-(--accent-color) md:text-lg">
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
