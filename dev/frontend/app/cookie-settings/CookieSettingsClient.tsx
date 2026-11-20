"use client";

import { useState, useSyncExternalStore } from 'react';
import Link from 'next/link';
import { PublicInfoPage } from '../../components/PublicInfoPage';
import { readAnalyticsConsent, saveAnalyticsConsent, subscribeAnalyticsConsent } from '../../lib/cookiePreferences';

export default function CookieSettingsClient() {
  const savedConsent = useSyncExternalStore(subscribeAnalyticsConsent, readAnalyticsConsent, () => false);
  const [draft, setDraft] = useState<boolean | null>(null);
  const [message, setMessage] = useState('');
  const analyticsEnabled = draft ?? savedConsent;

  function save(value: boolean) {
    if (saveAnalyticsConsent(value)) {
      setDraft(null);
      setMessage('Your preferences have been saved.');
    } else {
      setMessage('Your browser blocked saving preferences. Allow site storage and try again. Your previous saved preference is still in use.');
    }
  }

  return <PublicInfoPage title="Cookie settings" eyebrow="Your choices" description="Choose whether SyncBeats can use optional analytics. You can change this choice at any time.">
    <section aria-labelledby="essential-heading">
      <div className="public-info-control-row">
        <div><h2 id="essential-heading">Essential storage</h2><p>Always active</p></div>
        <span className="public-info-badge">Required</span>
      </div>
      <p>Sign-in tokens, theme choices, and these preferences help the site work. Technical error reports and sync diagnostics are separate from optional page analytics.</p>
    </section>
    <section aria-labelledby="analytics-heading">
      <div className="public-info-control-row">
        <div><h2 id="analytics-heading">Optional analytics</h2><p>{analyticsEnabled ? 'Enabled' : 'Off by default'}</p></div>
        <button type="button" role="switch" aria-checked={analyticsEnabled} aria-labelledby="analytics-heading" className="public-info-switch" onClick={() => { setDraft(!analyticsEnabled); setMessage(''); }}><span /></button>
      </div>
      <p>Google Analytics, Ahrefs Analytics, Vercel Analytics, and Speed Insights help us understand page visits and performance on the production website. They load only after you save an enabled choice.</p>
      <p>Advertising consent stays off. Disabling analytics unloads active analytics scripts by refreshing the page when needed.</p>
    </section>
    <div className="public-info-actions">
      <button type="button" className="public-info-button" onClick={() => save(analyticsEnabled)}>Save preferences</button>
      <button type="button" className="public-info-button public-info-button--secondary" onClick={() => save(false)}>Turn off optional analytics</button>
    </div>
    <p role="status" aria-live="polite" className="public-info-feedback">{message}</p>
    <p>Read our <Link href="/privacy-policy">privacy policy</Link> for details about data processing and your rights.</p>
  </PublicInfoPage>;
}
