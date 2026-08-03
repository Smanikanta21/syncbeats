import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { requireAdminApi } from "@/lib/adminAuth";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const authErr = requireAdminApi(req);
  if (authErr) return authErr;

  const { searchParams } = new URL(req.url);
  const levelParam = searchParams.get("level") || "ALL";
  const sourceParam = searchParams.get("source") || "ALL";
  const limitParam = parseInt(searchParams.get("limit") || "100", 10);

  try {
    const logs = await prisma.adminAuditLog.findMany({
      orderBy: { createdAt: "desc" },
      take: Math.min(limitParam, 500),
    });

    const formattedLogs = logs.map((log) => {
      let level: "SUCCESS" | "ERROR" | "WARN" | "INFO" | "SECURITY" = "INFO";
      const act = log.action.toUpperCase();
      const det = (log.details || "").toUpperCase();

      // Extract source
      let source: "FRONTEND" | "BACKEND" | "DATABASE" = "BACKEND";
      if (act.includes("[FRONTEND]")) {
        source = "FRONTEND";
      } else if (act.includes("[DATABASE]") || act.includes("DB_")) {
        source = "DATABASE";
      } else {
        source = "BACKEND";
      }

      // Check explicit errors first
      if (
        det.includes("FAILED ADMIN PASSCODE") ||
        det.includes("AUTHENTICATION REQUIRED") ||
        det.includes("UNAUTHORIZED") ||
        det.includes("EXCEPTION") ||
        (det.includes("FAILED:") && !det.includes("FAILED: 0") && !det.includes("FAILED:0")) ||
        act.includes("ERROR") ||
        act.includes("WARN_SECURITY")
      ) {
        level = "ERROR";
      } else if (act.includes("WARN") || det.includes("WARN") || det.includes("RATE_LIMIT")) {
        level = "WARN";
      } else if (
        det.includes("SUCCESSFULLY") ||
        det.includes("FAILED: 0") ||
        det.includes("FAILED:0") ||
        act.includes("SUCCESS")
      ) {
        level = "SUCCESS";
      } else if (act.includes("LOGIN") || act.includes("AUTH") || act.includes("SECURITY")) {
        level = "SECURITY";
      }

      return {
        id: log.id,
        action: log.action.replace(/^\[(FRONTEND|BACKEND|DATABASE)\]\s*/i, ""),
        source,
        level,
        message: log.details || "No details provided",
        ip: log.ip || "127.0.0.1",
        timestamp: log.createdAt,
      };
    });

    const filtered = formattedLogs.filter((l) => {
      const matchLevel = levelParam === "ALL" || l.level === levelParam;
      const matchSource = sourceParam === "ALL" || l.source === sourceParam;
      return matchLevel && matchSource;
    });

    const counts = {
      total: formattedLogs.length,
      frontend: formattedLogs.filter((l) => l.source === "FRONTEND").length,
      backend: formattedLogs.filter((l) => l.source === "BACKEND").length,
      database: formattedLogs.filter((l) => l.source === "DATABASE").length,
      success: formattedLogs.filter((l) => l.level === "SUCCESS").length,
      errors: formattedLogs.filter((l) => l.level === "ERROR").length,
      warnings: formattedLogs.filter((l) => l.level === "WARN").length,
      security: formattedLogs.filter((l) => l.level === "SECURITY").length,
      info: formattedLogs.filter((l) => l.level === "INFO").length,
    };

    return NextResponse.json({
      logs: filtered,
      counts,
    });
  } catch (err: any) {
    console.error("[Dashboard Logs Error]:", err);
    return NextResponse.json({ error: err?.message || "Failed to fetch audit logs" }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest) {
  const authErr = requireAdminApi(req);
  if (authErr) return authErr;

  try {
    await prisma.adminAuditLog.deleteMany({});
    return NextResponse.json({ success: true, message: "Audit logs cleared successfully" });
  } catch (err: any) {
    return NextResponse.json({ error: err?.message || "Failed to clear logs" }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  const authErr = requireAdminApi(req);
  if (authErr) return authErr;

  try {
    const { action, details, ip } = await req.json();
    if (!action) {
      return NextResponse.json({ error: "action is required" }, { status: 400 });
    }

    const newLog = await prisma.adminAuditLog.create({
      data: {
        action: action.toUpperCase(),
        details: details || null,
        ip: ip || req.headers.get("x-forwarded-for") || req.headers.get("x-real-ip") || "127.0.0.1",
      },
    });

    return NextResponse.json({ success: true, log: newLog });
  } catch (err: any) {
    return NextResponse.json({ error: err?.message || "Failed to record log" }, { status: 500 });
  }
}
