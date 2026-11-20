"use client";

import { useContext } from 'react';
import { Heart, Minus, ArrowUpRight } from 'lucide-react';
import { recommendationApi } from '../../lib/api';
import styles from './MusicRecommendations.module.css';
import { SyncBeatsLoader } from '../SyncBeatsLoader';
import { MusicPreferencesContext, useMusicPreferences } from './MusicPreferencesContext';
import { MusicPreferencesProvider } from './MusicPreferencesProvider';

type RecommendationProps = { setupOnly: true; onSearch?: never } | { setupOnly?: false; onSearch: (query: string) => void };
export function MusicRecommendations(props: RecommendationProps) {
  const shared = useContext(MusicPreferencesContext);
  return shared ? <MusicRecommendationFeed {...props} /> : <MusicPreferencesProvider><MusicRecommendationFeed {...props} /></MusicPreferencesProvider>;
}
function MusicRecommendationFeed({ onSearch, setupOnly = false }: RecommendationProps) {
  const { feed, pending, error, reload, edit, mutate } = useMusicPreferences();
  const feedback = (artistId: string, kind: 'LIKE' | 'DISLIKE') => mutate(() => recommendationApi.event({ artistId, kind, eventId: crypto.randomUUID() }));
  return <section className={styles.panel} aria-label="Music recommendations" aria-busy={pending}>
    {error && <div role="alert" className={styles.error}>{error} <button type="button" onClick={() => void reload()}>Reload suggestions</button></div>}
    {!feed ? error ? <p>You can still search for music</p> : <SyncBeatsLoader title="Finding your music" compact /> : <>
      <div className={styles.heading}>
        <div><h2>{setupOnly ? 'Your music interests' : 'Find your next listen'}</h2><p>{setupOnly ? 'Your room uses these interests to suggest music' : 'Suggestions shaped by your music interests'}</p></div>
        <button type="button" disabled={pending} onClick={edit}>Edit interests</button>
      </div>
      {setupOnly ? <p>{feed.profile.onboardingStatus === 'SKIPPED' ? 'Starter picks are ready. Choose your interests anytime.' : 'Your interests are saved. Open your room to explore music.'}</p> : feed.sections.map(section => <div key={section.id} className={styles.section}>
        <h3>{section.title}</h3><div className={styles.grid}>{section.picks.map(pick => <article key={pick.id} className={styles.card}>
          <button type="button" className={styles.open} onClick={() => {
            if (!pick.id.startsWith('custom:')) void recommendationApi.event({ artistId: pick.id, kind: 'OPEN', eventId: crypto.randomUUID() }).catch(() => {});
            onSearch?.(pick.query);
          }}><span className={styles.initial} aria-hidden="true">{pick.name.split(' ').filter(Boolean).map(s => s[0]).slice(0, 2).join('')}</span><span><strong>{pick.name}</strong><small>{pick.reason}</small></span><ArrowUpRight size={16} aria-hidden="true" /></button>
          {!pick.id.startsWith('custom:') && <div className={styles.feedback}>
            <button type="button" disabled={pending} aria-label={"More like " + pick.name} onClick={() => void feedback(pick.id, 'LIKE')}><Heart size={15} aria-hidden="true" /> More like this</button>
            <button type="button" disabled={pending} aria-label={"Less like " + pick.name} onClick={() => void feedback(pick.id, 'DISLIKE')}><Minus size={15} aria-hidden="true" /></button>
          </div>}
        </article>)}</div>
      </div>)}
    </>}
  </section>;
}
