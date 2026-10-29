// app/layout.tsx
import type { Metadata, Viewport } from "next";
import { Archivo, JetBrains_Mono } from "next/font/google";
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
import { IOSHomeScreenPrompt } from '../components/IOSHomeScreenPrompt';
import { MobileAppGuard } from '../components/MobileAppGuard';
import { BeatProvider } from "../context/BeatContext";
import { NavigationProgress } from "../components/NavigationProgress";
import { CustomCursor } from "../components/CustomCursor";
import { LoadingProvider } from "../context/LoadingContext";

/**
 * One face for the whole product. Archivo is a precise grotesque with real
 * `wght` and `wdth` axes, so display text is the same family set wider and
 * heavier — headings read as the same instrument as the body rather than as a
 * second voice. The width axis is why the hero's load gesture (fontStretch
 * 75% -> 100%, see Hero.tsx) still works: width is a display property here,
 * not a quirk of a lettering face.
 */
const archivo = Archivo({
  variable: "--font-archivo",
  subsets: ["latin"],
  preload: true,
  display: "swap",
  axes: ["wdth"],
});

const jetbrainsMono = JetBrains_Mono({
  variable: "--font-jetbrains",
  subsets: ["latin"],
  preload: true,
  display: "swap",
  weight: ["400", "600", "700"],
});

const BASE_URL = "https://www.syncbeats.in";

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  viewportFit: "cover",
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#f1f1ef" },
    { media: "(prefers-color-scheme: dark)", color: "#0e0f0f" },
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
    "Turn phones, tablets and laptops into one shared listening room. SyncBeats coordinates playback across your browser devices — no cables, no app required.",
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
      "Share a six-character code and bring your devices into one listening room. Free, in the browser.",
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
      "Share a six-character code and bring your devices into one listening room. Free, in the browser.",
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
      "SyncBeats coordinates shared playback across phones, tablets and laptops in a browser room, with no app to install.",
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
      "Shared playback with client-side clock estimation and drift correction",
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
      className={`${archivo.variable} ${jetbrainsMono.variable} antialiased`}
    >
      <head>
        {/* iOS home-screen installs retain the URL used when first installed.
            Redirect stale root/intro launch URLs before React can paint them. */}
        <Script id="standalone-room-launch" strategy="beforeInteractive">
          {`(() => {
            const isStandalone = window.matchMedia('(display-mode: standalone)').matches
              || window.navigator.standalone === true;
            const path = window.location.pathname.replace(/\\/$/, '') || '/';
            if (isStandalone && (path === '/' || path === '/intro')) {
              window.location.replace('/room/default');
            }
          })();`}
        </Script>
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
        <div className="fixed inset-0 pointer-events-none z-0 overflow-hidden" aria-hidden="true">

          {/* Low-contrast light sources drift across the viewport. Keep the
              gradients stationary in size and move them on the compositor. */}
          <div className="ambient-blob-field absolute inset-0 overflow-hidden">
            <div
              className="ambient-blob ambient-blob--warm"
              style={{ background: 'radial-gradient(circle, var(--warm-tint) 0%, transparent 70%)' }}
            />
            <div
              className="ambient-blob ambient-blob--cool"
              style={{ background: 'radial-gradient(circle, var(--cool-tint) 0%, transparent 70%)' }}
            />
            <div
              className="ambient-blob ambient-blob--warm-secondary"
              style={{ background: 'radial-gradient(circle, var(--warm-tint) 0%, transparent 70%)' }}
            />
          </div>

          {/* DESKTOP LAYER (Heavy, high fidelity) */}
          <div className="hidden md:block absolute inset-0">

            <div className="absolute inset-0 opacity-[0.015] dark:opacity-[0.03]" style={{ backgroundImage: 'url("data:image/svg+xml,%3Csvg viewBox=%220 0 200 200%22 xmlns=%22http://www.w3.org/2000/svg%22%3E%3Cfilter id=%22noiseFilter%22%3E%3CfeTurbulence type=%22fractalNoise%22 baseFrequency=%220.65%22 numOctaves=%223%22 stitchTiles=%22stitch%22/%3E%3C/filter%3E%3Crect width=%22100%25%22 height=%22100%25%22 filter=%22url(%23noiseFilter)%22/%3E%3C/svg%3E")' }} />
          </div>

          {/* MOBILE LAYER (Optimized, lightweight). Temperature, not hue: the
              warm highlight and cool shadow are the two references the glass
              sits in. Same tokens the ambient field and the fluid blobs use. */}
          <div className="block md:hidden absolute inset-0">
            <div className="absolute inset-0 opacity-[0.05] dark:opacity-[0.08]" style={{ backgroundImage: 'url("/noise.png")', backgroundRepeat: 'repeat', backgroundSize: '150px' }} />
          </div>

        </div>
        <SmoothScrolling>
          <LoadingProvider>
          <NavigationProgress />
          <IOSHomeScreenPrompt />
          <MobileAppGuard />
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
          </LoadingProvider>
        </SmoothScrolling>
      </body>
    </html>
  );
}
