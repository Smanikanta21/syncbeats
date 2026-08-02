import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { requireAdminApi } from "@/lib/adminAuth";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const authErr = requireAdminApi(req);
  if (authErr) return authErr;

  const { searchParams } = new URL(req.url);
  const levelParam = searchParams.get("level") || "ALL";
  const limitParam = parseInt(searchParams.get("limit") || "100", 10);

  try {
    const logs = await prisma.adminAuditLog.findMany({
      orderBy: { createdAt: "desc" },
      take: Math.min(limitParam, 500),
    });

    const formattedLogs = logs.map((log) => {
      let level: "ERROR" | "WARN" | "INFO" | "SECURITY" = "INFO";
      const actionUpper = log.action.toUpperCase();
      const detailsUpper = (log.details || "").toUpperCase();

      if (actionUpper.includes("ERROR") || detailsUpper.includes("ERROR") || detailsUpper.includes("FAILED")) {
        level = "ERROR";
      } else if (actionUpper.includes("WARN") || detailsUpper.includes("WARN") || detailsUpper.includes("UNAUTHORIZED")) {
        level = "WARN";
      } else if (actionUpper.includes("LOGIN") || actionUpper.includes("AUTH") || actionUpper.includes("SECURITY")) {
        level = "SECURITY";
      }

      return {
        id: log.id,
        action: log.action,
        level,
        message: log.details || "No details provided",
        ip: log.ip || "127.0.0.1",
        timestamp: log.createdAt,
      };
    });

    const filtered = levelParam === "ALL" 
      ? formattedLogs 
      : formattedLogs.filter((l) => l.level === levelParam);

    const counts = {
      total: formattedLogs.length,
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
