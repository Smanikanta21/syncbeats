import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { AuthProvider } from "../context/AuthContext";
import { AudioProvider } from "../context/AudioContext";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

const baseUrl = process.env.NEXT_PUBLIC_APP_URL || "https://syncbeats.app";

export const metadata: Metadata = {
  metadataBase: new URL(baseUrl),
  title: {
    default: "SyncBeats — Synchronized Music Across All Devices",
    template: "%s | SyncBeats",
  },
  description:
    "Experience perfect audio synchronization across unlimited devices. Stream, host rooms, and enjoy seamless multi-device music playback with SyncBeats.",
  keywords: [
    "music sync",
    "multi-device audio",
    "synchronized playback",
    "web player",
    "audio streaming",
    "room-based music",
    "collaborative listening",
  ],
  applicationName: "SyncBeats",
  authors: [{ name: "SyncBeats Team" }],
  creator: "SyncBeats Team",
  publisher: "SyncBeats",
  formatDetection: {
    email: false,
    address: false,
    telephone: false,
  },
  icons: {
    icon: "/icon.svg",
    shortcut: "/icon.svg",
    apple: "/icon.svg",
  },
  openGraph: {
    type: "website",
    locale: "en_US",
    url: baseUrl,
    siteName: "SyncBeats",
    title: "SyncBeats — Synchronized Music Across All Devices",
    description:
      "Experience perfect audio synchronization across unlimited devices. Stream, host rooms, and enjoy seamless multi-device music playback.",
    images: [
      {
        url: `${baseUrl}/og-image.png`,
        width: 1200,
        height: 630,
        alt: "SyncBeats - Multi-Device Music Synchronization",
        type: "image/png",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: "SyncBeats — Synchronized Music Across All Devices",
    description:
      "Perfect audio sync across unlimited devices. Host rooms, invite friends, enjoy seamless collaborative listening.",
    images: [`${baseUrl}/og-image.png`],
    creator: "@syncbeats",
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
  verification: {
    google: process.env.NEXT_PUBLIC_GOOGLE_SITE_VERIFICATION,
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
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <head>
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <meta name="theme-color" content="#000000" />
        <link rel="canonical" href={baseUrl} />
        <link rel="manifest" href="/manifest.json" />
        <meta name="apple-mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-status-bar-style" content="black-translucent" />
        <meta name="apple-mobile-web-app-title" content="SyncBeats" />
        {/* Preconnect to external resources */}
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
      </head>
      <body className="min-h-full flex flex-col">
        <AuthProvider><AudioProvider>{children}</AudioProvider></AuthProvider>
        {/* Structured Data - Organization */}
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{
            __html: JSON.stringify({
              "@context": "https://schema.org",
              "@type": "WebApplication",
              name: "SyncBeats",
              description:
                "Experience perfect audio synchronization across unlimited devices. Stream, host rooms, and enjoy seamless multi-device music playback.",
              url: baseUrl,
              applicationCategory: "MultimediaApplication",
              offers: {
                "@type": "Offer",
                price: "0",
                priceCurrency: "USD",
              },
              ratingValue: "4.8",
              ratingCount: "145",
              image: `${baseUrl}/og-image.png`,
              author: {
                "@type": "Organization",
                name: "SyncBeats Team",
              },
            }),
          }}
        />
      </body>
    </html>
  );
}
