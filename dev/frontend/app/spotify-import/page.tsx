"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

export default function SpotifyImportPage() {
  const router = useRouter();

  useEffect(() => {
    router.replace("/profile?tab=spotify");
  }, [router]);

  return (
    <div className="flex items-center justify-center min-h-screen bg-[#0e0e14]">
      <p className="text-white font-bold animate-pulse">Redirecting to Profile...</p>
    </div>
  );
}
