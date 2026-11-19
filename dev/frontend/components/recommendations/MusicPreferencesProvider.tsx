"use client";

import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import { recommendationApi, type RecommendationCatalog, type RecommendationFeed } from '../../lib/api';
import { LoadingPage } from '../LoadingPage';
import { MusicPreferencesContext, useMusicPreferences } from './MusicPreferencesContext';
import { MusicInterestsModal } from './MusicInterestsModal';
import styles from './MusicRecommendations.module.css';

/** One profile and one modal per signed-in account, shared by hub and room views. */
export function MusicPreferencesProvider({ children, enabled = true }: { children: ReactNode; enabled?: boolean }) {
  const [catalog, setCatalog] = useState<RecommendationCatalog>();
  const [feed, setFeed] = useState<RecommendationFeed>();
  const [loading, setLoading] = useState(true);
  const [pending, setPending] = useState(false);
  const [editing, setEditing] = useState(false);
  const [error, setError] = useState('');
  const generation = useRef(0);
  const mounted = useRef(false);

  const reload = useCallback(async () => {
    const active = ++generation.current;
    try {
      const [choices, result] = await Promise.all([recommendationApi.catalog(), recommendationApi.feed()]);
      if (!mounted.current || active !== generation.current) return false;
      setCatalog(choices); setFeed(result); setEditing(result.profile.onboardingStatus === 'NEW'); setError('');
      return true;
    } catch (e) {
      if (mounted.current && active === generation.current) setError(e instanceof Error ? e.message : 'Could not load your music interests.');
      return false;
    } finally { if (mounted.current && active === generation.current) setLoading(false); }
  }, []);

  useEffect(() => {
    const revision = generation;
    const active = revision.current;
    mounted.current = true;
    if (enabled) void Promise.resolve().then(() => {
      if (mounted.current && active === revision.current) void reload();
    });
    return () => { mounted.current = false; revision.current++; };
  }, [enabled, reload]);

  const mutate = async (action: () => Promise<unknown>) => {
    if (pending) return false;
    const active = generation.current;
    setPending(true); setError('');
    try {
      await action();
      if (!mounted.current || active !== generation.current) return false;
      return await reload();
    } catch (e) {
      if (mounted.current && active === generation.current) setError(e instanceof Error ? e.message : 'Please try again.');
      return false;
    } finally { if (mounted.current) setPending(false); }
  };

  return <MusicPreferencesContext.Provider value={{ catalog, feed, loading, pending, error, editing, edit: () => { setError(''); setEditing(true); }, close: () => { if (!pending) setEditing(false); }, reload, mutate }}>
    {children}
    {enabled && editing && catalog && feed && <MusicInterestsModal key={feed.profile.onboardingStatus} />}
  </MusicPreferencesContext.Provider>;
}

/** The dashboard mounts only after setup is saved/skipped; failures remain escapable. */
export function MusicOnboardingGate({ children, enabled = true }: { children: ReactNode; enabled?: boolean }) {
  const { loading, feed, error, reload } = useMusicPreferences();
  const [bypassed, setBypassed] = useState(false);
  if (!enabled || bypassed || (feed && feed.profile.onboardingStatus !== 'NEW')) return children;
  if (!error || feed) return <LoadingPage title={loading ? 'Loading your music interests' : 'Make room for your music'} detail="Preparing your music recommendations." />;
  return <div className={`${styles.panel} ${styles.welcome}`}>
      <p role="alert">{error}</p>
      <div className={styles.actions}><button type="button" onClick={() => void reload()}>Try again</button><button type="button" onClick={() => setBypassed(true)}>Continue to dashboard</button></div>
  </div>;
}
