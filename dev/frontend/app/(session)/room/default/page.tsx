"use client";

import { useEffect } from "react";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "../../../../context/AuthContext";
import { useLoadingTasks } from "../../../../context/LoadingContext";
import { roomsApi } from "../../../../lib/api";

/** Open the signed-in user's persistent room, creating it on first launch. */
export default function DefaultRoomDirector() {
  const router = useRouter();
  const { user, loading: authLoading } = useAuth();
  const [error, setError] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const { setLoadingTask } = useLoadingTasks();

  useEffect(() => {
    if (authLoading) return;
    if (!user) {
      router.replace(`/login?returnTo=${encodeURIComponent("/room/default")}`);
      return;
    }

    let active = true;
    roomsApi.default()
      .then(({ roomId }) => { if (active) router.replace(`/room/${roomId}`); })
      .catch(() => { if (active) setError(true); });
    return () => { active = false; };
  }, [router, user, authLoading, attempt]);

  useEffect(() => {
    const shouldShow = !error && (authLoading || !!user);
    setLoadingTask("default-room", shouldShow
      ? { title: authLoading ? "Restoring your session" : "Opening your room", detail: authLoading ? "Checking your sign-in before entering your listening space." : "Finding your room and loading its latest state.", priority: 6 }
      : null);
    return () => setLoadingTask("default-room", null);
  }, [authLoading, user, error, attempt, setLoadingTask]);

  if (error) {
    return (
      <main className="flex min-h-dvh flex-col items-center justify-center gap-4 bg-background px-6 text-center text-foreground">
        <p className="text-sm text-foreground/60">Your room could not be opened.</p>
        <button type="button" onClick={() => { setError(false); setAttempt(value => value + 1); }} className="rounded-full bg-foreground px-5 py-3 text-sm font-semibold text-background">Try again</button>
      </main>
    );
  }

  return null;
}
