// app/layout.tsx
import type { Metadata, Viewport } from "next";
import { Syne, JetBrains_Mono, Instrument_Sans } from "next/font/google";
import Script from "next/script";
import "./globals.css";
import { AuthProvider } from "../context/AuthContext";
import { AudioProvider } from "../context/AudioContext";
import { ThemeProvider } from "../context/ThemeProvider";
import { Analytics } from "@vercel/analytics/react";
import { SpeedInsights } from "@vercel/speed-insights/next";
import { Toaster } from "sonner";
import SmoothScrolling from "../components/SmoothScrolling";

import { ConnectionProvider } from "../context/ConnectionContext";
import { ConnectionStatusModal } from "../components/ConnectionStatusModal";
import { VisualizerProvider } from "../context/VisualizerContext";
import { cn } from "@/lib/utils";
import {IOSHomeScreenPrompt} from '../components/IOSHomeScreenPrompt'
import { BeatProvider } from "../context/BeatContext";
import { NavigationProgress } from "../components/NavigationProgress";
import { CustomCursor } from "../components/CustomCursor";


/**
 * Font variables are deliberately named after the typeface, not after the role
 * (`--font-sans` / `--font-mono`). Those role names are Tailwind `@theme` tokens;
 * when next/font also emitted them, both landed on <html> at equal specificity
 * and which one won came down to stylesheet order. Keeping the two layers
 * separate means globals.css maps role -> face in exactly one place.
 */
const instrumentSans = Instrument_Sans({
  variable: "--font-instrument",
  subsets: ["latin"],
  preload: true,
  display: "swap",
  // Variable font — the full 400-700 range, not pinned instances. The room runs
  // at high density and leans on weight rather than size for hierarchy.
  axes: ["wdth"],
});

const jetbrainsMono = JetBrains_Mono({
  variable: "--font-jetbrains",
  subsets: ["latin"],
  preload: true,
  display: "swap",
  weight: ["400", "600", "700"],
});

/**
 * Display face. Syne's width grows with its weight — the glyphs genuinely get
 * wider as they get bolder, which no normal grotesque does. That is why it is
 * here: a heading animating `font-weight` 400 -> 800 reads as amplitude
 * swelling rather than as text turning bold, and amplitude is the product.
 *
 * Loaded variable (no `weight`) so the whole 400-800 range is animatable.
 * Replaces Bricolage Grotesque, whose `wdth` axis served the same gesture but
 * had to be driven through `font-stretch` — an axis most engines refuse to
 * interpolate smoothly, so the animation stepped.
 */
const syne = Syne({
  variable: "--font-syne",
  subsets: ["latin"],
  preload: true,
  display: "swap",
});

const BASE_URL = "https://www.syncbeats.in";

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  // Pinch-zoom is deliberately left enabled. It was previously blocked with
  // `maximumScale: 1, userScalable: false`, which Lighthouse reports as both an
  // accessibility failure and a mobile-usability signal — and the room UI never
  // needed it: nothing here is a map or a canvas that fights a pinch.
  viewportFit: "cover",
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#ffffff" },
    { media: "(prefers-color-scheme: dark)", color: "#000000" },
  ],
};

