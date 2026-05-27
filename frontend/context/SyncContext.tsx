"use client";

import { createContext, useContext, useState, type ReactNode } from "react";
import { Participant } from "../lib/types";

interface SyncCtx {
  clockOffset: number;
  setClockOffset: (v: number) => void;
  isRoomPlaying: boolean;
  setIsRoomPlaying: (v: boolean) => void;
  playbackState: string;
  setPlaybackState: (v: string) => void;
  participants: Participant[];
  setParticipants: (v: Participant[]) => void;
}

const Ctx = createContext<SyncCtx>({
  clockOffset: 0, setClockOffset: () => {},
  isRoomPlaying: false, setIsRoomPlaying: () => {},
  playbackState: 'IDLE', setPlaybackState: () => {},
  participants: [], setParticipants: () => {},
});

export function SyncProvider({ children }: { children: ReactNode }) {
  const [clockOffset, setClockOffset] = useState(0);
  const [isRoomPlaying, setIsRoomPlaying] = useState(false);
  const [playbackState, setPlaybackState] = useState('IDLE');
  const [participants, setParticipants] = useState<Participant[]>([]);
  return (
    <Ctx.Provider value={{ clockOffset, setClockOffset, isRoomPlaying, setIsRoomPlaying, playbackState, setPlaybackState, participants, setParticipants }}>
      {children}
    </Ctx.Provider>
  );
}

export function useSyncInfo() {
  return useContext(Ctx);
}
