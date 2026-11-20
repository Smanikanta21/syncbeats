type BrowserSignals = { userAgent: string; platform?: string; maxTouchPoints?: number };

export function classifyBrowserDevice(signals: BrowserSignals) {
  const { userAgent, platform = "", maxTouchPoints = 0 } = signals;
  const ipad = /iPad/i.test(userAgent) || (/Macintosh|MacIntel/i.test(`${userAgent} ${platform}`) && maxTouchPoints > 1);
  if (ipad) return { name: "iPad", type: "tablet" as const };
  if (/iPhone|iPod/i.test(userAgent)) return { name: "iPhone", type: "mobile" as const };
  if (/Android/i.test(userAgent)) return /Mobile/i.test(userAgent)
    ? { name: "Android", type: "mobile" as const }
    : { name: "Android tablet", type: "tablet" as const };
  if (/Mac/i.test(userAgent)) return { name: "Mac", type: "laptop" as const };
  if (/Windows/i.test(userAgent)) return { name: "Windows PC", type: "desktop" as const };
  return { name: "Computer", type: "desktop" as const };
}

export function currentBrowserDevice() {
  return classifyBrowserDevice(typeof navigator === "undefined" ? { userAgent: "" } : navigator);
}

export function savedDeviceKind(userAgent: string | null) {
  if (!userAgent) return "Unknown device";
  const device = classifyBrowserDevice({ userAgent });
  if (device.type === "tablet") return "Tablet";
  if (device.type === "mobile") return "Phone";
  return /Mac/i.test(userAgent) ? "Mac" : "Computer";
}
