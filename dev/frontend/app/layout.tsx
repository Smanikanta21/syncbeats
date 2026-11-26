// app/layout.tsx
import type { Metadata, Viewport } from "next";
import { SITE_DESCRIPTION, SITE_TITLE, SITE_URL } from "@/lib/site";
import { Archivo, JetBrains_Mono } from "next/font/google";
import Script from "next/script";
import "./globals.css";
import { AuthProvider } from "../context/AuthContext";
import { AudioProvider } from "../context/AudioContext";
import { AppAtmosphereBoundary } from "../components/AppAtmosphereBoundary";
import { ThemeProvider } from "../context/ThemeProvider";
import { PrivacyAnalytics } from "../components/PrivacyAnalytics";

import SmoothScrolling from "../components/SmoothScrolling";

import { RoomSearchProvider } from "../context/RoomSearchContext";
import { ConnectionProvider } from "../context/ConnectionContext";
import { ConnectionStatusModal } from "../components/ConnectionStatusModal";
import { VisualizerProvider } from "../context/VisualizerContext";
import { IOSHomeScreenPrompt } from "../components/IOSHomeScreenPrompt";
import { MobileAppGuard } from "../components/MobileAppGuard";
import { BeatProvider } from "../context/BeatContext";
import { NavigationProgress } from "../components/NavigationProgress";
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

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 5,
  userScalable: true,
  viewportFit: "cover",
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#f1f1ef" },
    { media: "(prefers-color-scheme: dark)", color: "#0e0f0f" },
  ],
};

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: { default: SITE_TITLE, template: "%s | SyncBeats" },
  description: SITE_DESCRIPTION,
  applicationName: "SyncBeats",
  authors: [{ name: "SyncBeats Team", url: SITE_URL }],
  creator: "SyncBeats",
  publisher: "SyncBeats",
  robots: {
    index: true,
    follow: true,
    googleBot: {
      index: true,
      follow: true,
      "max-image-preview": "large",
      "max-snippet": -1,
      "max-video-preview": -1,
    },
  },
  openGraph: {
    type: "website",
    locale: "en_US",
    siteName: "SyncBeats",
    title: SITE_TITLE,
    description: SITE_DESCRIPTION,
  },
  twitter: {
    card: "summary_large_image",
    title: SITE_TITLE,
    description: SITE_DESCRIPTION,
  },
  icons: {
    icon: [
      { url: "/favicon.ico", sizes: "any" },
      { url: "/favicon.svg", type: "image/svg+xml" },
    ],
    apple: "/apple-touch-icon.png",
  },
  appleWebApp: {
    capable: true,
    statusBarStyle: "black-translucent",
    title: "SyncBeats",
  },
  manifest: "/manifest.json",
  other: {
    "mobile-web-app-capable": "yes",
    "msapplication-TileColor": "#0e2828",
  },
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
      </head>

      <body className="transition-colors duration-300 bg-background text-foreground">
        {/* --- GLOBAL DYNAMIC BACKGROUND & AMBIENT GLOWS --- */}
        <AppAtmosphereBoundary>
        <div
          className="fixed inset-0 pointer-events-none z-0 overflow-hidden"
          aria-hidden="true"
        >
          {/* Low-contrast light sources drift across the viewport. Keep the
              gradients stationary in size and move them on the compositor. */}
          <div className="ambient-blob-field absolute inset-0 overflow-hidden">
            <div
              className="ambient-blob ambient-blob--warm"
              style={{
                background:
                  "radial-gradient(circle, var(--warm-tint) 0%, transparent 70%)",
              }}
            />
            <div
              className="ambient-blob ambient-blob--cool"
              style={{
                background:
                  "radial-gradient(circle, var(--cool-tint) 0%, transparent 70%)",
              }}
            />
            <div
              className="ambient-blob ambient-blob--warm-secondary"
              style={{
                background:
                  "radial-gradient(circle, var(--warm-tint) 0%, transparent 70%)",
              }}
            />
          </div>

          {/* DESKTOP LAYER (Heavy, high fidelity) */}
          <div className="hidden md:block absolute inset-0">
            <div
              className="absolute inset-0 opacity-[0.015] dark:opacity-[0.03]"
              style={{
                backgroundImage:
                  'url("data:image/svg+xml,%3Csvg viewBox=%220 0 200 200%22 xmlns=%22http://www.w3.org/2000/svg%22%3E%3Cfilter id=%22noiseFilter%22%3E%3CfeTurbulence type=%22fractalNoise%22 baseFrequency=%220.65%22 numOctaves=%223%22 stitchTiles=%22stitch%22/%3E%3C/filter%3E%3Crect width=%22100%25%22 height=%22100%25%22 filter=%22url(%23noiseFilter)%22/%3E%3C/svg%3E")',
              }}
            />
          </div>

          {/* MOBILE LAYER (Optimized, lightweight). Temperature, not hue: the
              warm highlight and cool shadow are the two references the glass
              sits in. Same tokens the ambient field and the fluid blobs use. */}
          <div className="block md:hidden absolute inset-0">
            <div
              className="absolute inset-0 opacity-[0.05] dark:opacity-[0.08]"
              style={{
                backgroundImage: 'url("/noise.png")',
                backgroundRepeat: "repeat",
                backgroundSize: "150px",
              }}
            />
          </div>
        </div>
        </AppAtmosphereBoundary>
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
                    <RoomSearchProvider>
                    <BeatProvider>
                      <VisualizerProvider>
                        <div className="relative z-10 w-full min-h-full flex flex-col">
                          {children}
                        </div>
                      </VisualizerProvider>
                    </BeatProvider>
                    </RoomSearchProvider>
                  </AudioProvider>
                </AuthProvider>
              </ConnectionProvider>
            </ThemeProvider>
            <PrivacyAnalytics />
          </LoadingProvider>
        </SmoothScrolling>
      </body>
    </html>
  );
}
