"use client";

import { useState, useEffect } from "react";
import { cn } from "@/lib/utils";
import HtmlCodeEditor from "./HtmlCodeEditor";
import ShadowHtmlPreview from "./ShadowHtmlPreview";

interface UserItem {
  id: string;
  name: string;
  email: string;
}

interface EmailDesignerViewProps {
  users?: UserItem[];
  onOpenSidebar?: () => void;
}

export const TEMPLATE_PRESETS = [
  {
    id: "release_update",
    name: "SyncBeats v1.4 Release (Clean & Responsive)",
    sender: "updates@syncbeats.in",
    subject: "SyncBeats Release v1.4: Spotify Import, Ambient Lighting & Sub-10ms Audio Sync",
    html: `<!DOCTYPE html>
<html lang="en" xmlns:v="urn:schemas-microsoft-com:vml" xmlns:o="urn:schemas-microsoft-com:office:office">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta name="color-scheme" content="dark light">
  <meta name="supported-color-schemes" content="dark light">
  <title>SyncBeats v1.4 — Product Update</title>
  <style>
    :root {
      color-scheme: dark light;
      supported-color-schemes: dark light;
    }
    
    @keyframes barWave1 { 0%, 100% { height: 4px; } 50% { height: 16px; } }
    @keyframes barWave2 { 0%, 100% { height: 18px; } 50% { height: 6px; } }
    @keyframes barWave3 { 0%, 100% { height: 8px; } 50% { height: 20px; } }
    @keyframes pulseDot { 0%, 100% { opacity: 1; transform: scale(1); } 50% { opacity: 0.3; transform: scale(0.8); } }

    body { margin: 0; padding: 0; background-color: #050507; color: #fafafa; font-family: -apple-system, BlinkMacSystemFont, 'SF Pro Display', 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; -webkit-font-smoothing: antialiased; }
    table { border-collapse: collapse; }
    a { text-decoration: none; color: inherit; }
    
    .w-1 { animation: barWave1 1.2s ease-in-out infinite; }
    .w-2 { animation: barWave2 0.9s ease-in-out infinite; }
    .w-3 { animation: barWave3 1.4s ease-in-out infinite; }
    .live-dot { animation: pulseDot 2s ease-in-out infinite; }

    .main-btn:hover { background-color: #e4e4e7 !important; color: #000000 !important; }
    
    /* Responsive styles for mobile devices */
    @media only screen and (max-width: 600px) {
      .outer-padding { padding: 20px 12px !important; }
      .card-padding { padding: 28px 20px !important; }
      .title-text { font-size: 22px !important; line-height: 1.3 !important; }
      .telemetry-cell { display: block !important; width: 100% !important; margin-bottom: 12px !important; }
    }
  </style>
</head>
<body style="margin: 0; padding: 0; background-color: #050507; color: #fafafa;">

  <!-- Main Background Wrapper -->
  <table width="100%" border="0" cellspacing="0" cellpadding="0" style="background-color: #050507; table-layout: fixed;">
    <tr>
      <td align="center" class="outer-padding" style="padding: 40px 16px;">

        <!-- Center Document Envelope -->
        <table width="100%" border="0" cellspacing="0" cellpadding="0" style="max-width: 580px; background-color: #0d0d11; border: 1px solid #27272a; border-radius: 12px; overflow: hidden;">

          <!-- Brand Header Row -->
          <tr>
            <td class="card-padding" style="padding: 36px 36px 24px 36px;" align="left">
              <table border="0" cellspacing="0" cellpadding="0" width="100%">
                <tr>
                  <td align="left" valign="middle">
                    <span style="font-size: 16px; font-weight: 900; letter-spacing: 2px; color: #ffffff; font-family: monospace;">
                      SYNC<span style="color: #a1a1aa;">BEATS</span>
                    </span>
                  </td>
                  <td align="right" valign="middle">
                    <table border="0" cellspacing="0" cellpadding="0">
                      <tr>
                        <td style="padding-right: 8px;" valign="middle">
                          <div class="live-dot" style="width: 6px; height: 6px; border-radius: 50%; background-color: #ffffff; display: inline-block;"></div>
                        </td>
                        <td valign="middle">
                          <span style="font-size: 11px; font-weight: 700; font-family: monospace; text-transform: uppercase; letter-spacing: 1.5px; color: #a1a1aa;">
                            v1.4 RELEASE
                          </span>
                        </td>
                      </tr>
                    </table>
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          <!-- Solid Border Line -->
          <tr>
            <td style="padding: 0 36px;">
              <div style="height: 1px; background-color: #27272a; width: 100%;"></div>
            </td>
          </tr>

          <!-- Headline & Opening Paragraph -->
          <tr>
            <td class="card-padding" style="padding: 32px 36px 24px 36px;" align="left">
              <h1 class="title-text" style="margin: 0; font-size: 24px; font-weight: 800; line-height: 1.35; color: #ffffff; letter-spacing: -0.4px;">
                Spotify Import, Ambient Lighting & Sub-10ms Audio Sync
              </h1>
              <p style="margin-top: 16px; margin-bottom: 0; font-size: 15px; line-height: 1.65; color: #d4d4d8;">
                Hey {{name}},
              </p>
              <p style="margin-top: 12px; margin-bottom: 0; font-size: 15px; line-height: 1.65; color: #a1a1aa;">
                We have deployed key feature updates and low-latency audio algorithms across SyncBeats to streamline your live listening rooms.
              </p>
            </td>
          </tr>

          <!-- Primary Full-Width Action Button (No awkward multi-line text wrapping!) -->
          <tr>
            <td class="card-padding" style="padding: 0 36px 32px 36px;" align="left">
              <table border="0" cellspacing="0" cellpadding="0" width="100%">
                <tr>
                  <td align="center" style="background-color: #ffffff; border-radius: 8px;">
                    <a href="https://syncbeats.in/hub" target="_blank" class="main-btn" style="display: block; width: 100%; padding: 15px 0; font-size: 14px; font-weight: 800; color: #000000; text-align: center; text-decoration: none; border-radius: 8px; font-family: -apple-system, BlinkMacSystemFont, sans-serif; box-sizing: border-box;">
                      Open SyncBeats Studio &rarr;
                    </a>
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          <!-- Clean Telemetry Data Table (No crammed 3-column wrapping!) -->
          <tr>
            <td class="card-padding" style="padding: 0 36px 32px 36px;">
              <table width="100%" border="0" cellspacing="0" cellpadding="0" style="background-color: #141419; border: 1px solid #27272a; border-radius: 8px; padding: 20px 24px;">
                <tr>
                  <td style="padding-bottom: 14px; border-bottom: 1px solid #27272a;">
                    <table width="100%" border="0" cellspacing="0" cellpadding="0">
                      <tr>
                        <td align="left">
                          <span style="font-size: 10px; font-weight: 800; font-family: monospace; text-transform: uppercase; letter-spacing: 1.8px; color: #a1a1aa;">
                            AUDIO TELEMETRY SPECS
                          </span>
                        </td>
                        <td align="right" valign="middle">
                          <div style="display: flex; gap: 3px; height: 16px; align-items: flex-end;">
                            <div class="w-1" style="width: 3px; background-color: #ffffff; border-radius: 1px;"></div>
                            <div class="w-2" style="width: 3px; background-color: #ffffff; border-radius: 1px;"></div>
                            <div class="w-3" style="width: 3px; background-color: #ffffff; border-radius: 1px;"></div>
                          </div>
                        </td>
                      </tr>
                    </table>
                  </td>
                </tr>
                <tr>
                  <td style="padding-top: 14px;">
                    <table width="100%" border="0" cellspacing="0" cellpadding="0">
                      <tr>
                        <td style="padding: 6px 0;">
                          <table width="100%" border="0" cellspacing="0" cellpadding="0">
                            <tr>
                              <td align="left" style="font-size: 13px; color: #a1a1aa; font-family: monospace;">Sync Latency</td>
                              <td align="right" style="font-size: 14px; font-weight: 800; color: #ffffff; font-family: monospace;">&lt; 10 ms</td>
                            </tr>
                          </table>
                        </td>
                      </tr>
                      <tr>
                        <td style="padding: 6px 0; border-top: 1px solid #1f1f23;">
                          <table width="100%" border="0" cellspacing="0" cellpadding="0">
                            <tr>
                              <td align="left" style="font-size: 13px; color: #a1a1aa; font-family: monospace;">Stream Bitrate</td>
                              <td align="right" style="font-size: 14px; font-weight: 800; color: #ffffff; font-family: monospace;">320 kbps Lossless</td>
                            </tr>
                          </table>
                        </td>
                      </tr>
                      <tr>
                        <td style="padding: 6px 0; border-top: 1px solid #1f1f23;">
                          <table width="100%" border="0" cellspacing="0" cellpadding="0">
                            <tr>
                              <td align="left" style="font-size: 13px; color: #a1a1aa; font-family: monospace;">Time Drift Correction</td>
                              <td align="right" style="font-size: 14px; font-weight: 800; color: #ffffff; font-family: monospace;">Automatic (NTP)</td>
                            </tr>
                          </table>
                        </td>
                      </tr>
                    </table>
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          <!-- Minimal Line-Separated Feature Rows (No boxed card clutter!) -->
          <tr>
            <td class="card-padding" style="padding: 0 36px 36px 36px;">
              <table width="100%" border="0" cellspacing="0" cellpadding="0">

                <!-- Feature 1: Spotify Import -->
                <tr>
                  <td style="padding-top: 24px; border-top: 1px solid #27272a;" align="left">
                    <div style="font-size: 11px; font-weight: 800; font-family: monospace; text-transform: uppercase; letter-spacing: 1.5px; color: #a1a1aa;">
                      01 / INTEGRATION
                    </div>
                    <div style="font-size: 16px; font-weight: 700; color: #ffffff; margin-top: 6px; margin-bottom: 6px;">
                      Spotify Track & Playlist Import
                    </div>
                    <div style="font-size: 14px; line-height: 1.6; color: #a1a1aa;">
                      Paste any Spotify track or playlist link directly into live rooms. SyncBeats resolves track metadata automatically with high-bitrate streaming fallback.
                    </div>
                  </td>
                </tr>

                <!-- Feature 2: Low-Latency Sync -->
                <tr>
                  <td style="padding-top: 24px; border-top: 1px solid #27272a; margin-top: 24px;" align="left">
                    <div style="font-size: 11px; font-weight: 800; font-family: monospace; text-transform: uppercase; letter-spacing: 1.5px; color: #a1a1aa;">
                      02 / PERFORMANCE
                    </div>
                    <div style="font-size: 16px; font-weight: 700; color: #ffffff; margin-top: 6px; margin-bottom: 6px;">
                      Sub-10ms Clock Synchronization
                    </div>
                    <div style="font-size: 14px; line-height: 1.6; color: #a1a1aa;">
                      Our network time protocol algorithm compensates for latency drift, keeping every connected listener locked to the exact same audio frame.
                    </div>
                  </td>
                </tr>

                <!-- Feature 3: Dynamic Ambient RGB Lighting -->
                <tr>
                  <td style="padding-top: 24px; border-top: 1px solid #27272a; margin-top: 24px;" align="left">
                    <div style="font-size: 11px; font-weight: 800; font-family: monospace; text-transform: uppercase; letter-spacing: 1.5px; color: #a1a1aa;">
                      03 / VISUAL EXPERIENCE
                    </div>
                    <div style="font-size: 16px; font-weight: 700; color: #ffffff; margin-top: 6px; margin-bottom: 6px;">
                      Dynamic RGB Ambient Lighting
                    </div>
                    <div style="font-size: 14px; line-height: 1.6; color: #a1a1aa;">
                      Room backgrounds shift dynamically to match active track artwork color palettes, delivering a synchronized visual backdrop.
                    </div>
                  </td>
                </tr>

              </table>
            </td>
          </tr>

          <!-- Footer -->
          <tr>
            <td style="background-color: #08080a; padding: 28px 36px; border-top: 1px solid #27272a;" align="left">
              <table width="100%" border="0" cellspacing="0" cellpadding="0">
                <tr>
                  <td align="left">
                    <div style="font-size: 12px; color: #71717a; line-height: 1.5; font-family: monospace;">
                      Recipient: {{email}}
                    </div>
                    <div style="margin-top: 6px; font-size: 12px; color: #52525b; line-height: 1.5;">
                      SyncBeats Audio Inc. &bull; <a href="https://syncbeats.in/privacy-policy" style="color: #71717a; text-decoration: underline;">Privacy</a> &bull; <a href="https://syncbeats.in/terms-of-service" style="color: #71717a; text-decoration: underline;">Terms</a>
                    </div>
                  </td>
                  <td align="right" valign="top">
                    <span style="font-size: 10px; font-family: monospace; font-weight: 700; color: #a1a1aa; border: 1px solid #27272a; padding: 4px 8px; border-radius: 4px;">
                      ALL SYSTEMS OPERATIONAL
                    </span>
                  </td>
                </tr>
              </table>
            </td>
          </tr>

        </table>

      </td>
    </tr>
  </table>

</body>
</html>`,
  },
  {
    id: "welcome_verification",
    name: "Welcome & Account Verification",
    sender: "auth@syncbeats.in",
    subject: "Welcome to SyncBeats — Verify your email address",
    html: `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Welcome to SyncBeats</title>
</head>
<body style="margin: 0; padding: 0; background-color: #050507; color: #fafafa; font-family: -apple-system, BlinkMacSystemFont, sans-serif;">
  <table width="100%" border="0" cellspacing="0" cellpadding="0" style="background-color: #050507;">
    <tr>
      <td align="center" style="padding: 48px 16px;">
        <table width="100%" border="0" cellspacing="0" cellpadding="0" style="max-width: 580px; background-color: #0d0d11; border: 1px solid #27272a; border-radius: 24px; padding: 36px;">
          <tr>
            <td align="left">
              <div style="font-size: 16px; font-weight: 900; letter-spacing: 2px; color: #ffffff; font-family: monospace; margin-bottom: 24px;">
                SYNC<span style="color: #a1a1aa;">BEATS</span>
              </div>
              <h1 style="font-size: 22px; font-weight: 800; color: #ffffff; margin-bottom: 12px;">Welcome, {{name}}</h1>
              <p style="font-size: 14px; color: #a1a1aa; line-height: 1.6;">Thank you for registering your account with {{email}}. Click the link below to verify your email address and unlock full room hosting capabilities.</p>
              <div style="margin: 28px 0;">
                <a href="https://syncbeats.in/verify-email" style="background-color: #ffffff; color: #000000; font-weight: 700; padding: 14px 28px; border-radius: 12px; text-decoration: none; display: inline-block; font-size: 14px;">Verify Account &rarr;</a>
              </div>
              <p style="font-size: 12px; color: #71717a; border-top: 1px solid #1f1f23; padding-top: 16px;">If you did not request this email, no further action is required.</p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`,
  },
  {
    id: "room_invite",
    name: "Live Room Invitation",
    sender: "invites@syncbeats.in",
    subject: "You've been invited to join a SyncBeats session",
    html: `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Room Invite</title>
</head>
<body style="margin: 0; padding: 0; background-color: #050507; color: #fafafa; font-family: -apple-system, BlinkMacSystemFont, sans-serif;">
  <table width="100%" border="0" cellspacing="0" cellpadding="0" style="background-color: #050507;">
    <tr>
      <td align="center" style="padding: 48px 16px;">
        <table width="100%" border="0" cellspacing="0" cellpadding="0" style="max-width: 580px; background-color: #0d0d11; border: 1px solid #27272a; border-radius: 24px; padding: 36px;">
          <tr>
            <td align="left">
              <span style="font-size: 11px; font-weight: 800; font-family: monospace; letter-spacing: 1.5px; color: #fafafa; border: 1px solid #3f3f46; padding: 4px 10px; border-radius: 12px; background-color: #18181b;">
                SESSION INVITE
              </span>
              <h2 style="font-size: 22px; font-weight: 800; color: #ffffff; margin-top: 16px; margin-bottom: 12px;">Join live room with {{name}}</h2>
              <p style="font-size: 14px; color: #a1a1aa; line-height: 1.6;">You have been invited to participate in a high-fidelity synchronized music session on SyncBeats.</p>
              <div style="margin: 28px 0;">
                <a href="https://syncbeats.in/hub" style="background-color: #ffffff; color: #000000; font-weight: 700; padding: 14px 28px; border-radius: 12px; text-decoration: none; display: inline-block; font-size: 14px;">Join Room Session &rarr;</a>
              </div>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`,
  },
  {
    id: "security_alert",
    name: "Security & Device Alert",
    sender: "security@syncbeats.in",
    subject: "Security Alert: New device login for {{email}}",
    html: `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Security Alert</title>
</head>
<body style="margin: 0; padding: 0; background-color: #050507; color: #fafafa; font-family: -apple-system, BlinkMacSystemFont, sans-serif;">
  <table width="100%" border="0" cellspacing="0" cellpadding="0" style="background-color: #050507;">
    <tr>
      <td align="center" style="padding: 48px 16px;">
        <table width="100%" border="0" cellspacing="0" cellpadding="0" style="max-width: 580px; background-color: #0d0d11; border: 1px solid #3f3f46; border-radius: 24px; padding: 36px;">
          <tr>
            <td align="left">
              <span style="font-size: 11px; font-weight: 800; font-family: monospace; letter-spacing: 1.5px; color: #ef4444; border: 1px solid rgba(239, 68, 68, 0.3); padding: 4px 10px; border-radius: 12px; background-color: rgba(239, 68, 68, 0.1);">
                SECURITY NOTICE
              </span>
              <h2 style="font-size: 20px; font-weight: 800; color: #ffffff; margin-top: 16px; margin-bottom: 12px;">New sign-in detected</h2>
              <p style="font-size: 14px; color: #a1a1aa; line-height: 1.6;">Hello {{name}}, a new login was authenticated for {{email}} on {{created_at}}.</p>
              <div style="margin: 24px 0;">
                <a href="https://syncbeats.in/profile" style="background-color: #ef4444; color: #ffffff; font-weight: 700; padding: 12px 24px; border-radius: 12px; text-decoration: none; display: inline-block; font-size: 13px;">Manage Session Devices</a>
              </div>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`,
  },
  {
    id: "custom_canvas",
    name: "Blank HTML/CSS Canvas",
    sender: "updates@syncbeats.in",
    subject: "SyncBeats Broadcast Update",
    html: `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <style>
    body { background-color: #050507; color: #fafafa; font-family: sans-serif; padding: 24px; }
  </style>
</head>
<body>
  <h1>Hello {{name}},</h1>
  <p>Write or paste custom HTML/CSS email code here...</p>
</body>
</html>`,
  },
];

