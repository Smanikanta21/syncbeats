import type { Metadata } from "next";
import { Mail, MapPin } from "lucide-react";
import Image from "next/image";
import { InstagramIcon } from "../components/InstagramFollowButton";
import { LandingNavbar } from "../components/LandingNavbar";
import { ContactForm } from "../components/ContactForm";
import { LandingFooterLinks } from "../components/LandingFooterLinks";
import { SyncScrollProvider } from "../context/SyncScrollContext";
import { AmbientField } from "../components/landing/AmbientField";
import { Hero } from "../components/landing/Hero";
import { MacAppTeaser } from "../components/landing/MacAppTeaser";
import { Capabilities } from "../components/landing/Capabilities";
import { FAQ } from "../components/landing/FAQ";
import { PwaRootRedirect } from "../components/pwa/PwaRootRedirect";

export const metadata: Metadata = {
  alternates: { canonical: "/" },
};

const CONTACTS = [
  { Icon: Mail, label: "Email", value: "support@syncbeats.in", href: "mailto:support@syncbeats.in" },
  { Icon: MapPin, label: "Location", value: "India" },
  {
    Icon: InstagramIcon,
    label: "Instagram",
    value: "@syncbeats.in",
    href: "https://www.instagram.com/syncbeats.in/",
    external: true,
  },
];

export default function LandingPage() {
  const structuredData = {
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "WebApplication",
        "@id": "https://www.syncbeats.in/#webapp",
        name: "SyncBeats",
        url: "https://www.syncbeats.in",
        applicationCategory: "MultimediaApplication",
        operatingSystem: "Web, iOS, Android, macOS, Windows, Linux",
        browserRequirements: "Requires modern web browser with Web Audio API support (Safari, Chrome, Firefox, Edge)",
        description:
          "Turn phones, tablets, and laptops into one synchronized sound system. Play music across multiple devices in real time with sub-25ms precision.",
        offers: {
          "@type": "Offer",
          price: "0",
          priceCurrency: "USD",
        },
        featureList: [
          "Sub-25ms precision multi-device synchronization",
          "Web Audio API master clock alignment",
          "3D Spatial audio stage panning",
          "Synchronized real-time lyrics display",
          "YouTube music streaming integration",
          "Spotify public playlist import",
          "Peer-to-peer WebRTC file transfer",
          "Upcoming native macOS CoreAudio companion app",
        ],
      },
      {
        "@type": "HowTo",
        "@id": "https://www.syncbeats.in/#howto",
        name: "How to Play Music on Multiple Devices Simultaneously",
        description: "Step-by-step guide to synchronizing music playback across smartphones, laptops, and tablets using SyncBeats.",
        step: [
          {
            "@type": "HowToStep",
            position: 1,
            name: "Create a Room",
            text: "Open SyncBeats in your web browser and click 'Start a Room' or 'Convert to Live Room' to generate a 6-digit room code or QR code.",
          },
          {
            "@type": "HowToStep",
            position: 2,
            name: "Join from Other Devices",
            text: "Have friends or your other devices enter the 6-digit room code in their browser. No app install required.",
          },
          {
            "@type": "HowToStep",
            position: 3,
            name: "Play Synchronized Music",
            text: "Search YouTube, import a Spotify playlist, or drop audio files. Press play and SyncBeats locks all devices into sub-25ms synchronized playback.",
          },
        ],
      },
    ],
  };

  return (
    <SyncScrollProvider>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(structuredData) }}
      />
      <div className="relative w-full overflow-x-clip bg-transparent font-sans text-foreground selection:bg-foreground selection:text-background">
        <PwaRootRedirect />
        <AmbientField />
        <LandingNavbar />

        {/* Hero Section: Interactive Playground & Direct Room Launcher */}
        <Hero />

        {/* macOS Native App Spotlight - Coming Soon */}
        <MacAppTeaser />

        {/* Technical Capabilities & Features Bento */}
        <Capabilities />

        {/* FAQ with Schema.org FAQPage structured data */}
        <FAQ />

        {/* Contact Section */}
        <section className="relative z-10 flex w-full flex-col items-center px-5 pb-16 sm:px-6">
          <div id="contact" className="mx-auto mb-12 flex w-full max-w-6xl flex-col gap-10">
            <h2 className="max-w-[20ch] font-display text-display font-semibold text-balance">
              Something broken, or an idea?
            </h2>

            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
              <div className="flex flex-col justify-center rounded-3xl border border-foreground/10 bg-foreground/2.5 p-7 md:p-10">
                <h3 className="mb-8 font-display text-title font-semibold">Reach us directly</h3>
                <div className="space-y-6">
                  {CONTACTS.map(({ Icon, label, value, href, external }) => (
                    <div key={label} className="flex items-center gap-4">
                      <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl border border-foreground/10">
                        <Icon className="h-4.5 w-4.5 text-foreground/50" />
                      </div>
                      <div>
                        <p className="mb-0.5 text-xs text-foreground/40">{label}</p>
                        {href ? (
                          <a
                            href={href}
                            {...(external ? { target: "_blank", rel: "noopener noreferrer" } : {})}
                            className="text-base font-medium transition-opacity hover:opacity-70"
                          >
                            {value}
                          </a>
                        ) : (
                          <p className="text-base font-medium">{value}</p>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              <ContactForm />
            </div>
          </div>

          <footer className="mx-auto mt-6 flex w-full max-w-6xl flex-col items-center justify-between gap-4 border-t border-foreground/10 pt-8 text-xs text-foreground/45 md:flex-row">
            <div className="flex items-center gap-3">
              <Image
                src="/favicon.svg"
                alt=""
                width={18}
                height={18}
                className="block opacity-50 grayscale"
              />
              SyncBeats © {new Date().getFullYear()}
            </div>
            <LandingFooterLinks />
          </footer>
        </section>
      </div>
    </SyncScrollProvider>
  );
}
