"use client";

import { createContext, useCallback, useContext, useMemo, useState } from "react";
import { LoadingPage, type LoadingState } from "../components/LoadingPage";

type LoadingTasks = Record<string, LoadingState & { priority?: number; order: number }>;
interface LoadingContextValue {
  setLoadingTask: (key: string, task: LoadingState | null) => void;
}

const LoadingContext = createContext<LoadingContextValue | null>(null);

export function LoadingProvider({ children }: { children: React.ReactNode }) {
  const [tasks, setTasks] = useState<LoadingTasks>({});
  const setLoadingTask = useCallback((key: string, task: LoadingState | null) => {
    setTasks(current => {
      if (!task) {
        if (!(key in current)) return current;
        const next = { ...current };
        delete next[key];
        return next;
      }
      const previous = current[key];
      return {
        ...current,
        [key]: { ...task, order: previous?.order ?? Date.now() },
      };
    });
  }, []);

  const active = useMemo(() => Object.values(tasks).sort((a, b) =>
    (b.priority ?? 0) - (a.priority ?? 0) || b.order - a.order
  )[0], [tasks]);

  return (
    <LoadingContext.Provider value={{ setLoadingTask }}>
      {children}
      {active && <LoadingPage title={active.title} detail={active.detail} progress={active.progress} />}
    </LoadingContext.Provider>
  );
}

export function useLoadingTasks() {
  const context = useContext(LoadingContext);
  if (!context) throw new Error("useLoadingTasks must be used within LoadingProvider");
  return context;
}
