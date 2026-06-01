// auth/EmailTemplates.ts — Pure HTML template generators for SyncBeats transactional emails

function buildEmailLayout(title: string, intro: string, actionLabel: string, actionUrl: string, expiryText: string): string {
  return `
<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <title>${title}</title>
    <style>
      @import url('https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;500;600;700;800&display=swap');
      
      @keyframes fadeInUp {
        from { opacity: 0; transform: translateY(15px); }
        to { opacity: 1; transform: translateY(0); }
      }
      
      @keyframes borderGlow {
        0%, 100% { border-color: rgba(255, 255, 255, 0.08); box-shadow: 0 0 15px rgba(255, 255, 255, 0.03); }
        50% { border-color: rgba(255, 255, 255, 0.15); box-shadow: 0 0 25px rgba(255, 255, 255, 0.08); }
      }

      body {
        margin: 0;
        padding: 0;
        min-width: 100%;
        background-color: #050507;
        font-family: 'Plus Jakarta Sans', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif !important;
      }
      
      .animated-card {
        animation: fadeInUp 0.8s cubic-bezier(0.16, 1, 0.3, 1) forwards, borderGlow 4s ease-in-out infinite;
      }
      
      .btn-hover:hover {
        background-color: #ffffff !important;
        color: #050507 !important;
        transform: scale(1.02);
      }
    </style>
  </head>
  <body style="margin:0;padding:0;background-color:#050507;font-family:'Plus Jakarta Sans',-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;">
    <table role="presentation" width="100%" height="100%" cellpadding="0" cellspacing="0" style="background-color:#050507;min-height:100vh;padding:40px 16px;margin:0;">
      <tr>
        <td align="center" valign="top">
          <!-- Logo Header -->
          <table role="presentation" cellpadding="0" cellspacing="0" style="margin-bottom:28px;">
            <tr>
              <td style="font-size:24px;font-weight:800;letter-spacing:-0.03em;color:#ffffff;font-family:'Plus Jakarta Sans',sans-serif;">
                SYNC<span style="color:#71717a;">BEATS</span>
              </td>
            </tr>
          </table>

          <!-- Main Card Container -->
          <table role="presentation" class="animated-card" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;background-color:#0c0c0e;border:1px solid #1f1f23;border-radius:20px;overflow:hidden;box-shadow:0 12px 30px rgba(0,0,0,0.6);">
            <!-- Removed Gradient Accent Line -->
            <!-- Card Body -->
            <tr>
              <td style="padding:40px 32px;text-align:center;">
                <h1 style="margin:0 0 16px 0;color:#ffffff;font-size:24px;font-weight:700;line-height:1.3;letter-spacing:-0.02em;">${title}</h1>
                <p style="margin:0 0 28px 0;color:#a1a1aa;font-size:15px;line-height:1.6;font-weight:400;">${intro}</p>
                
                <!-- Action Button -->
                <table role="presentation" align="center" cellpadding="0" cellspacing="0" style="margin:0 auto 28px auto;">
                  <tr>
                    <td align="center" style="border-radius:12px;background-color:#f4f4f5;">
                      <a href="${actionUrl}" class="btn-hover" style="display:inline-block;padding:12px 24px;font-size:14px;font-weight:600;color:#09090b;text-decoration:none;border-radius:12px;transition:all 0.2s ease;">${actionLabel}</a>
                    </td>
                  </tr>
                </table>

                ${expiryText ? `<p style="margin:0 0 20px 0;color:#71717a;font-size:13px;line-height:1.5;">${expiryText}</p>` : ''}
                
                <!-- Fallback Link -->
                <p style="margin:0;padding-top:20px;border-top:1px solid #1f1f23;color:#52525b;font-size:12px;line-height:1.5;word-break:break-all;">
                  If the button does not work, copy and paste this link into your browser:<br />
                  <a href="${actionUrl}" style="color:#ffffff;text-decoration:underline;word-break:break-all;">${actionUrl}</a>
                </p>
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>`;
}

