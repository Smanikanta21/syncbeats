"use client";

import dynamic from "next/dynamic";

const LandingClient = dynamic(
  () => import("../components/landing/LandingClient"),
  {
    ssr: false,
    loading: () => (
      <div className="min-h-[100dvh] bg-[#050507]" aria-hidden="true">
        <div className="sr-only">
          <h1>SyncBeats — Every Device. Perfect Sync.</h1>
          <p>
            Zero lag. Peer-to-peer audio synchronization. Turn any device into a
            wireless speaker. No Bluetooth, no wires, no app download.
          </p>
        </div>
      </div>
    ),
  }
);

export default function Page() {
  return (
    <main>
      <LandingClient />
    </main>
  );
}
