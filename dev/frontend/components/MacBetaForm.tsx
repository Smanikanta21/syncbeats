"use client";

import { useState, type FormEvent } from 'react';
import Link from 'next/link';
import { ArrowRight, Check } from 'lucide-react';

const fieldClass = 'public-info-field';

export function MacBetaForm() {
  const [status, setStatus] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle');
  const [error, setError] = useState('');
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (status === 'saving') return;
    const data = new FormData(event.currentTarget);
    setStatus('saving');
    setError('');
    try {
      const response = await fetch('/api/beta/mac', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: data.get('email'), name: data.get('name'), macChip: data.get('macChip'),
          macosVersion: data.get('macosVersion'), testingInterest: data.get('testingInterest'),
          consent: data.get('consent') === 'on', website: data.get('website') }),
        signal: AbortSignal.timeout(15_000),
      });
      const result = await response.json().catch(() => null);
      if (response.status !== 202 || result?.ok !== true) {
        throw new Error(typeof result?.error === 'string' ? result.error : 'Could not save your request. Please try again.');
      }
      setStatus('saved');
    } catch (cause) {
      setError(cause instanceof Error && cause.name !== 'TimeoutError' ? cause.message : 'The connection timed out. Please try again.');
      setStatus('error');
    }
  }
  if (status === 'saved') return (
    <div role="status" className="mac-beta-confirmation">
      <Check size={24} aria-hidden="true" className="mb-4" />
      <h2 className="text-2xl font-semibold">Your request is saved.</h2>
      <p className="mt-3 leading-relaxed text-foreground/65">We’ll email you when Mac beta invitations are available. Signing up doesn’t guarantee an invitation or a release date.</p>
      <Link href="/room/default" className="mt-6 inline-flex items-center gap-2 font-medium underline underline-offset-4">Listen in your browser <ArrowRight size={16} aria-hidden="true" /></Link>
    </div>
  );
  return (
    <form onSubmit={submit} className="mac-beta-form" aria-label="Mac beta tester signup" aria-busy={status === 'saving'}>
      <div className="grid gap-6 sm:grid-cols-2">
        <label className="block text-sm font-medium">Email <span className="text-foreground/50">(required)</span>
          <input className={fieldClass} name="email" type="email" autoComplete="email" maxLength={254} required />
        </label>
        <label className="block text-sm font-medium">Name <span className="text-foreground/50">(optional)</span>
          <input className={fieldClass} name="name" autoComplete="name" maxLength={80} />
        </label>
      </div>
      <div className="grid gap-6 sm:grid-cols-2">
        <label className="block text-sm font-medium">Mac chip <span className="text-foreground/50">(optional)</span>
          <select className={fieldClass} name="macChip" defaultValue="unsure">
            <option value="unsure">Not sure</option><option value="apple-silicon">Apple silicon (M series)</option><option value="intel">Intel</option>
          </select>
        </label>
        <label className="block text-sm font-medium">macOS version <span className="text-foreground/50">(optional)</span>
          <input className={fieldClass} name="macosVersion" maxLength={40} placeholder="For example, macOS 15" />
        </label>
      </div>
      <label className="block text-sm font-medium">What would you like to test? <span className="text-foreground/50">(optional)</span>
        <textarea className={`${fieldClass} min-h-28 resize-y`} name="testingInterest" maxLength={500} rows={3} placeholder="Tell us about the devices you listen on or the experience you want to try." />
        <span className="mt-2 block text-xs text-foreground/50">Up to 500 characters. Please leave out passwords and other sensitive information.</span>
      </label>
      <div className="hidden" aria-hidden="true">
        <label>Website<input name="website" tabIndex={-1} autoComplete="off" /></label>
      </div>
      <label className="flex items-start gap-3 text-sm leading-relaxed text-foreground/70">
        <input className="mt-1 h-4 w-4 shrink-0 accent-foreground" name="consent" type="checkbox" required />
        <span>I agree to the <Link href="/terms-of-service" className="underline underline-offset-2">Terms of Service</Link>, have read the <Link href="/privacy-policy#mac-beta" className="underline underline-offset-2">Privacy Policy</Link>, and want emails about the Mac beta. I can ask to withdraw through <Link href="/contact" className="underline underline-offset-2">Contact</Link>.</span>
      </label>
      {status === 'error' && <p role="alert" className="rounded-xl border border-foreground/15 p-4 text-sm">{error}</p>}
      <button type="submit" disabled={status === 'saving'} className="public-info-button">
        {status === 'saving' ? 'Saving your request…' : 'Join the Mac beta list'}<ArrowRight size={17} aria-hidden="true" />
      </button>
      <p className="text-xs leading-relaxed text-foreground/50">We store your request for up to 180 days to organize beta invitations. This doesn’t create a SyncBeats account or sign you up for general marketing.</p>
    </form>
  );
}
