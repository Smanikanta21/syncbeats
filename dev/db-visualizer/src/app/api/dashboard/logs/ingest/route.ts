import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { action, details, level, source, ip } = body;

    const clientIp = ip || req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "127.0.0.1";
    const src = (source || "FRONTEND").toUpperCase();
    const act = (action || "CLIENT_EVENT").toUpperCase();
    
    // Prefix action with source tag [FRONTEND], [BACKEND], or [DATABASE]
    const taggedAction = `[${src}] ${act}`;
    const cleanDetails = typeof details === "object" ? JSON.stringify(details) : String(details || "");

    await prisma.adminAuditLog.create({
      data: {
        action: taggedAction,
        details: cleanDetails,
        ip: clientIp,
      },
    });

    return NextResponse.json({ ok: true });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
