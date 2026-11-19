import type { Metadata } from "next";
import Link from "next/link";
import { ArrowUpRight, Headphones } from "lucide-react";
import { LandingNavigation } from "@/components/LandingNavigation";
import { LandingFooter } from "@/components/landing/LandingFooter";
import { PwaRootRedirect } from "@/components/pwa/PwaRootRedirect";
import { Hero } from "@/components/landing/Hero";
import { Capabilities } from "@/components/landing/Capabilities";
import { HowItWorks } from "@/components/landing/HowItWorks";
import { MacApp } from "@/components/landing/MacApp";
import { FAQ } from "@/components/landing/FAQ";
import {
  LANDING_FAQS,
  SITE_DESCRIPTION,
  SITE_TITLE,
  SITE_URL,
} from "@/lib/site";
import "./landing.css";

export const metadata: Metadata = {
  title: { absolute: SITE_TITLE },
  description: SITE_DESCRIPTION,
  alternates: { canonical: "/" },
  openGraph: {
    title: SITE_TITLE,
    description: SITE_DESCRIPTION,
    url: SITE_URL,
  },
  twitter: {
    card: "summary_large_image",
    title: SITE_TITLE,
    description: SITE_DESCRIPTION,
  },
};
const structuredData = {
  "@context": "https://schema.org",
  "@graph": [
    {
      "@type": "Organization",
      "@id": `${SITE_URL}/#organization`,
      name: "SyncBeats",
      url: SITE_URL,
      logo: `${SITE_URL}/icon-512.png`,
      sameAs: [
        "https://www.instagram.com/syncbeats.in/",
        "https://www.linkedin.com/company/syncbeats/",
      ],
    },
    {
      "@type": "WebSite",
      "@id": `${SITE_URL}/#website`,
      name: "SyncBeats",
      url: SITE_URL,
      description: SITE_DESCRIPTION,
      publisher: { "@id": `${SITE_URL}/#organization` },
      inLanguage: "en",
    },
    {
      "@type": "WebApplication",
      "@id": `${SITE_URL}/#app`,
      name: "SyncBeats",
      url: SITE_URL,
      applicationCategory: "MultimediaApplication",
      operatingSystem: "Web browser",
      browserRequirements:
        "Requires JavaScript, an internet connection, and a modern browser.",
      description: SITE_DESCRIPTION,
      isAccessibleForFree: true,
      offers: { "@type": "Offer", price: "0", priceCurrency: "USD" },
      featureList: [
        "Synchronized music playback across devices",
        "Shared listening rooms and queue",
        "Room code, link, and QR invitations",
        "Audio uploads and in-room music search",
      ],
      publisher: { "@id": `${SITE_URL}/#organization` },
    },
    {
      "@type": "FAQPage",
      "@id": `${SITE_URL}/#faq`,
      mainEntity: LANDING_FAQS.map(({ question, answer }) => ({
        "@type": "Question",
        name: question,
        acceptedAnswer: { "@type": "Answer", text: answer },
      })),
    },
  ],
};
export default function Home() {
  return (
    <div className="site-gradient-page landing-page">
      <PwaRootRedirect />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify(structuredData).replace(/</g, "\\u003c"),
        }}
      />
      <a href="#main-content" className="landing-skip-link">
        Skip to content
      </a>
      <LandingNavigation />
      <main id="main-content">
        <Hero />
        <div className="landing-proof-strip landing-container">
          <span>ONE SHARED ROOM</span>
          <p>
            Your people. Your music. <strong>All together.</strong>
          </p>
          <Headphones size={23} strokeWidth={1.4} aria-hidden="true" />
        </div>
        <Capabilities />
        <HowItWorks />
        <MacApp />
        <FAQ />
        <section
          className="landing-final-cta landing-container"
          aria-labelledby="start-title"
        >
          <span className="landing-cta-icon">
            <Headphones size={26} aria-hidden="true" />
          </span>
          <p className="landing-eyebrow">GOOD MUSIC DESERVES COMPANY</p>
          <h2 id="start-title">
            Bring your people.
            <br />
            <span className="landing-emphasis-text">We’ll bring the sync.</span>
          </h2>
          <p>Your next shared listening session starts with one room.</p>
          <Link href="/room/default" className="landing-button landing-button-primary">
            Open your room <ArrowUpRight size={18} aria-hidden="true" />
          </Link>
          <small>
            Already have a room code? <a href="#join-room-code">Join your friends</a>
          </small>
        </section>
      </main>
      <LandingFooter />
    </div>
  );
}