function buildWelcomeEmailContent(name: string, actionLabel: string, actionUrl: string, footerText: string = ''): string {
  return `
<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <title>Welcome to SyncBeats</title>
    <style>
      @import url('https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;500;600;700;800&display=swap');
      
      @keyframes fadeInUp {
        from { opacity: 0; transform: translateY(15px); }
        to { opacity: 1; transform: translateY(0); }
      }
      
      @keyframes borderGlow {
        0%, 100% { border-color: rgba(255, 255, 255, 0.08); box-shadow: 0 0 15px rgba(255, 255, 255, 0.03); }
        50% { border-color: rgba(255, 255, 255, 0.15); box-shadow: 0 0 25px rgba(255, 255, 255, 0.08); }
      }

      body {
        margin: 0;
        padding: 0;
        min-width: 100%;
        background-color: #050507;
        font-family: 'Plus Jakarta Sans', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif !important;
      }
      
      .animated-card {
        animation: fadeInUp 0.8s cubic-bezier(0.16, 1, 0.3, 1) forwards, borderGlow 4s ease-in-out infinite;
      }
      
      .btn-hover:hover {
        background-color: #ffffff !important;
        color: #050507 !important;
        transform: scale(1.02);
      }
    </style>
  </head>
  <body style="margin:0;padding:0;background-color:#050507;font-family:'Plus Jakarta Sans',-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;">
    <table role="presentation" width="100%" height="100%" cellpadding="0" cellspacing="0" style="background-color:#050507;min-height:100vh;padding:40px 16px;margin:0;">
      <tr>
        <td align="center" valign="top">
          <!-- Logo Header -->
          <table role="presentation" cellpadding="0" cellspacing="0" style="margin-bottom:28px;">
            <tr>
              <td style="font-size:24px;font-weight:800;letter-spacing:-0.03em;color:#ffffff;font-family:'Plus Jakarta Sans',sans-serif;">
                SYNC<span style="color:#71717a;">BEATS</span>
              </td>
            </tr>
          </table>

          <!-- Main Card Container -->
          <table role="presentation" class="animated-card" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;background-color:#0c0c0e;border:1px solid #1f1f23;border-radius:20px;overflow:hidden;box-shadow:0 12px 30px rgba(0,0,0,0.6);">
            <!-- Removed Gradient Accent Line -->
            <!-- Card Body -->
            <tr>
              <td style="padding:40px 32px;text-align:left;">
                <h1 style="margin:0 0 12px 0;color:#ffffff;font-size:24px;font-weight:700;line-height:1.3;letter-spacing:-0.02em;">Welcome to SyncBeats, ${name}</h1>
                <p style="margin:0 0 32px 0;color:#a1a1aa;font-size:15px;line-height:1.6;font-weight:400;">We are thrilled to have you! SyncBeats allows you to listen to your favorite tracks in absolute real-time sync with friends. <br/><br/><strong style="color:#ef4444;">Note:</strong> The direct YouTube sync feature is currently in Beta and may be unstable on certain devices. We highly recommend using the <strong>"Download & Play"</strong> option in the YouTube modal, or uploading your own local files for the most reliable sync experience.</p>
                
                <!-- Steps Container Table -->
                <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:32px;">
                  <tr>
                    <td style="padding-bottom:16px;">
                      <!-- Card Step 1 -->
                      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color:#121215;border:1px solid #27272a;border-radius:12px;padding:16px;">
                        <tr>
                          <td valign="top" style="width:28px;font-size:14px;font-weight:700;color:#ffffff;">01</td>
                          <td valign="top">
                            <h4 style="margin:0 0 4px 0;color:#ffffff;font-size:14px;font-weight:600;">Create a Room</h4>
                            <p style="margin:0;color:#a1a1aa;font-size:13px;line-height:1.5;">Launch a synchronized listening room instantly from your dashboard.</p>
                          </td>
                        </tr>
                      </table>
                    </td>
                  </tr>
                  <tr>
                    <td style="padding-bottom:16px;">
                      <!-- Card Step 2 -->
                      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color:#121215;border:1px solid #27272a;border-radius:12px;padding:16px;">
                        <tr>
                          <td valign="top" style="width:28px;font-size:14px;font-weight:700;color:#ffffff;">02</td>
                          <td valign="top">
                            <h4 style="margin:0 0 4px 0;color:#ffffff;font-size:14px;font-weight:600;">Queue Your Sound</h4>
                            <p style="margin:0;color:#a1a1aa;font-size:13px;line-height:1.5;">Search and add YouTube tracks or upload local files effortlessly.</p>
                          </td>
                        </tr>
                      </table>
                    </td>
                  </tr>
                  <tr>
                    <td>
                      <!-- Card Step 3 -->
                      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color:#121215;border:1px solid #27272a;border-radius:12px;padding:16px;">
                        <tr>
                          <td valign="top" style="width:28px;font-size:14px;font-weight:700;color:#ffffff;">03</td>
                          <td valign="top">
                            <h4 style="margin:0 0 4px 0;color:#ffffff;font-size:14px;font-weight:600;">Sync and Vibe</h4>
                            <p style="margin:0;color:#a1a1aa;font-size:13px;line-height:1.5;">Share your invite link to experience perfectly synchronized audio with your group.</p>
                          </td>
                        </tr>
                      </table>
                    </td>
                  </tr>
                </table>

                <!-- Action Button -->
                <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:28px;">
                  <tr>
                    <td align="center" style="border-radius:12px;background-color:#f4f4f5;">
                      <a href="${actionUrl}" class="btn-hover" style="display:block;padding:14px 24px;font-size:14px;font-weight:600;color:#09090b;text-decoration:none;border-radius:12px;text-align:center;transition:all 0.2s ease;">${actionLabel}</a>
                    </td>
                  </tr>
                </table>

                ${footerText ? `<p style="margin:0 0 20px 0;color:#71717a;font-size:13px;line-height:1.5;text-align:center;">${footerText}</p>` : ''}
                
                <!-- Fallback Link -->
                <p style="margin:0;padding-top:20px;border-top:1px solid #1f1f23;color:#52525b;font-size:12px;line-height:1.5;word-break:break-all;">
                  If the button does not work, copy and paste this link into your browser:<br />
                  <a href="${actionUrl}" style="color:#ffffff;text-decoration:underline;word-break:break-all;">${actionUrl}</a>
                </p>
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>`;
}