export default function EmailDesignerView({ users, onOpenSidebar }: EmailDesignerViewProps) {
  const [userList, setUserList] = useState<UserItem[]>(users || []);
  const [selectedPresetId, setSelectedPresetId] = useState(TEMPLATE_PRESETS[0].id);
  const [subject, setSubject] = useState(TEMPLATE_PRESETS[0].subject);
  const [htmlCode, setHtmlCode] = useState(TEMPLATE_PRESETS[0].html);
  const [senderEmail, setSenderEmail] = useState(TEMPLATE_PRESETS[0].sender);
  const [recipientMode, setRecipientMode] = useState<"all" | "active" | "custom" | "test">("test");
  const [testEmail, setTestEmail] = useState("siraparapuabhinay21@gmail.com");
  const [customEmailsInput, setCustomEmailsInput] = useState("");
  const [viewTab, setViewTab] = useState<"code" | "preview" | "split">("split");

  const [sending, setSending] = useState(false);
  const [sendResult, setSendResult] = useState<any>(null);

  useEffect(() => {
    if (users && users.length > 0) {
      setUserList(users);
    } else {
      fetch("/api/data/User")
        .then((res) => res.json())
        .then((data) => {
          if (data.data) setUserList(data.data);
        })
        .catch(() => {});
    }
  }, [users]);

  const insertVariable = (varName: string) => {
    setHtmlCode((prev) => prev + ` {{${varName}}}`);
  };

  const handleSelectPreset = (presetId: string) => {
    setSelectedPresetId(presetId);
    const preset = TEMPLATE_PRESETS.find((p) => p.id === presetId);
    if (preset) {
      setSubject(preset.subject);
      setHtmlCode(preset.html);
      setSenderEmail(preset.sender);
    }
  };

  const handleSend = async () => {
    if (!subject || !htmlCode) {
      alert("Subject and HTML Code cannot be empty");
      return;
    }

    setSending(true);
    setSendResult(null);

    const payload = {
      subject,
      htmlContent: htmlCode,
      recipientMode,
      testEmail,
      senderEmail,
      customEmails: customEmailsInput.split(",").map((e) => e.trim()),
    };

    try {
      const res = await fetch("/api/dashboard/email/send", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      const data = await res.json();
      if (res.ok) {
        setSendResult(data);
      } else {
        alert(`Failed to send emails: ${data.error || "Unknown error"}`);
      }
    } catch (err: any) {
      alert(`Network error: ${err?.message || err}`);
    } finally {
      setSending(false);
    }
  };

  return (
    <div className={cn('flex-1', 'flex', 'flex-col', 'w-full', 'h-full', 'min-h-0', 'bg-zinc-950', 'text-foreground', 'overflow-hidden')}>
      
      {/* Top Controls Header */}
      <div className={cn('py-4', 'px-6', 'bg-zinc-950', 'border-b', 'border-zinc-800/80', 'flex', 'flex-col', 'sm:flex-row', 'sm:items-center', 'justify-between', 'gap-4', 'shrink-0')}>
        <div>
          <div className={cn('flex', 'items-center', 'gap-3')}>
            {onOpenSidebar && (
              <button
                type="button"
                onClick={onOpenSidebar}
                className="md:hidden p-2 -ml-2 text-zinc-400 hover:text-white transition-colors rounded-lg bg-zinc-900 border border-zinc-800"
                title="Toggle Sidebar Menu"
              >
                <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="4" x2="20" y1="12" y2="12"/><line x1="4" x2="20" y1="6" y2="6"/><line x1="4" x2="20" y1="18" y2="18"/></svg>
              </button>
            )}
            <h1 className={cn('text-xl', 'sm:text-2xl', 'font-black', 'tracking-tight', 'text-white')}>
              Email Studio & Broadcast Engine
            </h1>
            <span className={cn('px-2.5', 'py-1', 'text-[10px]', 'font-bold', 'uppercase', 'tracking-widest', 'text-zinc-300', 'bg-zinc-800', 'border', 'border-zinc-700', 'rounded-lg')}>
              HTML/CSS IDE
            </span>
          </div>
          <p className={cn('text-xs', 'text-zinc-400', 'mt-1')}>
            Design, format, preview, and broadcast custom responsive emails across recipient clusters.
          </p>
        </div>

        {/* View Mode Toggle Tabs */}
        <div className={cn('flex', 'items-center', 'bg-zinc-900', 'border', 'border-zinc-800', 'rounded-xl', 'p-1', 'self-start', 'sm:self-auto')}>
          <button
            onClick={() => setViewTab("code")}
            className={cn('px-3', 'py-1.5', 'rounded-lg', 'text-xs', 'font-bold', 'transition-all', viewTab === "code" ? "bg-zinc-800 text-white" : "text-zinc-400 hover:text-white")}
          >
            Code Only
          </button>
          <button
            onClick={() => setViewTab("split")}
            className={cn('hidden', 'md:block', 'px-3', 'py-1.5', 'rounded-lg', 'text-xs', 'font-bold', 'transition-all', viewTab === "split" ? "bg-zinc-800 text-white" : "text-zinc-400 hover:text-white")}
          >
            Split View
          </button>
          <button
            onClick={() => setViewTab("preview")}
            className={cn('px-3', 'py-1.5', 'rounded-lg', 'text-xs', 'font-bold', 'transition-all', viewTab === "preview" ? "bg-zinc-800 text-white" : "text-zinc-400 hover:text-white")}
          >
            Live Preview
          </button>
        </div>
      </div>

      {/* Toolbar Options: Presets, Variables & Recipients */}
      <div className={cn('p-4', 'bg-zinc-950/60', 'border-b', 'border-zinc-800/80', 'flex', 'flex-wrap', 'items-center', 'justify-between', 'gap-4', 'text-xs', 'shrink-0')}>
        {/* Template Selector & Sender Badge */}
        <div className={cn('flex', 'flex-wrap', 'items-center', 'gap-3')}>
          <div className={cn('flex', 'items-center', 'gap-2')}>
            <span className={cn('text-zinc-400', 'font-bold')}>Template:</span>
            <select
              value={selectedPresetId}
              onChange={(e) => handleSelectPreset(e.target.value)}
              className={cn('bg-zinc-900', 'border', 'border-zinc-800', 'text-white', 'rounded-xl', 'px-3', 'py-1.5', 'font-semibold', 'focus:outline-none', 'focus:border-zinc-500')}
            >
              {TEMPLATE_PRESETS.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
          </div>

          <div className={cn('flex', 'items-center', 'gap-2', 'px-3', 'py-1.5', 'bg-zinc-900', 'border', 'border-zinc-800', 'rounded-xl', 'text-zinc-300', 'font-mono')}>
            <span className={cn('text-zinc-500', 'font-bold')}>Sender:</span>
            <span>{senderEmail}</span>
          </div>
        </div>

        {/* Variable Substitution Chips */}
        <div className={cn('flex', 'items-center', 'gap-2')}>
          <span className={cn('text-zinc-400', 'font-bold')}>Variables:</span>
          {["name", "email", "created_at"].map((varName) => (
            <button
              key={varName}
              onClick={() => insertVariable(varName)}
              className={cn('px-2.5', 'py-1', 'bg-zinc-900', 'hover:bg-zinc-800', 'border', 'border-zinc-800', 'rounded-lg', 'text-white', 'font-mono', 'font-bold', 'transition-colors')}
            >
              {`{{${varName}}}`}
            </button>
          ))}
        </div>

        {/* Target Audience Selector */}
        <div className={cn('flex', 'flex-wrap', 'items-center', 'gap-2')}>
          <span className={cn('text-zinc-400', 'font-bold')}>Recipients:</span>
          <select
            value={recipientMode}
            onChange={(e: any) => setRecipientMode(e.target.value)}
            className={cn('bg-zinc-900', 'border', 'border-zinc-800', 'text-white', 'rounded-xl', 'px-3', 'py-1.5', 'font-semibold', 'focus:outline-none')}
          >
            <option value="test">Send Test Email Only</option>
            <option value="active">Active Users (Last 7 days)</option>
            <option value="all">All Database Users ({userList.length})</option>
            <option value="custom">Custom Recipient List</option>
          </select>

          {recipientMode === "test" && (
            <input
              type="email"
              value={testEmail}
              onChange={(e) => setTestEmail(e.target.value)}
              placeholder="admin@domain.com"
              className={cn('bg-zinc-900', 'border', 'border-zinc-800', 'text-white', 'rounded-xl', 'px-3', 'py-1.5', 'font-mono', 'text-xs', 'focus:outline-none')}
            />
          )}

          {recipientMode === "custom" && (
            <input
              type="text"
              value={customEmailsInput}
              onChange={(e) => setCustomEmailsInput(e.target.value)}
              placeholder="user1@domain.com, user2@domain.com"
              className={cn('bg-zinc-900', 'border', 'border-zinc-800', 'text-white', 'rounded-xl', 'px-3', 'py-1.5', 'font-mono', 'text-xs', 'focus:outline-none', 'w-56')}
            />
          )}
        </div>
      </div>

      {/* Subject Line Input Bar */}
      <div className={cn('p-4', 'bg-zinc-950', 'border-b', 'border-zinc-800', 'shrink-0')}>
        <label className={cn('block', 'text-[11px]', 'font-bold', 'text-zinc-400', 'uppercase', 'tracking-wider', 'mb-1')}>Subject Line</label>
        <input
          type="text"
          value={subject}
          onChange={(e) => setSubject(e.target.value)}
          placeholder="Email Subject Line"
          className={cn('w-full', 'bg-zinc-900', 'border', 'border-zinc-800', 'text-white', 'rounded-xl', 'px-4', 'py-2.5', 'text-sm', 'font-semibold', 'focus:outline-none', 'focus:border-zinc-600', 'transition-all')}
        />
      </div>

      {/* Main Studio Editor & Live Sandboxed HTML Preview Grid */}
      <div className={cn('flex-1', 'h-full', 'min-h-0', 'grid', 'grid-cols-1', 'md:grid-cols-2', 'divide-y', 'md:divide-y-0', 'md:divide-x', 'divide-zinc-800', 'overflow-hidden')}>
        
        {/* HTML/CSS Code Editor with Syntax Highlighting & Line Numbers */}
        {(viewTab === "code" || viewTab === "split") && (
          <div className={cn('flex', 'flex-col', 'h-full', 'min-h-0', 'bg-zinc-950', viewTab === "code" ? "col-span-2" : "")}>
            <HtmlCodeEditor code={htmlCode} onChange={setHtmlCode} />
          </div>
        )}

        {/* Sandboxed Live HTML Rendering Engine with Native Smooth Scroll */}
        {(viewTab === "preview" || viewTab === "split") && (
          <div className={cn('flex', 'flex-col', 'h-full', 'min-h-0', 'bg-zinc-950', viewTab === "preview" ? "col-span-2" : "")}>
            <div className={cn('p-3', 'bg-zinc-900/90', 'border-b', 'border-zinc-800', 'text-xs', 'font-mono', 'text-zinc-400', 'flex', 'items-center', 'justify-between', 'shrink-0')}>
              <span>Sandboxed Email Render Preview</span>
              <span className={cn('text-[10px]', 'text-emerald-400', 'font-bold')}>Live High-Fidelity Engine</span>
            </div>
            <ShadowHtmlPreview html={htmlCode} />
          </div>
        )}

      </div>

      {/* Footer Dispatch Bar */}
      <div className={cn('p-4', 'border-t', 'border-zinc-800', 'bg-zinc-950', 'flex', 'items-center', 'justify-between', 'shrink-0')}>
        <div className={cn('text-xs', 'text-zinc-400')}>
          {sendResult && (
            <span className={`font-bold ${sendResult.failCount === 0 ? "text-emerald-400" : "text-amber-400"}`}>
              Dispatch complete: {sendResult.sentCount} sent, {sendResult.failCount} failed.
            </span>
          )}
        </div>

        <button
          onClick={handleSend}
          disabled={sending}
          className={cn('px-8', 'py-3', 'bg-white', 'hover:bg-zinc-200', 'text-black', 'rounded-xl', 'text-xs', 'font-extrabold', 'disabled:opacity-50', 'transition-all', 'flex', 'items-center', 'gap-2', 'cursor-pointer', 'shadow-xl')}
        >
          {sending ? (
            <>
              <svg className={cn('animate-spin', 'h-4', 'w-4', 'text-black')} xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
              </svg>
              <span>Dispatching Emails...</span>
            </>
          ) : (
            <>
              <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/></svg>
              <span>Broadcast Email Now</span>
            </>
          )}
        </button>
      </div>

    </div>
  );
}
