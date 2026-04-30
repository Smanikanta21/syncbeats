import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { AuthProvider } from "../context/AuthContext";
import { AudioProvider } from "../context/AudioContext";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
  preload: false,
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
  preload: false,
});

export const metadata: Metadata = {
  title: "SyncBeats — Play music in sync",
  description: "Universal web-based multi-device music synchronization player.",
  openGraph: {
    title: "SyncBeats — Play music in sync",
    description: "Universal web-based multi-device music synchronization player.",
    url: "https://syncbeats.app/",
    siteName: "SyncBeats",
    images: [
      {
        url: "/syncbeats-og.png",
        width: 1200,
        height: 630,
        alt: "SyncBeats — Play music in sync",
      },
    ],
    locale: "en_US",
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "SyncBeats — Play music in sync",
    description: "Universal web-based multi-device music synchronization player.",
    site: "@syncbeatsapp",
    creator: "@syncbeatsapp",
    images: ["/syncbeats-og.png"],
  },
  icons: {
    icon: [{ url: "/syncbeats-icon.svg", type: "image/svg+xml" }],
    shortcut: "/syncbeats-icon.svg",
    apple: "/syncbeats-icon.svg",
  },
};

import { ThemeProvider } from "../context/ThemeProvider";

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
      <body className="min-h-full flex flex-col transition-colors duration-300">
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
