import type { Metadata } from "next";
import Link from "next/link";
import { PublicInfoPage } from "../../components/PublicInfoPage";

export const metadata: Metadata = {
  title: "Terms of Service — SyncBeats",
  description: "Read SyncBeats' Terms of Service. By using our service, you agree to these terms.",
  alternates: { canonical: "/terms-of-service" },
  robots: { index: true, follow: true },
};

const contents = [
  { id: "acceptance-and-scope", label: "Acceptance and scope" },
  { id: "open-source-license-and-acceptable-use", label: "Open-source license and acceptable use" },
  { id: "accounts-and-shared-rooms", label: "Accounts and shared rooms" },
  { id: "music-uploads-and-third-party-services", label: "Music, uploads, and third-party services" },
  { id: "mac-beta-participation", label: "Mac beta participation" },
  { id: "availability-warranties-and-liability", label: "Availability, warranties, and liability" },
  { id: "changes-and-contact", label: "Changes and contact" },
];

export default function Page() {
  return (
    <PublicInfoPage title="Terms of service" description="The ground rules for shared listening and using SyncBeats." eyebrow="Using SyncBeats" updated="20 November 2026" contents={contents}>
      <section id="acceptance-and-scope">
      <h2>Acceptance and scope</h2>
      <div>
      <p>These terms cover access to the hosted SyncBeats service and participation in its Mac beta program. By using the service, you agree to these terms. If you do not agree, stop using the hosted service. Our <Link href="/privacy-policy">Privacy Policy</Link> explains how information is handled.</p>
      <p>You must be at least 13 and meet any higher applicable age or consent requirement in your location. If you need a parent or guardian’s consent, obtain it before using the service.</p>
      </div>
      </section>

      <section id="open-source-license-and-acceptable-use">
      <h2>Open-source license and acceptable use</h2>
      <div>
      <p>The SyncBeats repository is licensed under MIT. Rights to use, copy, modify, distribute, and commercially reuse covered source code are governed by the repository’s <a href="https://github.com/Smanikanta21/syncbeats/blob/main/LICENSE">LICENSE</a>, including its notice and warranty terms. These hosted-service terms do not take away those open-source rights. Third-party code and media remain subject to their own licenses.</p>
      <p>When using our hosted service, do not access accounts or systems without authorization, interfere with other users, bypass access controls, upload malware, or use the service unlawfully. An open-source license does not grant rights to someone else’s music, account, or trademarks.</p>
      </div>
      </section>

      <section id="accounts-and-shared-rooms">
      <h2>Accounts and shared rooms</h2>
      <div>
      <p>Keep your credentials secure and provide accurate account information. You are responsible for activity you authorize through your account. Contact us promptly if you suspect unauthorized access.</p>
      <p>Rooms are shared spaces: permitted participants can affect playback and the queue. Private-room approval and other controls do not make a room confidential from everyone you admit. The service may restrict accounts or remove content to address abuse, legal requests, or operational problems.</p>
      </div>
      </section>

      <section id="music-uploads-and-third-party-services">
      <h2>Music, uploads, and third-party services</h2>
      <div>
      <p>You retain rights to your own content. By uploading or queueing content, you represent that you have the permissions needed for the intended storage, playback, and sharing. You grant SyncBeats the limited permission needed to store and transmit that content to provide the features you request.</p>
      <p>Owning a device, having a music subscription, or finding a track online does not automatically grant public-performance, redistribution, or broadcasting rights. Respect applicable copyright law and the terms of music providers you use.</p>
      <p>Availability of search results, streams, metadata, and integrations depends on third-party providers and may change. We may review reports and remove or restrict content when appropriate.</p>
      </div>
      </section>

      <section id="mac-beta-participation">
      <h2>Mac beta participation</h2>
      <div>
      <p>The Mac app is in development. Joining the interest list requests beta invitations; it does not guarantee access, supported hardware, a release date, or a particular feature. Build requirements and testing instructions will be provided with invitations.</p>
      <p>Beta software may contain bugs, lose state, change behavior, or stop working. Use it with content and devices you are comfortable testing. You may provide feedback voluntarily and withdraw from the invitation list through <Link href="/contact">Contact</Link>.</p>
      </div>
      </section>

      <section id="availability-warranties-and-liability">
      <h2>Availability, warranties, and liability</h2>
      <div>
      <p>To the extent permitted by applicable law, the hosted service and beta software are provided “as is” and “as available,” without warranties. We cannot guarantee uninterrupted availability or perfectly synchronized audible playback on every device and network.</p>
      <p>To the extent permitted by law, SyncBeats and its maintainers are not liable for indirect or consequential losses, lost data, or business interruption. Where lawful, total liability is limited to the amount you paid for the service in the preceding 12 months. These terms do not exclude rights or liabilities that cannot legally be excluded, including mandatory consumer protections.</p>
      </div>
      </section>

      <section id="changes-and-contact">
      <h2>Changes and contact</h2>
      <div>
      <p>Features, availability, and these terms may change. Updated terms will carry a new date, and material changes will be communicated where appropriate. You can stop using the hosted service if you disagree with an update.</p>
      <p>For service questions, privacy requests, or a copyright concern, use our <Link href="/contact">Contact page</Link>. Include enough information to identify a copyright concern and your authority to raise it; avoid posting private details in public issues.</p>
      </div>
      </section>
    </PublicInfoPage>
  );
}
