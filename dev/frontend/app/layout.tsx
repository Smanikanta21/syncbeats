// app/layout.tsx
import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import Script from "next/script";
import "./globals.css";
import { AuthProvider } from "../context/AuthContext";
import { AudioProvider } from "../context/AudioContext";
import { ThemeProvider } from "../context/ThemeProvider";
import { Analytics } from "@vercel/analytics/react";
import { SpeedInsights } from "@vercel/speed-insights/next";
import { Toaster } from "sonner";
import SmoothScrolling from "../components/SmoothScrolling";
import Preloader from "../components/Preloader";
import { ToastProvider } from "../components/ToastProvider";
import { ConnectionProvider } from "../context/ConnectionContext";
import { ConnectionStatusModal } from "../components/ConnectionStatusModal";
import { VisualizerProvider } from "../context/VisualizerContext";
import { cn } from "@/lib/utils";
import {IOSHomeScreenPrompt} from '../components/IOSHomeScreenPrompt'

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
  preload: true,
  display: "swap",
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
  preload: true,
  display: "swap",
});

const BASE_URL = "https://syncbeats.app";

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
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
    default: "SyncBeats | One track. Every phone. Zero lag.",
  },
  description:
    "Instantly connect your devices to create a perfectly synchronized, high-fidelity spatial audio experience. Turn your room into a surround sound system for free.",
  keywords: [
    "music sync",
    "listen together",
    "spatial audio app",
    "sync music across phones",
    "AmpMe alternative",
  ],
  openGraph: {
    title: "SyncBeats - 3D audio that hits everyone at once.",
    description: "Your crew. Your music. One massive speaker.",
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
    title: "SyncBeats | One track. Every phone. Zero lag.",
    description:
      "Instantly connect your devices to create a perfectly synchronized, high-fidelity spatial audio experience.",
    site: "@syncbeatsapp",
    creator: "@syncbeatsapp",
    images: ["/syncbeats-og.png"],
  },
  manifest: "/manifest.json",
  icons: {
    icon: [
      { url: "/icon-192.png", sizes: "192x192", type: "image/png" },
      { url: "/syncbeats-icon.svg", type: "image/svg+xml" }
    ],
    shortcut: "/apple-touch-icon.png",
    apple: [
      { url: "/apple-touch-icon.png", sizes: "180x180", type: "image/png" }
    ],
  },
  applicationName: "SyncBeats",
  authors: [{ name: "SyncBeats", url: BASE_URL }],
  category: "music",
  alternates: {
    canonical: BASE_URL,
  },
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

