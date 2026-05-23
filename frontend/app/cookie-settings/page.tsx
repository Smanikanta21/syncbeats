import type { Metadata } from "next";
import CookieSettingsClient from "./CookieSettingsClient";

export const metadata: Metadata = {
  title: "Cookie Settings — SyncBeats",
  description: "Manage your cookie preferences and privacy settings for SyncBeats.",
  robots: { index: true, follow: true },
};

export default function CookieSettingsPage() {
  return <CookieSettingsClient />;
}