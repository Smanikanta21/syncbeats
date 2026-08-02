import { NextRequest, NextResponse } from "next/server";

const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || "syncbeatsadmin";
const COOKIE_NAME = "syncbeats_admin_session";

export function verifyAdminPassword(input: string): boolean {
  if (!input) return false;
  return input === ADMIN_PASSWORD;
}

export function createAdminToken(): string {
  // Simple token matching admin password signature
  const timestamp = Date.now();
  const signature = Buffer.from(`${ADMIN_PASSWORD}:${timestamp}`).toString("base64");
  return signature;
}

export function isAuthenticated(req: NextRequest): boolean {
  const token = req.cookies.get(COOKIE_NAME)?.value || req.headers.get("x-admin-token");
  if (!token) return false;

  try {
    const decoded = Buffer.from(token, "base64").toString("utf-8");
    const [pass] = decoded.split(":");
    return pass === ADMIN_PASSWORD;
  } catch {
    return false;
  }
}

export function requireAdminApi(req: NextRequest) {
  if (!isAuthenticated(req)) {
    return NextResponse.json(
      { error: "Unauthorized: Admin authentication required" },
      { status: 401 }
    );
  }
  return null;
}

export { COOKIE_NAME };
