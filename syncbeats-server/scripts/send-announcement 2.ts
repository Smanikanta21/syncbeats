import 'dotenv/config';
import prisma from '../src/db/prisma';
import { buildAnnouncementHtml } from '../src/auth/EmailTemplates';

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

  console.info(`[Announcement] Email queued to ${to}.`);
}

async function main() {
  console.log("Fetching users...");
  const users = await prisma.user.findMany({
    select: { email: true, name: true },
  });

  console.log(`Found ${users.length} users. Sending announcements...`);

  const title = "Important Update: YouTube Sync Beta";
  const message = `We wanted to give you a quick update regarding YouTube Sync. The direct YouTube sync feature is currently in Beta and we've noticed it may not work perfectly on all devices due to browser restrictions.

We highly recommend using the new <strong>"Download & Play"</strong> option in the YouTube modal, or uploading your own local audio files. This ensures you get the absolute best real-time synchronization experience!`;

  const html = buildAnnouncementHtml(title, message);

  for (const user of users) {
    try {
      await sendEmail(user.email, title, html);
      // Rate limiting precaution (Resend allows ~10 emails/sec, but good to be safe)
      await new Promise(r => setTimeout(r, 100));
    } catch (err) {
      console.error(`Failed to send to ${user.email}:`, err);
    }
  }

  console.log("Done!");
  process.exit(0);
}

main().catch(console.error);
