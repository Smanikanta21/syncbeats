import Link from "next/link";
import { ArrowUpRight, Check, Monitor, Music2 } from "lucide-react";
export function MacApp() {
  return (
    <section
      id="mac-app"
      className="landing-section landing-container"
      aria-labelledby="mac-app-title"
    >
      <div className="landing-mac-panel">
        <div className="landing-mac-copy">
          <span className="landing-soon-badge">
            <span className="landing-status-dot" /> ON THE WAY
          </span>
          <p className="landing-eyebrow">A NEW HOME FOR YOUR SOUND</p>
          <h2 id="mac-app-title">
            Your Mac.
            <br />
            Our next stage.
          </h2>
          <p>
            A dedicated SyncBeats app for Mac is in the works. The same
            idea—bringing your devices and your people together—with a home of
            its own on your desktop.
          </p>
          <div className="landing-mac-status">
            <Monitor size={18} aria-hidden="true" />
            <span>
              Native Mac app <strong>Coming soon</strong>
            </span>
          </div>
          <Link href="/room/default" className="landing-text-link">
            Listen in your browser today{" "}
            <ArrowUpRight size={17} aria-hidden="true" />
          </Link>
          <small>Release date to be announced. Updates will appear here.</small>
        </div>
        <div
          className="landing-mac-art"
          aria-label="Concept preview of the upcoming SyncBeats Mac app"
        >
          <div className="landing-mac-window" aria-hidden="true">
            <div className="landing-window-bar">
              <span />
              <span />
              <span />
              <p>SyncBeats for Mac</p>
            </div>
            <div className="landing-mac-window-body">
              <div className="landing-mac-sidebar">
                <Music2 size={19} />
                <span className="active" />
                <span />
                <span />
                <span />
              </div>
              <div className="landing-mac-main">
                <div className="landing-mac-heading">
                  <span>Your room</span>
                  <span>
                    <Check size={10} /> Together
                  </span>
                </div>
                <div className="landing-mac-album">
                  <div className="landing-mac-vinyl" />
                  <span>
                    Make yourself
                    <br />
                    <i>at home.</i>
                  </span>
                </div>
                <div className="landing-mac-track">
                  <div>
                    <strong>A little closer</strong>
                    <span>The together sessions</span>
                  </div>
                  <Music2 size={18} />
                </div>
                <div className="landing-mac-progress" />
                <div className="landing-mac-queue-line" />
                <div className="landing-mac-queue-line short" />
              </div>
            </div>
          </div>
          <span className="landing-concept-label">
            A little look ahead · Design concept
          </span>
        </div>
      </div>
    </section>
  );
}
