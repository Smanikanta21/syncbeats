import type { Metadata } from "next";
import Link from "next/link";
import { PublicInfoPage } from "../../components/PublicInfoPage";

export const metadata: Metadata = {
  title: "Privacy Policy — SyncBeats",
  description: "Learn how SyncBeats collects, uses, and protects your data.",
  alternates: { canonical: "/privacy-policy" },
  robots: { index: true, follow: true },
};

const contents = [
  { id: "who-this-policy-covers", label: "Who this policy covers" },
  { id: "information-we-collect", label: "Information we collect" },
  { id: "how-information-is-used-and-shared", label: "How information is used and shared" },
  { id: "cookies-analytics-and-technical-diagnostics", label: "Cookies, analytics, and technical diagnostics" },
  { id: "storage-retention-and-security", label: "Storage, retention, and security" },
  { id: "mac-beta", label: "Mac beta interest list" },
  { id: "your-choices-age-and-updates", label: "Your choices, age, and updates" },
];

export default function Page() {
  return (
    <PublicInfoPage title="Privacy policy" description="How we handle your account, listening activity, and beta signup details." eyebrow="Your data" updated="20 November 2026" contents={contents}>
      <section id="who-this-policy-covers">
      <h2>Who this policy covers</h2>
      <div>
      <p>SyncBeats is a shared listening service at syncbeats.in. This notice covers the website, accounts, listening rooms, and the Mac beta interest list. For privacy requests, contact the maintainers through our <Link href="/contact">Contact page</Link>.</p>
      </div>
      </section>

      <section id="information-we-collect">
      <h2>Information we collect</h2>
      <div>
      <p>Account information includes your name, email, authentication provider, and a password hash if you register with a password. Google sign-in provides the basic profile details needed to sign you in. We also store account verification and password-reset records.</p>
      <p>Using the service can store room membership, queues, uploaded audio, playlists, listening and search history, music preferences, feedback, and registered device information. Devices may report browser and operating-system details, audio-device labels, and network or playback measurements such as latency, jitter, clock offset, and drift.</p>
      <p>Our servers and hosting providers process connection information such as IP addresses, request paths, and error details for delivery, reliability, and abuse prevention. Optional website analytics can process page visits, referrers, browser details, and approximate location when you allow analytics.</p>
      </div>
      </section>

      <section id="how-information-is-used-and-shared">
      <h2>How information is used and shared</h2>
      <div>
      <p>We use this information to authenticate accounts, deliver and synchronize audio, remember rooms and playlists, personalize recommendations, troubleshoot problems, and prevent abuse. Account-related emails include verification and password recovery.</p>
      <p>Other participants in a room can see room state, queue information, your display name, and connected-device information. Signed-in user search can return profile names and email addresses. Join only rooms whose participants you are comfortable sharing with.</p>
      <p>We do not sell personal information. Hosting and storage providers, Google for sign-in, Resend for account email, and Sentry for technical monitoring process information needed to provide their functions. Music lookup and playback can send track metadata or requests to the relevant music providers. Third-party services have their own privacy policies.</p>
      </div>
      </section>

      <section id="cookies-analytics-and-technical-diagnostics">
      <h2>Cookies, analytics, and technical diagnostics</h2>
      <div>
      <p>Essential cookies and browser storage keep you signed in and remember device identifiers, preferences, and cached audio. They are needed for the features you use. The current browser session token is accessible to browser scripts; keep your device and browser secure.</p>
      <p>Optional Google Analytics, Ahrefs analytics, and Vercel analytics and performance insights load only when you save an analytics opt-in. You can change that choice in <Link href="/cookie-settings">Cookie settings</Link>. Revoking consent reloads the page to stop previously loaded analytics scripts. Marketing consent is not requested.</p>
      <p>Server logs, Sentry error/performance monitoring, and playback telemetry support reliability and security independently of optional page analytics. Browser session replay is disabled. These diagnostics are different from an acoustic recording of your speakers; the web player does not record your microphone for synchronization.</p>
      </div>
      </section>

      <section id="storage-retention-and-security">
      <h2>Storage, retention, and security</h2>
      <div>
      <p>The current backend is hosted in the United States. Other service providers may process data in other countries. Using SyncBeats can therefore involve international processing, including when you connect from India or elsewhere.</p>
      <p>We retain account, room, media, and history records as needed to operate the service and address support requests. We do not currently publish a fixed automatic deletion period for all of these categories. Diagnostic and hosting-log retention depends on the system and provider configuration. Contact us to request access, correction, deletion, or information about a particular record.</p>
      <p>Passwords are hashed and public web connections use HTTPS. No service can guarantee absolute security or uninterrupted access. Deletion may take additional time for backups or records that must be kept for a legal obligation. The separate Mac beta retention rule is described below.</p>
      </div>
      </section>

      <section id="mac-beta">
      <h2>Mac beta interest list</h2>
      <div>
      <p>The beta form collects your email and, if you choose to provide them, your name, Mac chip, macOS version, and testing interests. We record the consent version and date to document your request for beta invitations. The form does not create an account or subscribe you to general marketing.</p>
      <p>We use these details to organize testing and contact you about Mac beta access. Requests expire after 180 days and are removed during scheduled cleanup. You can ask us to withdraw or delete your request through <Link href="/contact">Contact</Link>. A request does not guarantee an invitation.</p>
      <p>Any native build will explain the permissions needed for its features. Do not include passwords, private library files, or other sensitive details in the signup form.</p>
      </div>
      </section>

      <section id="your-choices-age-and-updates">
      <h2>Your choices, age, and updates</h2>
      <div>
      <p>Depending on your location, you may have rights to access, correct, delete, restrict, object to processing, or obtain a copy of personal data. Contact us using the email listed on the <Link href="/contact">Contact page</Link>; do not post personal records in public GitHub issues. We may need to verify your identity before acting on an account request.</p>
      <p>SyncBeats is not intended for children under 13. If your location requires a higher age for consenting to online services, meet that requirement or obtain appropriate parent or guardian consent. Contact us if a child has provided personal information.</p>
      <p>We may update this notice as features and providers change. The date above identifies this version. Material changes will be explained where appropriate.</p>
      </div>
      </section>
    </PublicInfoPage>
  );
}
