export const BETA_CONSENT_VERSION = '2026-11-20';
export const BETA_RETENTION_DAYS = 180;

export interface BetaSignupInput {
  email: string;
  name: string | null;
  macChip: 'apple-silicon' | 'intel' | 'unsure';
  macosVersion: string | null;
  testingInterest: string | null;
}

export function parseBetaSignup(body: unknown):
  | { ok: true; signup: BetaSignupInput; honeypot: boolean }
  | { ok: false; error: string } {
  if (!body || typeof body !== 'object' || Array.isArray(body)) return { ok: false, error: 'Invalid signup request.' };
  const b = body as Record<string, unknown>;
  if (b.consent !== true) return { ok: false, error: 'Please agree to receive Mac beta invitations and read the privacy policy.' };
  if (typeof b.email !== 'string') return { ok: false, error: 'Enter a valid email address.' };
  const email = b.email.trim().toLowerCase();
  if (email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || /[\u0000-\u001f\u007f]/.test(email)) {
    return { ok: false, error: 'Enter a valid email address.' };
  }
  const optionalText = (key: string, max: number): string | null | false => {
    const value = b[key];
    if (value === undefined || value === null || value === '') return null;
    if (typeof value !== 'string' || value.length > max || value.includes('\0')) return false;
    return value.trim() || null;
  };
  const name = optionalText('name', 80);
  const macosVersion = optionalText('macosVersion', 40);
  const testingInterest = optionalText('testingInterest', 500);
  if (name === false || macosVersion === false || testingInterest === false) {
    return { ok: false, error: 'Check the optional fields and their length limits.' };
  }
  const macChip = b.macChip ?? 'unsure';
  if (macChip !== 'apple-silicon' && macChip !== 'intel' && macChip !== 'unsure') {
    return { ok: false, error: 'Select your Mac chip, or choose Not sure.' };
  }
  if (b.website !== undefined && typeof b.website !== 'string') return { ok: false, error: 'Invalid signup request.' };
  return { ok: true, signup: { email, name, macChip, macosVersion, testingInterest }, honeypot: typeof b.website === 'string' && b.website.trim().length > 0 };
}
