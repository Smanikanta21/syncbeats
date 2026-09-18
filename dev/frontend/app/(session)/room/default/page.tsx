"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { roomsApi } from "../../../../lib/api";
import { GlobalLoadingScreen } from "../../../../components/GlobalLoadingScreen";
import { useAuth } from "../../../../context/AuthContext";

export default function DefaultRoomDirector() {
  const router = useRouter();
  const { user, loading: authLoading } = useAuth();
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (authLoading) return;
    if (!user) {
      router.replace("/login");
      return;
    }

    const timer = setTimeout(() => {
      console.warn('[DefaultRoomDirector] Redirection timed out');
      setError("Connection timed out. Please try refreshing.");
    }, 10000);

    roomsApi.default()
      .then(res => {
        clearTimeout(timer);
        router.replace(`/room/${res.roomId}`);
      })
      .catch(err => {
        clearTimeout(timer);
        console.error('[DefaultRoomDirector] Failed to get/create default room:', err);
        
        // Fallback: create a local room and go there if server fails
        const randomId = Math.floor(100000 + Math.random() * 900000).toString();
        router.replace(`/room/${randomId}`);
      });

    return () => clearTimeout(timer);
  }, [router, user, authLoading]);

  if (error) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background text-foreground flex-col gap-4">
        <p className="text-red-400 font-bold">{error}</p>
        <button 
          onClick={() => window.location.reload()}
          className="px-6 py-2 bg-foreground text-background font-bold rounded-xl"
        >
          Retry
        </button>
      </div>
    );
  }

  return <GlobalLoadingScreen />;
}
