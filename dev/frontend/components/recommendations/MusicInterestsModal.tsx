"use client";

import { useEffect, useRef, useState, type KeyboardEvent } from 'react';
import { Check, Plus, X } from 'lucide-react';
import { recommendationApi, type MusicTaste } from '../../lib/api';
import { useMusicPreferences } from './MusicPreferencesContext';
import styles from './MusicRecommendations.module.css';

const stages = ['Languages', 'Artists', 'Listening'];
const emptyTaste = (): MusicTaste => ({ onboardingStatus: 'SKIPPED', languages: [], genres: [], favoriteArtistIds: [], customArtists: [], useActivity: false });

export function MusicInterestsModal() {
  const { catalog, feed, pending, error, mutate, close } = useMusicPreferences();
  const [draft, setDraft] = useState(feed!.profile);
  const [stage, setStage] = useState(0);
  const [filter, setFilter] = useState('');
  const [otherArtist, setOtherArtist] = useState('');
  const [inputError, setInputError] = useState('');
  const dialog = useRef<HTMLDialogElement>(null);
  const scroll = useRef<HTMLDivElement>(null);
  const isNew = feed?.profile.onboardingStatus === 'NEW';

  useEffect(() => {
    const node = dialog.current;
    const previous = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    node?.showModal();
    return () => { node?.close(); if (previous?.isConnected) previous.focus(); };
  }, []);
  const move = (index: number) => { setInputError(''); setStage(index); scroll.current?.scrollTo(0, 0); };
  const toggle = (key: 'languages' | 'genres' | 'favoriteArtistIds', value: string) => {
    setDraft(current => ({ ...current, [key]: current[key].includes(value) ? current[key].filter(v => v !== value) : [...current[key], value] }));
  };
  const addArtist = (): MusicTaste | null => {
    const name = otherArtist.trim();
    if (!name) return draft;
    if (name.length > 80 || /[\u0000-\u001f]/.test(name)) { setInputError('Use an artist name under 80 characters'); return null; }
    const listed = catalog?.artists.find(a => a.name.toLocaleLowerCase() === name.toLocaleLowerCase());
    let next = draft;
    if (listed) next = { ...draft, favoriteArtistIds: [...new Set([...draft.favoriteArtistIds, listed.id])] };
    else if (!draft.customArtists.some(a => a.toLocaleLowerCase() === name.toLocaleLowerCase())) {
      if (draft.customArtists.length >= 50) { setInputError('You can save up to 50 other favorites'); return null; }
      next = { ...draft, customArtists: [...draft.customArtists, name] };
    }
    setDraft(next); setOtherArtist(''); setInputError(''); return next;
  };
  const dismiss = () => { if (!pending) { if (isNew) void mutate(() => recommendationApi.save(emptyTaste())); else close(); } };
  const advance = () => {
    const profile = addArtist();
    if (!profile) return;
    if (stage < 2) move(stage + 1);
    else void mutate(() => recommendationApi.save({ ...profile, onboardingStatus: 'COMPLETE' }));
  };
  const trapTab = (event: KeyboardEvent<HTMLDialogElement>) => {
    if (event.key !== 'Tab') return;
    const controls = Array.from(dialog.current?.querySelectorAll<HTMLElement>('button:not(:disabled), input:not(:disabled), [tabindex="0"]') ?? []).filter(node => node.getClientRects().length > 0);
    const first = controls[0], last = controls[controls.length - 1];
    if (!first || !last) { event.preventDefault(); return; }
    if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
    else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
  };
  if (!catalog || !feed) return null;
  const artists = catalog.artists.filter(a => a.name.toLocaleLowerCase().includes(filter.trim().toLocaleLowerCase()));
  const choices = (values: string[], selected: string[], action: (value: string) => void) => <div className={styles.choices}>
    {values.map(value => <button key={value} type="button" aria-pressed={selected.includes(value)} onClick={() => action(value)}><span>{value}</span>{selected.includes(value) ? <Check size={14} aria-hidden="true" /> : <Plus size={14} aria-hidden="true" />}</button>)}
  </div>;

  return <dialog ref={dialog} className={`${styles.panel} ${styles.modal}`} aria-labelledby="music-interests-title" aria-describedby="music-interests-description" aria-busy={pending} onKeyDown={trapTab} onCancel={e => { e.preventDefault(); dismiss(); }}>
    <form onSubmit={e => { e.preventDefault(); advance(); }}>
      <header className={styles.modalHeader}>
        <div className={styles.heading}><div><h2 id="music-interests-title">Tune your music</h2><p id="music-interests-description">A few favorites help us find your next listen</p></div><button type="button" aria-label={isNew ? 'Skip music setup' : 'Close music interests'} disabled={pending} onClick={dismiss}><X size={16} aria-hidden="true" /></button></div>
        <nav className={styles.steps} aria-label="Music setup steps">{stages.map((title, index) => <button key={title} type="button" disabled={pending} aria-current={stage === index ? 'step' : undefined} onClick={() => move(index)}><span>{index + 1}</span>{title}</button>)}</nav>
      </header>
      <div className={styles.modalBody} ref={scroll}>
        <fieldset disabled={pending}>
          {stage === 0 ? <>
            <legend>What languages do you listen to?</legend><p className={styles.hint}>Select as many as you like, or continue without choosing</p>
            {choices(catalog.languages, draft.languages, value => toggle('languages', value))}
          </> : stage === 1 ? <>
            <legend>Who’s on repeat?</legend><p className={styles.hint}>All artists stay available, whatever languages you choose</p>
            <label className={styles.field}>Find an artist<input type="search" value={filter} onChange={e => setFilter(e.target.value)} placeholder="Search artists" onKeyDown={e => { if (e.key === 'Enter') e.preventDefault(); }} /></label>
            <p className={styles.count} aria-live="polite">{artists.length} artists · {draft.favoriteArtistIds.length + draft.customArtists.length} selected</p>
            <details className={styles.customArtists}><summary>Add an artist by name</summary>
              <label className={styles.field}>Add another favorite<div className={styles.addArtist}><input value={otherArtist} maxLength={80} onChange={e => setOtherArtist(e.target.value)} placeholder="Artist name" onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); addArtist(); } }} /><button type="button" disabled={!otherArtist.trim()} onClick={addArtist}>Add</button></div></label>
              {draft.customArtists.length > 0 && <div className={styles.choices}>{draft.customArtists.map(name => <button key={name} type="button" aria-label={`Remove ${name}`} onClick={() => setDraft({ ...draft, customArtists: draft.customArtists.filter(a => a !== name) })}><span>{name}</span><X size={14} aria-hidden="true" /></button>)}</div>}
            </details>
            {choices(artists.map(a => a.name), artists.filter(a => draft.favoriteArtistIds.includes(a.id)).map(a => a.name), name => { const artist = artists.find(a => a.name === name)!; toggle('favoriteArtistIds', artist.id); })}
            {!artists.length && <p className={styles.hint}>Not listed? Add this artist by name</p>}
          </> : <>
            <legend>What sounds like you?</legend><p className={styles.hint}>Genres are optional, and you can change them later</p>
            {choices(catalog.genres, draft.genres, value => toggle('genres', value))}
            <label className={styles.consent}><input type="checkbox" checked={draft.useActivity} onChange={e => setDraft({ ...draft, useActivity: e.target.checked })} /><span>Learn from my activity in SyncBeats<small>Use my own searches and listening to improve suggestions. This is off until you choose it. Likes always shape your suggestions.</small></span></label>
            {!isNew && <button type="button" onClick={() => void mutate(() => recommendationApi.reset())}>Reset interests and feedback</button>}
          </>}
        </fieldset>
      </div>
      <footer className={styles.modalFooter}>
        {(inputError || error) && <p className={styles.modalError} role="alert">{inputError || error}</p>}
        <div className={styles.actions}><button type="button" disabled={pending} onClick={dismiss}>{isNew ? 'Skip for now' : 'Cancel'}</button><span className={styles.actionSpacer} />{stage > 0 && <button type="button" disabled={pending} onClick={() => move(stage - 1)}>Back</button>}<button className={styles.primary} type="submit" disabled={pending}>{pending ? 'Saving…' : stage < 2 ? 'Continue' : 'Use my interests'}</button></div>
      </footer>
    </form>
  </dialog>;
}
