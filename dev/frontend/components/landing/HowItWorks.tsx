import Link from "next/link";
import { ArrowUpRight, Check, Copy, Music2, Plus, Users } from "lucide-react";
export function HowItWorks() {
  return (
    <section
      id="how-it-works"
      className="landing-section landing-steps-section"
      aria-labelledby="how-it-works-title"
    >
      <div className="landing-container">
        <div className="landing-section-heading">
          <div>
            <p className="landing-eyebrow">LESS SETUP. MORE LISTENING.</p>
            <h2 id="how-it-works-title">
              From “send me that song”
              <br />
              <span className="landing-muted-heading">
                to listening together.
              </span>
            </h2>
          </div>
          <Link href="/room/default" className="landing-button landing-button-secondary">
            Open your room <ArrowUpRight size={17} aria-hidden="true" />
          </Link>
        </div>
        <div className="landing-steps-grid">
          <article className="landing-step">
            <div className="landing-step-visual" aria-hidden="true">
              <div className="landing-mini-room">
                <span className="landing-mini-icon">
                  <Music2 size={22} />
                </span>
                <span>
                  Your next listening room<small>A place for your people</small>
                </span>
                <Plus size={18} />
              </div>
            </div>
            <span className="landing-step-number">01 / CREATE</span>
            <h3>Make room for music.</h3>
            <p>
              Open SyncBeats in your browser, create a free account, and start a
              listening room.
            </p>
          </article>
          <article className="landing-step">
            <div className="landing-step-visual" aria-hidden="true">
              <div className="landing-code">
                <span>YOUR ROOM CODE</span>
                <div>
                  4 8 2 9 1 6 <Copy size={17} />
                </div>
                <small>
                  <Users size={13} /> A little invite. A shared experience.
                </small>
              </div>
            </div>
            <span className="landing-step-number">02 / INVITE</span>
            <h3>Send the code around.</h3>
            <p>
              Share your six-digit code, room link, or QR code. Friends sign in
              and join on their own devices.
            </p>
          </article>
          <article className="landing-step">
            <div className="landing-step-visual" aria-hidden="true">
              <div className="landing-mini-queue">
                <div>
                  <span className="landing-queue-art">
                    <Music2 size={18} />
                  </span>
                  <span>
                    Your shared soundtrack<small>Everyone’s ready</small>
                  </span>
                  <Check size={16} />
                </div>
                <div className="landing-mini-wave">
                  {Array.from({ length: 28 }, (_, i) => (
                    <i key={i} style={{ height: `${10 + ((i * 7) % 23)}px` }} />
                  ))}
                </div>
              </div>
            </div>
            <span className="landing-step-number">03 / PLAY</span>
            <h3>Meet on the same beat.</h3>
            <p>
              Upload your audio or find a track in the room. Once everyone’s
              audio is ready, press play and listen together.
            </p>
          </article>
        </div>
      </div>
    </section>
  );
}