export const metadata: Metadata = {
  metadataBase: new URL(BASE_URL),
  appleWebApp: {
    capable: true,
    statusBarStyle: "black-translucent",
    title: "SyncBeats",
  },
  title: {
    template: "%s | SyncBeats",
    default: "SyncBeats | Play one song on every phone in the room",
  },
  description:
    "Turn every phone, tablet and laptop in the room into one speaker. SyncBeats keeps them under 25 ms apart in the browser — no app, no cables, free.",
  keywords: [
    "syncbeats",
    "play music on multiple phones at once",
    "sync music across devices",
    "listen to music together",
    "multi device speaker app",
    "group listening party",
    "spatial audio from phones",
    "AmpMe alternative",
  ],
  openGraph: {
    title: "SyncBeats — one song, every phone in the room",
    description:
      "Share a six-character code and every device becomes a speaker, under 25 ms apart. Free, in the browser.",
    url: BASE_URL,
    siteName: "SyncBeats",
    images: [
      {
        url: "/syncbeats-og.png",
        width: 1200,
        height: 630,
        alt: "SyncBeats — synchronized music player",
      },
    ],
    locale: "en_US",
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "SyncBeats — one song, every phone in the room",
    description:
      "Share a six-character code and every device becomes a speaker, under 25 ms apart. Free, in the browser.",
    site: "@syncbeatsapp",
    creator: "@syncbeatsapp",
    images: ["/syncbeats-og.png"],
  },
  manifest: "/manifest.json",
  icons: {
    icon: [
      { url: "/icon-192.png", sizes: "192x192", type: "image/png" },
      { url: "/favicon.svg", type: "image/svg+xml" }
    ],
    shortcut: "/apple-touch-icon.png",
    apple: [
      { url: "/apple-touch-icon.png", sizes: "180x180", type: "image/png" }
    ],
  },
  applicationName: "SyncBeats",
  authors: [{ name: "SyncBeats", url: BASE_URL }],
  category: "music",
  // NOTE: no `alternates.canonical` here on purpose. Metadata in the root layout
  // is inherited by every route that doesn't override it, so a canonical set
  // here made /contact, /privacy-policy and /terms-of-service all declare
  // themselves duplicates of the homepage — which is an instruction to Google
  // not to index them separately. Each indexable page now sets its own.
  robots: {
    index: true,
    follow: true,
    googleBot: {
      index: true,
      follow: true,
      "max-video-preview": -1,
      "max-image-preview": "large",
      "max-snippet": -1,
    },
  },
};

/**
 * Structured data. Deliberately only the two types that still do work:
 * Organization (knowledge-panel / sameAs resolution) and WebApplication
 * (category, price, platform). HowTo and FAQPage rich results were both pulled
 * back by Google in 2023 — FAQPage now only renders for government and health
 * sites — so the FAQ section earns its place as readable copy that matches what
 * people search for, not as a markup trick. The FAQPage block it still emits
 * costs nothing and keeps the Q&A machine-legible.
 */
