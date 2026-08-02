import { NextRequest, NextResponse } from "next/server";
import { verifyAdminPassword, createAdminToken, COOKIE_NAME, isAuthenticated } from "@/lib/adminAuth";
import prisma from "@/lib/prisma";

export async function POST(req: NextRequest) {
  const clientIp = req.headers.get("x-forwarded-for") || req.headers.get("x-real-ip") || "127.0.0.1";
  try {
    const { password } = await req.json();

    if (!verifyAdminPassword(password)) {
      try {
        await prisma.adminAuditLog.create({
          data: {
            action: "SECURITY_WARN",
            details: "Failed admin passcode authentication attempt",
            ip: clientIp,
          },
        });
      } catch (e) {}
      return NextResponse.json({ error: "Invalid admin password" }, { status: 401 });
    }

    try {
      await prisma.adminAuditLog.create({
        data: {
          action: "ADMIN_LOGIN",
          details: "Admin console unlocked successfully",
          ip: clientIp,
        },
      });
    } catch (e) {}

    const token = createAdminToken();
    const response = NextResponse.json({ success: true, token });

    response.cookies.set({
      name: COOKIE_NAME,
      value: token,
      httpOnly: true,
      path: "/",
      sameSite: "strict",
      maxAge: 60 * 60 * 24 * 7, // 7 days
    });

    return response;
  } catch (err: any) {
    return NextResponse.json({ error: err?.message || "Authentication failed" }, { status: 500 });
  }
}

export async function GET(req: NextRequest) {
  const authenticated = isAuthenticated(req);
  return NextResponse.json({ authenticated });
}

export async function DELETE() {
  const response = NextResponse.json({ success: true });
  response.cookies.delete(COOKIE_NAME);
  return response;
}