export function buildVerifyEmailHtml(name: string, verifyUrl: string): string {
  return buildEmailLayout(
    'Verify your email',
    `Hi ${name}, thanks for joining SyncBeats. Let's verify your email address to secure your account.`,
    'Verify Email',
    verifyUrl,
    'This link will expire in 24 hours.'
  );
}

export function buildAnnouncementHtml(title: string, message: string): string {
  return buildEmailLayout(
    title,
    message,
    'Open SyncBeats',
    'https://syncbeats.app/hub',
    ''
  );
}

export function buildYouTubeSyncGuideHtml(name: string): string {
  const year = new Date().getFullYear();
  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <title>How to Use YouTube Sync on SyncBeats</title>
    <style>
      @import url('https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;500;600;700;800&display=swap');
      body { margin:0;padding:0;background-color:#050507;font-family:'Plus Jakarta Sans',-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif; }
    </style>
  </head>
  <body style="margin:0;padding:0;background-color:#050507;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color:#050507;padding:40px 16px;">
      <tr><td align="center" valign="top">

        <!-- Logo -->
        <table role="presentation" cellpadding="0" cellspacing="0" style="margin-bottom:28px;">
          <tr><td style="font-size:24px;font-weight:800;letter-spacing:-0.03em;color:#ffffff;font-family:'Plus Jakarta Sans',sans-serif;">SYNC<span style="color:#71717a;">BEATS</span></td></tr>
        </table>

        <!-- Card -->
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:580px;background-color:#0c0c0e;border:1px solid #1f1f23;border-radius:20px;overflow:hidden;box-shadow:0 12px 30px rgba(0,0,0,0.6);">
          <!-- Red accent bar -->
          <tr><td style="height:4px;background:linear-gradient(90deg,#FF0000,#ff4d4d);"></td></tr>

          <tr><td style="padding:36px 32px 32px 32px;">

            <h1 style="margin:0 0 8px 0;color:#ffffff;font-size:22px;font-weight:700;line-height:1.3;">How to use YouTube Sync, ${name}</h1>
            <p style="margin:0 0 24px 0;color:#a1a1aa;font-size:14px;line-height:1.7;">We have upgraded the YouTube experience in your rooms. Here is everything you need to get the most reliable sync possible.</p>

            <!-- Warning banner -->
            <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color:#2a1215;border:1px solid #7f1d1d;border-radius:12px;margin-bottom:24px;">
              <tr><td style="padding:14px 18px;">
                <p style="margin:0;color:#fca5a5;font-size:13px;font-weight:600;line-height:1.6;">The <strong style="color:#ffffff;">Play (Beta)</strong> button streams YouTube directly and may be unstable on some devices. For guaranteed sync, always use <strong style="color:#ef4444;">Download &amp; Play</strong>.</p>
              </td></tr>
            </table>

            <!-- Step 1 -->
            <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color:#121215;border:1px solid #27272a;border-radius:14px;margin-bottom:10px;">
              <tr><td style="padding:18px 20px;">
                <table role="presentation" cellpadding="0" cellspacing="0"><tr>
                  <td valign="top" style="width:34px;"><div style="width:26px;height:26px;background-color:#18181b;border:1px solid #3f3f46;border-radius:8px;text-align:center;line-height:26px;font-size:12px;font-weight:800;color:#ffffff;">01</div></td>
                  <td valign="top" style="padding-left:12px;">
                    <h4 style="margin:0 0 4px 0;color:#ffffff;font-size:14px;font-weight:700;">Open the room and expand the island</h4>
                    <p style="margin:0;color:#a1a1aa;font-size:13px;line-height:1.6;">Hover over the floating island at the top of any room page. Tap the <strong style="color:#FF0000;">YouTube</strong> tab that appears.</p>
                  </td>
                </tr></table>
              </td></tr>
            </table>

            <!-- Step 2 -->
            <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color:#121215;border:1px solid #27272a;border-radius:14px;margin-bottom:10px;">
              <tr><td style="padding:18px 20px;">
                <table role="presentation" cellpadding="0" cellspacing="0"><tr>
                  <td valign="top" style="width:34px;"><div style="width:26px;height:26px;background-color:#18181b;border:1px solid #3f3f46;border-radius:8px;text-align:center;line-height:26px;font-size:12px;font-weight:800;color:#ffffff;">02</div></td>
                  <td valign="top" style="padding-left:12px;">
                    <h4 style="margin:0 0 4px 0;color:#ffffff;font-size:14px;font-weight:700;">Search for any song</h4>
                    <p style="margin:0;color:#a1a1aa;font-size:13px;line-height:1.6;">Type a song name in the search box and press <strong style="color:#ffffff;">Search</strong>. Top 10 YouTube results will appear instantly.</p>
                  </td>
                </tr></table>
              </td></tr>
            </table>

            <!-- Step 3 — Recommended -->
            <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color:#0f1f13;border:1px solid #14532d;border-radius:14px;margin-bottom:10px;">
              <tr><td style="padding:18px 20px;">
                <table role="presentation" cellpadding="0" cellspacing="0"><tr>
                  <td valign="top" style="width:34px;"><div style="width:26px;height:26px;background-color:#052e16;border:1px solid #166534;border-radius:8px;text-align:center;line-height:26px;font-size:12px;font-weight:800;color:#4ade80;">03</div></td>
                  <td valign="top" style="padding-left:12px;">
                    <table role="presentation" cellpadding="0" cellspacing="0" style="margin-bottom:4px;"><tr>
                      <td><h4 style="margin:0;color:#ffffff;font-size:14px;font-weight:700;">Click "Download &amp; Play"</h4></td>
                      <td style="padding-left:8px;"><span style="background-color:#14532d;color:#4ade80;font-size:10px;font-weight:700;padding:2px 8px;border-radius:6px;">RECOMMENDED</span></td>
                    </tr></table>
                    <p style="margin:0;color:#a1a1aa;font-size:13px;line-height:1.6;">The red <strong style="color:#ef4444;">Download &amp; Play</strong> button downloads the audio to the room's private storage and plays it natively. This is the most reliable way to sync music across all devices with zero buffering.</p>
                  </td>
                </tr></table>
              </td></tr>
            </table>

            <!-- Step 4 -->
            <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color:#121215;border:1px solid #27272a;border-radius:14px;margin-bottom:28px;">
              <tr><td style="padding:18px 20px;">
                <table role="presentation" cellpadding="0" cellspacing="0"><tr>
                  <td valign="top" style="width:34px;"><div style="width:26px;height:26px;background-color:#18181b;border:1px solid #3f3f46;border-radius:8px;text-align:center;line-height:26px;font-size:12px;font-weight:800;color:#ffffff;">04</div></td>
                  <td valign="top" style="padding-left:12px;">
                    <h4 style="margin:0 0 4px 0;color:#ffffff;font-size:14px;font-weight:700;">Or just upload your own files</h4>
                    <p style="margin:0;color:#a1a1aa;font-size:13px;line-height:1.6;">Drag and drop any MP3, WAV, or M4A directly into the room for the absolute best sync precision with no external dependencies.</p>
                  </td>
                </tr></table>
              </td></tr>
            </table>

            <!-- CTA button -->
            <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:24px;">
              <tr><td align="center" style="border-radius:12px;background-color:#f4f4f5;">
                <a href="https://syncbeats.app/hub" style="display:block;padding:14px 24px;font-size:14px;font-weight:700;color:#09090b;text-decoration:none;border-radius:12px;text-align:center;">Open SyncBeats and Try It</a>
              </td></tr>
            </table>

            <!-- Issues link -->
            <p style="margin:0 0 24px 0;color:#52525b;font-size:12px;text-align:center;line-height:1.6;">
              Ran into a bug? <a href="https://github.com/Smanikanta21/syncbeats/issues" style="color:#a1a1aa;text-decoration:underline;">Raise it on GitHub</a> — we fix fast.
            </p>

            <!-- Footer -->
            <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
              <tr><td style="border-top:1px solid #1f1f23;padding-top:20px;">
                <p style="margin:0;color:#3f3f46;font-size:11px;text-align:center;line-height:1.5;">
                  You are receiving this because you have a SyncBeats account.<br/>
                  &copy; ${year} SyncBeats Inc. All rights reserved.
                </p>
              </td></tr>
            </table>

          </td></tr>
        </table>

      </td></tr>
    </table>
  </body>
</html>`;
}

export function buildWelcomeHtml(name: string, hubUrl: string): string {
  return buildWelcomeEmailContent(name, 'Go to Hub', hubUrl);
}

export function buildWelcomeWithVerificationHtml(name: string, verifyUrl: string): string {
  return buildWelcomeEmailContent(name, 'Verify Email & Start Listening', verifyUrl, 'This verification link expires in 24 hours.');
}

export function buildResetPasswordOtpHtml(name: string, otp: string): string {
  return `
<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <title>Reset your password</title>
    <style>
      @import url('https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;500;600;700;800&display=swap');
      
      @keyframes fadeInUp {
        from { opacity: 0; transform: translateY(15px); }
        to { opacity: 1; transform: translateY(0); }
      }
      
      @keyframes borderGlow {
        0%, 100% { border-color: rgba(255, 255, 255, 0.08); box-shadow: 0 0 15px rgba(255, 255, 255, 0.03); }
        50% { border-color: rgba(255, 255, 255, 0.15); box-shadow: 0 0 25px rgba(255, 255, 255, 0.08); }
      }

      body {
        margin: 0;
        padding: 0;
        min-width: 100%;
        background-color: #050507;
        font-family: 'Plus Jakarta Sans', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif !important;
      }
      
      .animated-card {
        animation: fadeInUp 0.8s cubic-bezier(0.16, 1, 0.3, 1) forwards, borderGlow 4s ease-in-out infinite;
      }
    </style>
  </head>
  <body style="margin:0;padding:0;background-color:#050507;font-family:'Plus Jakarta Sans',-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;">
    <table role="presentation" width="100%" height="100%" cellpadding="0" cellspacing="0" style="background-color:#050507;min-height:100vh;padding:40px 16px;margin:0;">
      <tr>
        <td align="center" valign="top">
          <!-- Logo Header -->
          <table role="presentation" cellpadding="0" cellspacing="0" style="margin-bottom:28px;">
            <tr>
              <td style="font-size:24px;font-weight:800;letter-spacing:-0.03em;color:#ffffff;font-family:'Plus Jakarta Sans',sans-serif;">
                SYNC<span style="color:#71717a;">BEATS</span>
              </td>
            </tr>
          </table>

          <!-- Main Card Container -->
          <table role="presentation" class="animated-card" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;background-color:#0c0c0e;border:1px solid #1f1f23;border-radius:20px;overflow:hidden;box-shadow:0 12px 30px rgba(0,0,0,0.6);">
            <!-- Removed Gradient Accent Line -->
            <!-- Card Body -->
            <tr>
              <td style="padding:40px 32px;text-align:center;">
                <h1 style="margin:0 0 16px 0;color:#ffffff;font-size:24px;font-weight:700;line-height:1.3;letter-spacing:-0.02em;">Reset your password</h1>
                <p style="margin:0 0 28px 0;color:#a1a1aa;font-size:15px;line-height:1.6;font-weight:400;">Hi ${name}, use the code below to reset your password. This code will expire in 30 minutes.</p>
                
                <!-- OTP Box -->
                <table role="presentation" align="center" cellpadding="0" cellspacing="0" style="margin:0 auto 28px auto;">
                  <tr>
                    <td align="center" style="border:1px solid #3f3f46;background-color:#121215;border-radius:14px;padding:12px 24px;letter-spacing:0.25em;font-size:32px;font-weight:800;color:#ffffff;font-family:monospace;">
                      ${otp}
                    </td>
                  </tr>
                </table>

                <p style="margin:0;padding-top:20px;border-top:1px solid #1f1f23;color:#52525b;font-size:12px;line-height:1.5;">
                  If you did not request this password reset, you can safely ignore this email.
                </p>
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>`;
}