const jsonLd = {
  "@context": "https://schema.org",
  "@type": "WebApplication",
  name: "SyncBeats",
  url: BASE_URL,
  description:
    "SyncBeats lets you play music in perfect sync across multiple devices. Create a room, share the link, and listen together in real time.",
  applicationCategory: "MusicApplication",
  operatingSystem: "All",
  offers: {
    "@type": "Offer",
    price: "0",
    priceCurrency: "USD",
  },
  featureList: [
    "Real-time music synchronization",
    "Multi-device support",
    "Room-based listening parties",
    "No download required",
  ],
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      suppressHydrationWarning
      className={`${geistSans.variable} ${geistMono.variable} antialiased`}
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
            const isDev = window.location.hostname === 'dev.syncbeats.app' || window.location.hostname === 'localhost';
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



      <body className={cn('transition-colors', 'duration-300', 'bg-background', 'text-foreground')}>
        {/* --- GLOBAL DYNAMIC BACKGROUND & AMBIENT GLOWS --- */}
        <div className={cn('fixed', 'inset-0', 'pointer-events-none', 'z-0', 'overflow-hidden')}>
          
          {/* DESKTOP LAYER (Heavy, high fidelity) */}
          <div className={cn('hidden', 'md:block', 'absolute', 'inset-0')}>
            <div id="ambient-bass"   className={cn('absolute', 'top-[-10%]', 'left-[-10%]', 'w-[50vw]', 'h-[50vw]', 'bg-violet-600/10', 'dark:bg-violet-900/20', 'blur-[120px]', 'rounded-full', 'mix-blend-screen')} style={{ willChange: "transform, opacity", transition: "transform 80ms linear, opacity 80ms linear", transformOrigin: "center" }} />
            <div id="ambient-mid"    className={cn('absolute', 'top-[20%]', 'right-[-20%]', 'w-[60vw]', 'h-[60vw]', 'bg-emerald-500/10', 'dark:bg-emerald-900/20', 'blur-[150px]', 'rounded-full', 'mix-blend-screen')} style={{ willChange: "transform, opacity", transition: "transform 80ms linear, opacity 80ms linear", transformOrigin: "center" }} />
            <div id="ambient-treble" className={cn('absolute', 'bottom-[-20%]', 'left-[20%]', 'w-[70vw]', 'h-[70vw]', 'bg-blue-500/10', 'dark:bg-blue-900/20', 'blur-[130px]', 'rounded-full', 'mix-blend-screen')} style={{ willChange: "transform, opacity", transition: "transform 80ms linear, opacity 80ms linear", transformOrigin: "center" }} />
            <div className={cn('absolute', 'inset-0', 'opacity-[0.015]', 'dark:opacity-[0.03]')} style={{ backgroundImage: 'url("data:image/svg+xml,%3Csvg viewBox=%220 0 200 200%22 xmlns=%22http://www.w3.org/2000/svg%22%3E%3Cfilter id=%22noiseFilter%22%3E%3CfeTurbulence type=%22fractalNoise%22 baseFrequency=%220.65%22 numOctaves=%223%22 stitchTiles=%22stitch%22/%3E%3C/filter%3E%3Crect width=%22100%25%22 height=%22100%25%22 filter=%22url(%23noiseFilter)%22/%3E%3C/svg%3E")' }} />
          </div>

          {/* MOBILE LAYER (Optimized, lightweight) */}
          <div className={cn('block', 'md:hidden', 'absolute', 'inset-0')}>
            <div className={cn('absolute', 'top-[-10%]', 'left-[-10%]', 'w-[70vw]', 'h-[70vw]', 'bg-[radial-gradient(circle,var(--tw-gradient-stops))]', 'from-violet-600/15', 'dark:from-violet-900/25', 'to-transparent', 'mix-blend-screen', 'animate-pulse', 'duration-[16000ms]', 'will-change-transform')} />
            <div className={cn('absolute', 'top-[20%]', 'right-[-20%]', 'w-[80vw]', 'h-[80vw]', 'bg-[radial-gradient(circle,var(--tw-gradient-stops))]', 'from-emerald-500/15', 'dark:from-emerald-900/25', 'to-transparent', 'mix-blend-screen', 'animate-pulse', 'duration-[24000ms]', 'delay-1000', 'will-change-transform')} />
            <div className={cn('absolute', 'bottom-[-20%]', 'left-[20%]', 'w-[90vw]', 'h-[90vw]', 'bg-[radial-gradient(circle,var(--tw-gradient-stops))]', 'from-blue-500/15', 'dark:from-blue-900/25', 'to-transparent', 'mix-blend-screen', 'animate-pulse', 'duration-[20000ms]', 'delay-500', 'will-change-transform')} />
            <div className={cn('absolute', 'inset-0', 'opacity-[0.05]', 'dark:opacity-[0.08]')} style={{ backgroundImage: 'url("/noise.png")', backgroundRepeat: 'repeat', backgroundSize: '150px' }} />
          </div>

        </div>
        <SmoothScrolling>
          <Preloader />
          {process.env.NODE_ENV !== 'development' && <IOSHomeScreenPrompt />}
          <ThemeProvider>
            <ConnectionProvider>
              <ConnectionStatusModal />
              <AuthProvider>
                <AudioProvider>
                  <VisualizerProvider>
                    <ToastProvider>
                      <div className={cn('relative', 'z-10', 'w-full', 'min-h-full', 'flex', 'flex-col')}>{children}</div>
                    </ToastProvider>
                  </VisualizerProvider>
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
