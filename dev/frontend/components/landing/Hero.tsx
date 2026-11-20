import { ArrowUpRight, Monitor, Smartphone, Tablet } from "lucide-react";
import { LiveRoomShowcase } from "./LiveRoomShowcase";
import { RoomEntry } from "./RoomEntry";

export function Hero() {
  return (
    <section
      className="landing-hero landing-container"
      aria-labelledby="hero-title"
    >
      <div className="landing-hero-copy">
        <a href="#mac-app" className="landing-announcement">
          <span className="landing-status-dot" /> Made for the browser. Coming
          to Mac. <ArrowUpRight size={14} aria-hidden="true" />
        </a>
        <p className="landing-eyebrow">MUSIC IS BETTER TOGETHER</p>
        <h1 id="hero-title">
          Your music.
          <br />
          <span className="landing-emphasis-text">Together, in sync.</span>
        </h1>
        <p className="landing-hero-description">
          Play the same music on every phone, tablet, and laptop. Open a room,
          share the code, and listen together—from the same sofa or different
          cities.
        </p>
        <RoomEntry />
        <div
          className="landing-device-list"
          aria-label="Available in modern browsers on phones, tablets, and computers"
        >
          <span>
            <Smartphone size={16} aria-hidden="true" /> Phones
          </span>
          <span>
            <Tablet size={16} aria-hidden="true" /> Tablets
          </span>
          <span>
            <Monitor size={16} aria-hidden="true" /> Computers
          </span>
        </div>
      </div>
      <LiveRoomShowcase />
    </section>
  );
}
