// app/stream-test/page.tsx
import type { Metadata } from "next";
import YouTubeStreamingDemo from "@/components/YouTubeStreamingDemo";

export const metadata: Metadata = {
  title: "YouTube Stream Sync Test — SyncBeats",
  description: "Test YouTube video synchronization across multiple devices",
  robots: { index: false, follow: false }, // Don't index test page
};

export default function StreamTestPage() {
  return <YouTubeStreamingDemo />;
}
