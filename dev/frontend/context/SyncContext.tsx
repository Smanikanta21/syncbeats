"use client";

import { createContext, useContext, useState, type ReactNode } from "react";
import { Participant, JoinRequest } from "../lib/types";

interface SyncCtx {
  clockOffset: number;
  setClockOffset: (v: number) => void;
  isRoomPlaying: boolean;
  setIsRoomPlaying: (v: boolean) => void;
  participants: Participant[];
  setParticipants: (v: Participant[]) => void;
  pendingPlay: boolean;
  setPendingPlay: (v: boolean) => void;
  incomingTrack: { title: string, progress: number } | null;
  setIncomingTrack: (v: { title: string, progress: number } | null) => void;
  pendingRequests: JoinRequest[];
  setPendingRequests: (v: JoinRequest[]) => void;
  hostId: string | null;
  setHostId: (v: string | null) => void;
}

const Ctx = createContext<SyncCtx>({
  clockOffset: 0, setClockOffset: () => {},
  isRoomPlaying: false, setIsRoomPlaying: () => {},
  participants: [], setParticipants: () => {},
  pendingPlay: false, setPendingPlay: () => {},
  incomingTrack: null, setIncomingTrack: () => {},
  pendingRequests: [], setPendingRequests: () => {},
  hostId: null, setHostId: () => {},
});

export function SyncProvider({ children }: { children: ReactNode }) {
  const [clockOffset, setClockOffset] = useState(0);
  const [isRoomPlaying, setIsRoomPlaying] = useState(false);
  const [participants, setParticipants] = useState<Participant[]>([]);
  const [pendingPlay, setPendingPlay] = useState(false);
  const [incomingTrack, setIncomingTrack] = useState<{ title: string, progress: number } | null>(null);
  const [pendingRequests, setPendingRequests] = useState<JoinRequest[]>([]);
  const [hostId, setHostId] = useState<string | null>(null);

  return (
    <Ctx.Provider value={{
      clockOffset, setClockOffset,
      isRoomPlaying, setIsRoomPlaying,
      participants, setParticipants,
      pendingPlay, setPendingPlay,
      incomingTrack, setIncomingTrack,
      pendingRequests, setPendingRequests,
      hostId, setHostId,
    }}>
      {children}
    </Ctx.Provider>
  );
}

export function useSyncInfo() {
  return useContext(Ctx);
}