const jsonLd = [
  {
    "@context": "https://schema.org",
    "@type": "Organization",
    name: "SyncBeats",
    url: BASE_URL,
    logo: `${BASE_URL}/icon-192.png`,
    sameAs: [
      "https://www.instagram.com/syncbeats.in/",
      "https://github.com/Smanikanta21/syncbeats"
    ],
  },
  {
    "@context": "https://schema.org",
    "@type": "WebApplication",
    name: "SyncBeats",
    url: BASE_URL,
    description:
      "SyncBeats plays one song across every phone, tablet and laptop in a room at the same instant — under 25 ms apart, in the browser, with no app to install.",
    applicationCategory: "MusicApplication",
    operatingSystem: "iOS, Android, macOS, Windows, Linux",
    browserRequirements: "Requires a modern browser with Web Audio support",
    inLanguage: "en",
    sameAs: [
      "https://www.instagram.com/syncbeats.in/",
      "https://github.com/Smanikanta21/syncbeats"
    ],
    offers: {
      "@type": "Offer",
      price: "0",
      priceCurrency: "USD",
    },
    featureList: [
      "Synchronized playback under 25 ms across devices",
      "Join by six-character room code or QR scan",
      "Spatial audio routing across participants",
      "Shared queue with YouTube search and Spotify playlist import",
      "Beat-matched lyrics",
      "Per-device headphone latency correction",
      "Private rooms with join approval",
      "No install required",
    ],
  }
];

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      suppressHydrationWarning
      className={`${instrumentSans.variable} ${jetbrainsMono.variable} ${syne.variable} antialiased`}
    >
      <head>
        {/* JSON-LD structured data */}
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
        />
      </head>

      {/* Google Analytics */}
      <Script
        async
        src="https://www.googletagmanager.com/gtag/js?id=G-9D67M1G5XC"
        strategy="afterInteractive"
      />
      <Script id="google-analytics" strategy="afterInteractive">
        {`
          try {
            const isDev = window.location.hostname === 'dev.syncbeats.in' || window.location.hostname === 'dev.syncbeats.app' || window.location.hostname === 'localhost';
            let isAdmin = false;
            
            // Read sb_token from cookies
            const match = document.cookie.match(new RegExp('(^| )sb_token=([^;]+)'));
            if (match && match[2]) {
              const token = decodeURIComponent(match[2]);
              const payloadB64 = token.split('.')[1];
              if (payloadB64) {
                // Decode base64url
                const payloadStr = atob(payloadB64.replace(/-/g, '+').replace(/_/g, '/'));
                const payload = JSON.parse(payloadStr);
                
                if (payload.email === 'siraparapuabhinay21@gmail.com') {
                  isAdmin = true;
                }
              }
            }
            
            if (isDev || isAdmin) {
              window['ga-disable-G-9D67M1G5XC'] = true;
            }
          } catch(e) {}
          window.dataLayer = window.dataLayer || [];
          function gtag(){window.dataLayer.push(arguments);}
          gtag('js', new Date());
          gtag('config', 'G-9D67M1G5XC');
        `}
      </Script>

      {/* Ahrefs Analytics */}
      <Script
        src="https://analytics.ahrefs.com/analytics.js"
        data-key="+9fzuLLzZbLhEJcB+CsBWA"
        strategy="lazyOnload"
      />



      <body className="transition-colors duration-300 bg-background text-foreground">
        {/* Replaces the native pointer everywhere, on fine-pointer devices that
            allow motion. Mounted above the providers so it survives navigation. */}
        <CustomCursor />
        {/* --- GLOBAL DYNAMIC BACKGROUND & AMBIENT GLOWS --- */}
        <div className="fixed inset-0 pointer-events-none z-0">
          
          {/* DESKTOP LAYER (Heavy, high fidelity) */}
          <div className="hidden md:block absolute inset-0">

            <div className="absolute inset-0 opacity-[0.015] dark:opacity-[0.03]" style={{ backgroundImage: 'url("data:image/svg+xml,%3Csvg viewBox=%220 0 200 200%22 xmlns=%22http://www.w3.org/2000/svg%22%3E%3Cfilter id=%22noiseFilter%22%3E%3CfeTurbulence type=%22fractalNoise%22 baseFrequency=%220.65%22 numOctaves=%223%22 stitchTiles=%22stitch%22/%3E%3C/filter%3E%3Crect width=%22100%25%22 height=%22100%25%22 filter=%22url(%23noiseFilter)%22/%3E%3C/svg%3E")' }} />
          </div>

          {/* MOBILE LAYER (Optimized, lightweight) */}
          <div className="block md:hidden absolute inset-0">
            <div className="absolute top-[0%] left-[0%] w-[70vw] h-[70vw] bg-[radial-gradient(circle,var(--tw-gradient-stops))] from-violet-600/15 dark:from-violet-900/25 to-transparent animate-pulse duration-[16000ms] will-change-transform" style={{ transform: 'translate(-15%, -15%)' }} />
            <div className="absolute top-[20%] right-[0%] w-[80vw] h-[80vw] bg-[radial-gradient(circle,var(--tw-gradient-stops))] from-dye-500/15 dark:from-dye-900/25 to-transparent animate-pulse duration-[24000ms] delay-1000 will-change-transform" style={{ transform: 'translateX(15%)' }} />
            <div className="absolute bottom-[0%] left-[20%] w-[90vw] h-[90vw] bg-[radial-gradient(circle,var(--tw-gradient-stops))] from-blue-500/15 dark:from-blue-900/25 to-transparent animate-pulse duration-[20000ms] delay-500 will-change-transform" style={{ transform: 'translateY(15%)' }} />
            <div className="absolute inset-0 opacity-[0.05] dark:opacity-[0.08]" style={{ backgroundImage: 'url("/noise.png")', backgroundRepeat: 'repeat', backgroundSize: '150px' }} />
          </div>

        </div>
        <SmoothScrolling>
          <NavigationProgress />
          <IOSHomeScreenPrompt />
          <ThemeProvider>
            <ConnectionProvider>
              <ConnectionStatusModal />
              <AuthProvider>
                <AudioProvider>
                  <BeatProvider>
                    <VisualizerProvider>
                        <div className="relative z-10 w-full min-h-full flex flex-col">{children}</div>
                    </VisualizerProvider>
                  </BeatProvider>
                </AudioProvider>
              </AuthProvider>
            </ConnectionProvider>
          </ThemeProvider>
          <Toaster position="bottom-right" theme="system" richColors closeButton />
          <Analytics />
          <SpeedInsights />
        </SmoothScrolling>
      </body>
    </html>
  );
}
