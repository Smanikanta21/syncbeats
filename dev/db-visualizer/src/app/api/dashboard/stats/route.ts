import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { requireAdminApi } from "@/lib/adminAuth";

export const dynamic = "force-dynamic";

function getTimeWindowCutoff(windowParam: string): Date {
  const now = Date.now();
  switch (windowParam) {
    case "5m":
      return new Date(now - 5 * 60 * 1000);
    case "15m":
      return new Date(now - 15 * 60 * 1000);
    case "1h":
      return new Date(now - 60 * 60 * 1000);
    case "24h":
      return new Date(now - 24 * 60 * 60 * 1000);
    case "7d":
      return new Date(now - 7 * 24 * 60 * 60 * 1000);
    case "30d":
      return new Date(now - 30 * 24 * 60 * 60 * 1000);
    case "all":
    default:
      return new Date(0); // All time
  }
}

function parseOs(ua: string | null): string {
  if (!ua) return "Unknown OS";
  const lower = ua.toLowerCase();
  if (lower.includes("iphone") || lower.includes("ipad") || lower.includes("ipod")) return "iOS";
  if (lower.includes("android")) return "Android";
  if (lower.includes("macintosh") || lower.includes("mac os")) return "macOS";
  if (lower.includes("windows")) return "Windows";
  if (lower.includes("linux")) return "Linux";
  return "Other OS";
}

function parseBrowser(ua: string | null): string {
  if (!ua) return "Unknown Browser";
  const lower = ua.toLowerCase();
  if (lower.includes("edg/")) return "Microsoft Edge";
  if (lower.includes("opr/") || lower.includes("opera")) return "Opera";
  if (lower.includes("chrome") && !lower.includes("edg/")) return "Chrome";
  if (lower.includes("safari") && !lower.includes("chrome")) return "Safari";
  if (lower.includes("firefox")) return "Firefox";
  return "Other Browser";
}

export async function GET(req: NextRequest) {
  const authErr = requireAdminApi(req);
  if (authErr) return authErr;

  const { searchParams } = new URL(req.url);
  const windowParam = searchParams.get("window") || "15m";
  const cutoff = getTimeWindowCutoff(windowParam);

  try {
    const totalUsers = await prisma.user.count();
    const totalDevices = await prisma.device.count();
    const totalRooms = await prisma.room.count();

    // Fetch users with their registered devices
    const users = await prisma.user.findMany({
      select: {
        id: true,
        name: true,
        email: true,
        authProvider: true,
        emailVerifiedAt: true,
        createdAt: true,
        lastLoginAt: true,
        devices: {
          select: {
            id: true,
            name: true,
            userAgent: true,
            ip: true,
            lastSeenAt: true,
            createdAt: true,
          },
          orderBy: { lastSeenAt: "desc" },
        },
      },
      orderBy: { createdAt: "desc" },
    });

    const now = new Date();
    const fiveMinsAgo = new Date(now.getTime() - 5 * 60 * 1000);
    const fifteenMinsAgo = new Date(now.getTime() - 15 * 60 * 1000);
    const oneHourAgo = new Date(now.getTime() - 60 * 60 * 1000);
    const twentyFourHoursAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000);

    const osCounts: Record<string, number> = {};
    const browserCounts: Record<string, number> = {};
    const ipList: string[] = [];

    const activeUsersList: any[] = [];
    let activeInWindowCount = 0;

    users.forEach((user) => {
      // Find user's latest device activity
      const latestDevice = user.devices[0] || null;
      const userLastActivity = user.lastLoginAt
        ? latestDevice?.lastSeenAt
          ? user.lastLoginAt > latestDevice.lastSeenAt
            ? user.lastLoginAt
            : latestDevice.lastSeenAt
          : user.lastLoginAt
        : latestDevice?.lastSeenAt || user.createdAt;

      const isActiveInWindow = windowParam === "all" ? true : userLastActivity >= cutoff;
      const isOnlineNow = userLastActivity >= fiveMinsAgo;
      const isRecentlyActive = userLastActivity >= fifteenMinsAgo;

      if (isActiveInWindow) {
        activeInWindowCount++;
      }

      // Collect OS and Browser stats from devices
      if (user.devices.length > 0) {
        user.devices.forEach((dev) => {
          const os = parseOs(dev.userAgent);
          const browser = parseBrowser(dev.userAgent);
          osCounts[os] = (osCounts[os] || 0) + 1;
          browserCounts[browser] = (browserCounts[browser] || 0) + 1;
          ipList.push(dev.ip || "127.0.0.1");
        });
      } else {
        // Fallback for user with no registered device yet
        ipList.push("127.0.0.1");
      }

      activeUsersList.push({
        id: user.id,
        name: user.name,
        email: user.email,
        authProvider: user.authProvider,
        isVerified: !!user.emailVerifiedAt,
        createdAt: user.createdAt,
        lastActivityAt: userLastActivity,
        isOnlineNow,
        isRecentlyActive,
        isActiveInWindow,
        devicesCount: user.devices.length,
        devices: user.devices.map((d) => ({
          id: d.id,
          name: d.name,
          os: parseOs(d.userAgent),
          browser: parseBrowser(d.userAgent),
          userAgent: d.userAgent,
          ip: d.ip || "127.0.0.1",
          lastSeenAt: d.lastSeenAt,
        })),
      });
    });

    const uniqueIps = Array.from(new Set(ipList));

    return NextResponse.json({
      window: windowParam,
      metrics: {
        totalUsers,
        totalDevices,
        totalRooms,
        activeInWindowCount,
        onlineNowCount: activeUsersList.filter((u) => u.isOnlineNow).length,
        recent15mCount: activeUsersList.filter((u) => u.isRecentlyActive).length,
        recent24hCount: activeUsersList.filter((u) => u.lastActivityAt >= twentyFourHoursAgo).length,
      },
      osDistribution: osCounts,
      browserDistribution: browserCounts,
      uniqueIps,
      users: activeUsersList,
    });
  } catch (err: any) {
    console.error("[Dashboard Stats Error]:", err);
    return NextResponse.json({ error: err?.message || "Failed to fetch dashboard metrics" }, { status: 500 });
  }
}
