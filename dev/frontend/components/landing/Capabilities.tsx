import {
  ArrowUpRight,
  Coffee,
  Globe2,
  House,
  ListMusic,
  Radio,
  Share2,
} from "lucide-react";
import Link from "next/link";
const useCases = [
  {
    icon: House,
    number: "01",
    label: "SAME PLACE, MORE MUSIC",
    title: "Make yourself at home.",
    copy: "Cooking in the kitchen. Friends in the living room. Bring your phones and laptops into one room and let the same soundtrack follow the evening.",
    tags: ["House gatherings", "Music around the home"],
    style: "landing-use-home",
  },
  {
    icon: Globe2,
    number: "02",
    label: "MILES APART, RIGHT HERE",
    title: "Share the next favorite.",
    copy: "Send a room code to a friend across town or across time zones. Press play together, trade tracks, and give your catch-up a shared soundtrack.",
    tags: ["Long-distance friends", "Album listening sessions"],
    style: "landing-use-friends",
  },
  {
    icon: Coffee,
    number: "03",
    label: "A LITTLE COMPANY FOR YOUR DAY",
    title: "Find your focus, together.",
    copy: "Bring your study group or remote coworkers into a shared listening room. Build a queue for the next work session and settle into the same rhythm.",
    tags: ["Study groups", "Coworking sessions"],
    style: "landing-use-focus",
  },
];
export function Capabilities() {
  return (
    <section
      id="use-cases"
      className="landing-section landing-container"
      aria-labelledby="use-cases-title"
    >
      <div className="landing-section-heading">
        <div>
          <p className="landing-eyebrow">A SOUNDTRACK FOR YOUR PEOPLE</p>
          <h2 id="use-cases-title">
            More ways to
            <br />
            <span className="landing-muted-heading">be together.</span>
          </h2>
        </div>
        <p>
          Same sofa or different cities.
          <br />
          There’s a room for that.
        </p>
      </div>
      <div className="landing-use-grid">
        {useCases.map(
          ({ icon: Icon, number, label, title, copy, tags, style }) => (
            <article className={`landing-use-card ${style}`} key={number}>
              <div className="landing-use-card-top">
                <span className="landing-use-icon">
                  <Icon size={25} strokeWidth={1.4} aria-hidden="true" />
                </span>
                <span>{number}</span>
              </div>
              <p className="landing-mini-label">{label}</p>
              <h3>{title}</h3>
              <p className="landing-use-copy">{copy}</p>
              <div className="landing-use-tags">
                {tags.map((tag) => (
                  <span key={tag}>{tag}</span>
                ))}
              </div>
            </article>
          ),
        )}
      </div>
      <div className="landing-benefits">
        <div>
          <Radio size={21} aria-hidden="true" />
          <h3>Playback that stays together</h3>
          <p>
            A shared timeline and ongoing drift correction keep devices working
            toward the same beat.
          </p>
        </div>
        <div>
          <ListMusic size={21} aria-hidden="true" />
          <h3>A queue everyone can enjoy</h3>
          <p>
            Add tracks to one shared queue. Anyone in the room can play, pause,
            or seek.
          </p>
        </div>
        <div>
          <Share2 size={21} aria-hidden="true" />
          <h3>One code brings you in</h3>
          <p>
            Invite people with a room code, link, or QR code. No complicated
            device pairing.
          </p>
        </div>
      </div>
      <Link href="/how-it-works" className="landing-text-link">
        A closer look at listening with SyncBeats{" "}
        <ArrowUpRight size={16} aria-hidden="true" />
      </Link>
    </section>
  );
}
