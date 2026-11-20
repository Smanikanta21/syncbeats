import type { Metadata } from "next";
import Link from "next/link";
import { ArrowUpRight } from "lucide-react";
import { LandingNavigation } from "@/components/LandingNavigation";
import { LandingFooter } from "@/components/landing/LandingFooter";
import { SITE_URL } from "@/lib/site";
import "../landing.css";

const title = "How to Listen to Music Together Across Devices";
const description =
  "Learn how to create a SyncBeats room, invite friends, share a music queue, and get better synchronized playback on phones, tablets, and laptops.";
export const metadata: Metadata = {
  title,
  description,
  alternates: { canonical: "/how-it-works" },
  openGraph: {
    title: `${title} | SyncBeats`,
    description,
    url: `${SITE_URL}/how-it-works`,
  },
  twitter: {
    card: "summary_large_image",
    title: `${title} | SyncBeats`,
    description,
  },
};
export default function ListeningGuide() {
  return (
    <div className="site-gradient-page landing-page">
      <a className="landing-skip-link" href="#main-content">
        Skip to content
      </a>
      <LandingNavigation />
      <main id="main-content" className="landing-guide landing-container">
        <Link href="/" className="landing-text-link">
          SyncBeats / Listening guide
        </Link>
        <h1>
          How to listen to music
          <br />
          <span className="landing-emphasis-text">
            together, from anywhere.
          </span>
        </h1>
        <p className="landing-guide-lead">
          SyncBeats lets multiple devices play the same music on a shared
          timeline. Create a listening room in your browser, invite your
          friends, and build a soundtrack together—whether you’re in the same
          home or different cities.
        </p>
        <nav className="landing-guide-nav" aria-label="On this page">
          <a href="#getting-started">Get started</a>
          <a href="#music">Add music</a>
          <a href="#devices">Devices & connection</a>
          <a href="#better-sync">Better sync</a>
          <a href="#ideas">Listening ideas</a>
          <a href="#mac">Mac app</a>
        </nav>
        <section id="getting-started">
          <h2>Start a shared listening room</h2>
          <ol>
            <li>
              <strong>Open SyncBeats and sign in.</strong> The current web app
              is free to use. Create an account if this is your first visit,
              then open the room hub.
            </li>
            <li>
              <strong>Create a room.</strong> Your room brings the queue,
              playback controls, and connected listeners into one place.
            </li>
            <li>
              <strong>Invite your friends.</strong> Share the six-digit room
              code, room link, or QR code. Each person signs in and joins the
              same room on their device.
            </li>
            <li>
              <strong>Add a track and let it load.</strong> Give connected
              devices a moment to prepare their audio. If a browser asks for
              interaction to enable sound, tap its playback control.
            </li>
            <li>
              <strong>Press play together.</strong> SyncBeats schedules playback
              for the room. Anyone in the room can play, pause, or seek, so
              choose the next moment together.
            </li>
          </ol>
          <Link href="/room/default" className="landing-button landing-button-primary">
            Start or join a room <ArrowUpRight size={16} aria-hidden="true" />
          </Link>
        </section>
        <section id="music">
          <h2>Bring music to the shared queue</h2>
          <p>
            Upload audio files you have permission to share, or use the music
            search available in your room. Add tracks to the shared queue so
            listeners follow the same order. You can also use the room’s shuffle
            and repeat controls to change the listening flow.
          </p>
          <p>
            Track availability depends on the music source. SyncBeats does not
            unlock paid streaming subscriptions or promise that every song from
            an external service will be available. If a track cannot load, try
            another source or an audio file you can share.
          </p>
        </section>
        <section id="devices">
          <h2>Listen on phones, tablets, and computers</h2>
          <p>
            The web app runs in modern browsers, including browsers on iPhone,
            Android, Mac, and Windows devices. No dedicated app installation is
            required to get started. Browser audio permissions and device
            behavior can vary, so try a short track before a longer listening
            session.
          </p>
          <p>
            Everyone needs an internet connection, but you do not have to use
            the same Wi-Fi network. A friend on a different connection can join
            the same room. For several devices playing out loud in one space,
            stable Wi-Fi can help reduce changes in network timing.
          </p>
          <p>
            Keep the listening room open while playing. Background tabs, screen
            locking, and battery-saving settings can interrupt browser audio or
            affect timing, particularly on mobile devices. The current web app
            is not an offline LAN music system.
          </p>
        </section>
        <section id="better-sync">
          <h2>Get the best playback alignment</h2>
          <p>
            SyncBeats estimates the clock difference between each device and the
            server, schedules a shared start time, and checks for playback
            drift. It corrects timing differences as the session continues. This
            helps devices stay aligned without requiring you to press play on
            each one at exactly the same moment.
          </p>
          <ul>
            <li>
              <strong>Let new devices settle.</strong> After joining, allow a
              few seconds for clock measurements and audio loading.
            </li>
            <li>
              <strong>Use a steady connection.</strong> Heavy downloads, weak
              Wi-Fi, and connection changes can affect synchronization.
            </li>
            <li>
              <strong>Check your audio output.</strong> Bluetooth speakers and
              headphones can add their own delay. Different audio hardware may
              sound slightly offset even when browser playback follows the same
              timeline.
            </li>
            <li>
              <strong>Keep the room active.</strong> If sound stops after
              switching apps or locking your phone, return to the room and
              follow any audio prompt.
            </li>
            <li>
              <strong>Try another track if loading stalls.</strong> A source or
              file problem can prevent the room from becoming ready.
            </li>
          </ul>
          <p>
            Synchronization varies by browser, network, and audio hardware.
            SyncBeats does not guarantee a fixed latency or perfectly aligned
            speaker output on every device. For help with a specific setup,{" "}
            <Link href="/contact">contact the team</Link> with the device,
            browser, and symptoms.
          </p>
        </section>
        <section id="ideas">
          <h2>Make a room for the way you listen</h2>
          <h3>Music around the home</h3>
          <p>
            Bring a laptop and phones into one listening room during dinner prep
            or a small gathering. Start with moderate volume and check alignment
            where the sound overlaps. This is a way to share playback across the
            devices you already have.
          </p>
          <h3>A listening session with distant friends</h3>
          <p>
            Share a room code before your next call, choose an album or a
            handful of tracks, and take turns adding music. Separate internet
            connections are supported. SyncBeats supplies the shared soundtrack;
            use your preferred calling app if you want to talk.
          </p>
          <h3>A soundtrack for study or work</h3>
          <p>
            Create a queue for a study group or remote coworking session.
            Everyone can listen on their own device, and shared playback makes
            breaks and track changes part of the same session.
          </p>
        </section>
        <section id="mac">
          <h2>SyncBeats for Mac is coming soon</h2>
          <p>
            A native Mac app is in development. There is no announced release
            date or public download yet. You can use SyncBeats on your Mac in a
            browser today, and check the{" "}
            <Link href="/#mac-app">Mac app section</Link> for release updates.
          </p>
        </section>
      </main>
      <LandingFooter />
    </div>
  );
}
