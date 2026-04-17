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

export const metadata: Metadata = {
  title: "SyncBeats — Play music in sync",
  description: "Universal web-based multi-device music synchronization player.",
  icons: {
    icon: [{ url: "/syncbeats-icon.svg", type: "image/svg+xml" }],
    shortcut: "/syncbeats-icon.svg",
    apple: "/syncbeats-icon.svg",
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
      <body className="min-h-full flex flex-col">
        <AuthProvider><AudioProvider>{children}</AudioProvider></AuthProvider>
      </body>
    </html>
  );
}
