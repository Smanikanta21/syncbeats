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
