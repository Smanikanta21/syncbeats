"use client";

import { createContext, useContext, useState, type ReactNode } from "react";

interface SyncCtx {
  clockOffset: number;
  setClockOffset: (v: number) => void;
  isRoomPlaying: boolean;
  setIsRoomPlaying: (v: boolean) => void;
}

const Ctx = createContext<SyncCtx>({ clockOffset: 0, setClockOffset: () => {}, isRoomPlaying: false, setIsRoomPlaying: () => {} });

export function SyncProvider({ children }: { children: ReactNode }) {
  const [clockOffset, setClockOffset] = useState(0);
  const [isRoomPlaying, setIsRoomPlaying] = useState(false);
  return <Ctx.Provider value={{ clockOffset, setClockOffset, isRoomPlaying, setIsRoomPlaying }}>{children}</Ctx.Provider>;
}

export function useSyncInfo() {
  return useContext(Ctx);
}
