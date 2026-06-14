// @ts-nocheck
import prisma from '../src/db/prisma';

function buildEmailLayout(title: string, intro: string, actionLabel: string, actionUrl: string): string {
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
            <tr>
              <td style="padding:40px 32px;text-align:left;">
                <h1 style="margin:0 0 16px 0;color:#ffffff;font-size:24px;font-weight:700;line-height:1.3;letter-spacing:-0.02em;">${title}</h1>
                <p style="margin:0 0 28px 0;color:#a1a1aa;font-size:15px;line-height:1.6;font-weight:400;">${intro}</p>
                
                <!-- Action Button -->
                <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:0 auto 28px auto;">
                  <tr>
                    <td align="center" style="border-radius:12px;background-color:#f4f4f5;">
                      <a href="${actionUrl}" class="btn-hover" style="display:inline-block;padding:12px 24px;font-size:14px;font-weight:600;color:#09090b;text-decoration:none;border-radius:12px;transition:all 0.2s ease;width:100%;box-sizing:border-box;">${actionLabel}</a>
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
</html>`;
}

async function sendEmail(to: string, subject: string, html: string): Promise<void> {
  const apiKey = process.env.RESEND_API_KEY;
  const authAddress = process.env.AUTH_FROM_EMAIL;
  const from = authAddress ? `SYNCBEATS <${authAddress}>` : authAddress;
  
  if (!apiKey || !from) {
    throw new Error('Email service is not configured. Set RESEND_API_KEY and AUTH_FROM_EMAIL.');
  }

  const response = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ from, to: [to], subject, html }),
  });

  const rawBody = await response.text();
  if (!response.ok) {
    throw new Error(`Resend email send failed: ${rawBody}`);
  }

  console.info(`[Update Script] Email sent to ${to}.`);
}

async function main() {
  console.log('Fetching users from the database...');
  const users = await prisma.user.findMany({
    select: { email: true, name: true }
  });

  console.log(`Found ${users.length} users. Sending emails...`);

  let successCount = 0;
  let failCount = 0;

  for (const user of users) {
    try {
      const subject = "We are back! Spatial Audio & 3D Surround is here 🎧";
      const intro = `Hi ${user.name},<br><br>We are thrilled to announce that SyncBeats is back and better than ever!<br><br>We've just launched <strong>Spatial Audio Support with 3D Surround</strong>. You can now arrange your friends in a virtual 3D room and experience immersive, perfectly synced audio based on their positions.<br><br>Jump into a room now and drag the participants around to hear the magic.`;
      const html = buildEmailLayout(
        "SyncBeats Spatial Audio is Live!",
        intro,
        "Experience Spatial Audio",
        process.env.FRONTEND_URL || "https://syncbeats.app"
      );

      await sendEmail(user.email, subject, html);
      successCount++;
      // Wait a tiny bit between emails to avoid rate limits
      await new Promise(resolve => setTimeout(resolve, 200));
    } catch (err: any) {
      console.error(`Failed to send to ${user.email}: ${err.message}`);
      failCount++;
    }
  }

  console.log(`\nDone! Successfully sent ${successCount} emails. Failed: ${failCount}.`);
  await prisma.$disconnect();
}

main().catch(async (e) => {
  console.error(e);
  await prisma.$disconnect();
  process.exit(1);
});
