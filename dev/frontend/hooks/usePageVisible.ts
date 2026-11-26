"use client";

import { useSyncExternalStore } from 'react';

function subscribe(notify: () => void) {
  document.addEventListener('visibilitychange', notify);
  return () => document.removeEventListener('visibilitychange', notify);
}
const snapshot = () => !document.hidden;
const serverSnapshot = () => true;

export function usePageVisible() {
  return useSyncExternalStore(subscribe, snapshot, serverSnapshot);
}
