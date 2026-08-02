import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { requireAdminApi } from "@/lib/adminAuth";

export async function POST(req: NextRequest) {
  const authErr = requireAdminApi(req);
  if (authErr) return authErr;

  try {
    const { subject, htmlContent, recipientMode, selectedUserIds, customEmails, testEmail } = await req.json();

    if (!subject || !htmlContent) {
      return NextResponse.json({ error: "Subject and htmlContent are required" }, { status: 400 });
    }

    const apiKey = process.env.RESEND_API_KEY;
    const fromAddress = process.env.AUTH_FROM_EMAIL || "auth@syncbeats.app";

    if (!apiKey) {
      return NextResponse.json(
        { error: "RESEND_API_KEY is not configured in server environment variables." },
        { status: 500 }
      );
    }

    const fromHeader = `SYNCBEATS <${fromAddress}>`;

    let targetUsers: { id?: string; email: string; name: string }[] = [];

    if (recipientMode === "test") {
      if (!testEmail) {
        return NextResponse.json({ error: "Test email address is required" }, { status: 400 });
      }
      targetUsers = [{ email: testEmail.trim().toLowerCase(), name: "Admin Tester" }];
    } else if (recipientMode === "selected" && Array.isArray(selectedUserIds)) {
      const users = await prisma.user.findMany({
        where: { id: { in: selectedUserIds } },
        select: { id: true, email: true, name: true },
      });
      targetUsers = users;
    } else if (recipientMode === "custom" && Array.isArray(customEmails)) {
      targetUsers = customEmails
        .map((e: string) => e.trim().toLowerCase())
        .filter((e: string) => e.includes("@"))
        .map((email: string) => ({ email, name: email.split("@")[0] }));
    } else if (recipientMode === "active") {
      // Active in last 7 days
      const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
      const users = await prisma.user.findMany({
        where: {
          OR: [
            { lastLoginAt: { gte: sevenDaysAgo } },
            { devices: { some: { lastSeenAt: { gte: sevenDaysAgo } } } },
          ],
        },
        select: { id: true, email: true, name: true },
      });
      targetUsers = users;
    } else {
      // "all"
      const users = await prisma.user.findMany({
        select: { id: true, email: true, name: true },
      });
      targetUsers = users;
    }

    if (targetUsers.length === 0) {
      return NextResponse.json({ error: "No recipients matched the selected criteria" }, { status: 400 });
    }

    const logs: { email: string; success: boolean; error?: string }[] = [];
    let sentCount = 0;
    let failCount = 0;

    for (const recipient of targetUsers) {
      // Perform variable replacement
      const personalizedHtml = htmlContent
        .replace(/\{\{\s*name\s*\}\}/g, recipient.name || "SyncBeats User")
        .replace(/\{\{\s*email\s*\}\}/g, recipient.email)
        .replace(/\{\{\s*created_at\s*\}\}/g, new Date().toLocaleDateString());

      try {
        const resendRes = await fetch("https://api.resend.com/emails", {
          method: "POST",
          headers: {
            Authorization: `Bearer ${apiKey}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            from: fromHeader,
            to: [recipient.email],
            subject: subject,
            html: personalizedHtml,
          }),
          signal: AbortSignal.timeout(5000),
        });

        if (resendRes.ok) {
          sentCount++;
          logs.push({ email: recipient.email, success: true });
        } else {
          const errText = await resendRes.text();
          failCount++;
          logs.push({ email: recipient.email, success: false, error: errText });
        }
      } catch (err: any) {
        failCount++;
        logs.push({ email: recipient.email, success: false, error: err?.message || "Network error" });
      }

      // Small delay between requests if broadcasting to multiple users
      if (targetUsers.length > 1) {
        await new Promise((r) => setTimeout(r, 250));
      }
    }

    // Log admin audit action
    try {
      await prisma.adminAuditLog.create({
        data: {
          action: "EMAIL_DISPATCH",
          details: `Subject: "${subject}" | Mode: ${recipientMode} | Target Count: ${targetUsers.length} | Sent: ${sentCount} | Failed: ${failCount}`,
          ip: req.headers.get("x-forwarded-for") || req.headers.get("x-real-ip") || "admin",
        },
      });
    } catch (e) {
      console.error("[AuditLog Error]:", e);
    }

    return NextResponse.json({
      success: true,
      total: targetUsers.length,
      sentCount,
      failCount,
      logs,
    });
  } catch (err: any) {
    return NextResponse.json({ error: err?.message || "Failed to dispatch emails" }, { status: 500 });
  }
}
