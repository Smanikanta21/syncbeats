"use client";

import { useEffect, useRef, useSyncExternalStore } from 'react';
import Script from 'next/script';
import { Analytics } from '@vercel/analytics/react';
import { SpeedInsights } from '@vercel/speed-insights/next';
import { analyticsAllowed, subscribeAnalyticsConsent, readAnalyticsConsent } from '../lib/cookiePreferences';

const GA_ID = 'G-9D67M1G5XC';
function getSnapshot() { return analyticsAllowed(window.location.hostname, readAnalyticsConsent()); }

export function PrivacyAnalytics() {
  const enabled = useSyncExternalStore(subscribeAnalyticsConsent, getSnapshot, () => false);
  const loaded = useRef(false);
  useEffect(() => {
    const analyticsWindow = window as Window & { gtag?: (...args: unknown[]) => void; 'ga-disable-G-9D67M1G5XC'?: boolean };
    analyticsWindow['ga-disable-G-9D67M1G5XC'] = !enabled;
    if (loaded.current && !enabled) {
      analyticsWindow.gtag?.('consent', 'update', { analytics_storage: 'denied' });
      // Reload removes handlers installed by previously allowed third-party
      // scripts; removing a Script element alone cannot unload their code.
      window.location.reload();
    }
    if (enabled) loaded.current = true;
  }, [enabled]);
  if (!enabled) return null;
  return <>
    <Script src={`https://www.googletagmanager.com/gtag/js?id=${GA_ID}`} strategy="afterInteractive" />
    <Script id="google-analytics" strategy="afterInteractive">{`
      window.dataLayer = window.dataLayer || [];
      function gtag(){window.dataLayer.push(arguments);}
      gtag('consent', 'default', {analytics_storage:'granted', ad_storage:'denied', ad_user_data:'denied', ad_personalization:'denied'});
      gtag('js', new Date());
      gtag('config', '${GA_ID}', {allow_google_signals:false, allow_ad_personalization_signals:false});
    `}</Script>
    <Script src="https://analytics.ahrefs.com/analytics.js" data-key="+9fzuLLzZbLhEJcB+CsBWA" strategy="lazyOnload" />
    <Analytics />
    <SpeedInsights />
  </>;
}
