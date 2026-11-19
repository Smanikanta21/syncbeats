"use client";

import { createContext, useContext } from 'react';
import type { RecommendationCatalog, RecommendationFeed } from '../../lib/api';

export type MusicPreferences = {
  catalog?: RecommendationCatalog;
  feed?: RecommendationFeed;
  loading: boolean;
  pending: boolean;
  error: string;
  editing: boolean;
  edit: () => void;
  close: () => void;
  reload: () => Promise<boolean>;
  mutate: (action: () => Promise<unknown>) => Promise<boolean>;
};
export const MusicPreferencesContext = createContext<MusicPreferences | null>(null);
export function useMusicPreferences() {
  const value = useContext(MusicPreferencesContext);
  if (!value) throw new Error('Music preferences need their account provider.');
  return value;
}
