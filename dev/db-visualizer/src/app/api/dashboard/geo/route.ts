import { NextRequest, NextResponse } from "next/server";
import { requireAdminApi } from "@/lib/adminAuth";

// Simple in-memory cache for IP resolution
const geoCache = new Map<string, any>();

function getFlagEmoji(countryCode: string): string {
  if (!countryCode || countryCode.length !== 2) return "🌐";
  const codePoints = countryCode
    .toUpperCase()
    .split("")
    .map((char) => 127397 + char.charCodeAt(0));
  return String.fromCodePoint(...codePoints);
}

function resolvePrivateIp(ip: string) {
  return {
    ip,
    country: "Local Network",
    countryCode: "US",
    city: "Localhost / Dev",
    regionName: "Development",
    lat: 37.7749,
    lon: -122.4194,
    isp: "Internal / Loopback",
    flag: "💻",
    isPrivate: true,
  };
}

async function resolveIp(ip: string) {
  const cleanIp = ip?.trim();
  if (!cleanIp) return null;

  if (
    cleanIp === "127.0.0.1" ||
    cleanIp === "::1" ||
    cleanIp.startsWith("192.168.") ||
    cleanIp.startsWith("10.") ||
    cleanIp.startsWith("172.16.") ||
    cleanIp.startsWith("172.30.") ||
    cleanIp === "localhost"
  ) {
    return resolvePrivateIp(cleanIp);
  }

  if (geoCache.has(cleanIp)) {
    return geoCache.get(cleanIp);
  }

  try {
    const res = await fetch(`http://ip-api.com/json/${cleanIp}?fields=status,country,countryCode,regionName,city,lat,lon,isp,query`, {
      signal: AbortSignal.timeout(3000),
    });
    if (res.ok) {
      const data = await res.json();
      if (data.status === "success") {
        const geoInfo = {
          ip: cleanIp,
          country: data.country,
          countryCode: data.countryCode,
          city: data.city,
          regionName: data.regionName,
          lat: data.lat,
          lon: data.lon,
          isp: data.isp,
          flag: getFlagEmoji(data.countryCode),
          isPrivate: false,
        };
        geoCache.set(cleanIp, geoInfo);
        return geoInfo;
      }
    }
  } catch (err) {
    console.error(`[Geo] Failed to resolve IP ${cleanIp}:`, err);
  }

  // Fallback if lookup failed or rate limited
  const fallback = {
    ip: cleanIp,
    country: "Unknown Location",
    countryCode: "UN",
    city: "Unknown City",
    regionName: "Unknown Region",
    lat: 20.0,
    lon: 0.0,
    isp: "Global IP Provider",
    flag: "🌐",
    isPrivate: false,
  };
  geoCache.set(cleanIp, fallback);
  return fallback;
}

export async function GET(req: NextRequest) {
  const authErr = requireAdminApi(req);
  if (authErr) return authErr;

  const { searchParams } = new URL(req.url);
  const ip = searchParams.get("ip");

  if (!ip) {
    return NextResponse.json({ error: "ip query parameter is required" }, { status: 400 });
  }

  const result = await resolveIp(ip);
  return NextResponse.json(result);
}

export async function POST(req: NextRequest) {
  const authErr = requireAdminApi(req);
  if (authErr) return authErr;

  try {
    const { ips } = (await req.json()) as { ips: string[] };
    if (!Array.isArray(ips)) {
      return NextResponse.json({ error: "ips must be an array" }, { status: 400 });
    }

    const uniqueIps = Array.from(new Set(ips.filter(Boolean)));
    const results = await Promise.all(uniqueIps.slice(0, 50).map((ip) => resolveIp(ip)));
    
    const resultMap: Record<string, any> = {};
    results.forEach((res) => {
      if (res) resultMap[res.ip] = res;
    });

    return NextResponse.json({ geoData: resultMap });
  } catch (err: any) {
    return NextResponse.json({ error: err?.message || "Batch geo lookup failed" }, { status: 500 });
  }
}
