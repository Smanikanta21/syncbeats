// app/layout.tsx
import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import Script from "next/script";
import "./globals.css";
import { AuthProvider } from "../context/AuthContext";
import { AudioProvider } from "../context/AudioContext";
import { ThemeProvider } from "../context/ThemeProvider";

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
  maximumScale: 5,
  userScalable: true,
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#ffffff" },
    { media: "(prefers-color-scheme: dark)", color: "#000000" },
  ],
};

export const metadata: Metadata = {
  metadataBase: new URL(BASE_URL),
  title: 'SyncBeats | One track. Every phone. Zero lag.',
  description: 'Instantly connect your devices to create a perfectly synchronized, high-fidelity spatial audio experience. Turn your room into a surround sound system for free.',
  keywords: ['music sync', 'listen together', 'spatial audio app', 'sync music across phones', 'AmpMe alternative'],
  openGraph: {
    title: 'SyncBeats - 3D audio that hits everyone at once.',
    description: 'Your crew. Your music. One massive speaker.',
    url: BASE_URL,
    siteName: 'SyncBeats',
    images: [
      {
        url: '/syncbeats-og.png',
        width: 1200,
        height: 630,
        alt: 'SyncBeats — synchronized music player',
      },
    ],
    locale: 'en_US',
    type: 'website',
  },
  twitter: {
    card: "summary_large_image",
    title: "SyncBeats | One track. Every phone. Zero lag.",
    description: "Instantly connect your devices to create a perfectly synchronized, high-fidelity spatial audio experience.",
    site: "@syncbeatsapp",
    creator: "@syncbeatsapp",
    images: ["/syncbeats-og.png"],
  },
  icons: {
    icon: [{ url: "/syncbeats-icon.svg", type: "image/svg+xml" }],
    shortcut: "/syncbeats-icon.svg",
    apple: "/syncbeats-icon.svg",
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
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
      suppressHydrationWarning
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

      <body className="min-h-full flex flex-col transition-colors duration-300" suppressHydrationWarning>
        <ThemeProvider>
          <AuthProvider>
            <AudioProvider>
              {children}
            </AudioProvider>
          </AuthProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}