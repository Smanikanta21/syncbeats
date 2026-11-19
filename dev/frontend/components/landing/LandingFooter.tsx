import Link from "next/link";
import { ArrowUpRight } from "lucide-react";
import { BrandMark } from "./BrandMark";
export function LandingFooter() {
  return (
    <footer className="landing-footer landing-container">
      <div className="landing-footer-top">
        <div>
          <Link href="/" className="landing-brand">
            <BrandMark size={27} />
            <span>SyncBeats.</span>
          </Link>
          <p>
            Different devices. One shared beat.
            <br />
            Music is better with your people.
          </p>
        </div>
        <nav aria-label="Product links">
          <span>THE PRODUCT</span>
          <Link href="/hub">Start or join a room</Link>
          <Link href="/how-it-works">Listening guide</Link>
          <Link href="/#mac-app">Mac app · Coming soon</Link>
        </nav>
        <nav aria-label="Help and community">
          <span>STAY IN THE LOOP</span>
          <Link href="/contact">Contact us</Link>
          <a
            href="https://www.instagram.com/syncbeats.in/"
            target="_blank"
            rel="noopener noreferrer"
          >
            Instagram <ArrowUpRight size={13} aria-hidden="true" />
          </a>
          <a
            href="https://www.linkedin.com/company/syncbeats/"
            target="_blank"
            rel="noopener noreferrer"
          >
            LinkedIn <ArrowUpRight size={13} aria-hidden="true" />
          </a>
        </nav>
      </div>
      <div className="landing-footer-bottom">
        <span>© {new Date().getFullYear()} SyncBeats</span>
        <nav aria-label="Legal">
          <Link href="/privacy-policy">Privacy</Link>
          <Link href="/terms-of-service">Terms</Link>
          <Link href="/cookie-settings">Cookies</Link>
        </nav>
        <span>Made for shared moments.</span>
      </div>
    </footer>
  );
}
