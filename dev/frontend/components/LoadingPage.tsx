"use client";

import { SyncBeatsLoader } from "./SyncBeatsLoader";
import styles from "./SyncBeatsLoader.module.css";

export interface LoadingState {
  title: string;
  detail: string;
  progress?: number;
  priority?: number;
}

export function LoadingPage({ title, detail, progress }: LoadingState) {
  return (
    <main className={styles.page}>
      <SyncBeatsLoader title={title} detail={detail} progress={progress} />
    </main>
  );
}
