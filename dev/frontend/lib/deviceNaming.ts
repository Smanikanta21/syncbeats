/**
 * deviceNaming.ts
 *
 * Turning a participant's raw output-device string into something a human
 * recognises ("Mac", "iPhone") and a matching icon. Shared by the devices list
 * and the spatial stage, which previously carried near-identical copies that
 * had already drifted apart on their fallback labels.
 */

import { Headphones, Laptop, Monitor, Smartphone, type LucideIcon } from "lucide-react";
import type { Participant } from "./types";

export function getDeviceIcon(name: string, type?: string): LucideIcon {
  const n = (name || "").toLowerCase();

  if (n.includes("iphone") || n.includes("android") || n.includes("ipad") || n.includes("phone")) return Smartphone;
  if (n.includes("mac") || n.includes("windows") || n.includes("linux") || n.includes("laptop")) return Laptop;

  switch (type) {
    case "mobile":     return Smartphone;
    case "speakers":   return Monitor;
    case "headphones": return Headphones;
    default:           return Laptop;
  }
}

/**
 * @param short Compact labels for tight UI (3D puck captions): "Mobile" rather
 *              than "Mobile Device".
 */
export function getFriendlyDeviceName(
  name: string,
  type?: string,
  fallback?: string,
  short = false,
): string {
  const n = (name || "").toLowerCase();
  const f = (fallback || "").toLowerCase();

  if (n.includes("iphone") || f.includes("iphone")) return "iPhone";
  if (n.includes("ipad") || f.includes("ipad")) return "iPad";
  if (n.includes("mac") || f.includes("mac") || f.includes("macos")) return "Mac";
  if (n.includes("windows") || f.includes("windows") || f.includes("win")) return short ? "Windows" : "Windows PC";
  if (n.includes("android") || f.includes("android")) return "Android";
  if (n.includes("linux") || f.includes("linux")) return "Linux";

  if (type === "mobile") return short ? "Mobile" : "Mobile Device";
  if (type === "speakers") return "Desktop";
  return short ? "Device" : "Connected Device";
}

/**
 * Participants carry "User Name::Device Hint" in `displayName`. Split it and
 * resolve the best available device label.
 */
export function parseParticipantNames(p: Participant, short = false): { userName: string; deviceName: string } {
  const nameParts = (p.displayName || "").split("::");
  const userName = nameParts[0]?.trim() || p.displayName || "Guest";
  const rawDeviceFromDisplayName = nameParts.length > 1 ? nameParts[1]?.trim() : undefined;

  let deviceName = p.outputDeviceName?.trim();
  if (!deviceName && rawDeviceFromDisplayName) {
    deviceName = rawDeviceFromDisplayName;
  }
  if (!deviceName) {
    deviceName = getFriendlyDeviceName("", p.outputDeviceType, rawDeviceFromDisplayName, short);
  }

  return { userName, deviceName };
}

/** Two-letter avatar initials for a display name. */
export function initialsFor(displayName: string): string {
  const clean = (displayName || "").split("::")[0]?.trim() || "?";
  const words = clean.split(/\s+/).filter(Boolean);
  if (words.length >= 2) return (words[0][0] + words[1][0]).toUpperCase();
  return clean.substring(0, 2).toUpperCase();
}
