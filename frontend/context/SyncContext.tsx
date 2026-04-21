"use client";

import { createContext, useContext, useState, type ReactNode } from "react";

interface SyncCtx {
  clockOffset: number;
  setClockOffset: (v: number) => void;
}

const Ctx = createContext<SyncCtx>({ clockOffset: 0, setClockOffset: () => {} });

export function SyncProvider({ children }: { children: ReactNode }) {
  const [clockOffset, setClockOffset] = useState(0);
  return <Ctx.Provider value={{ clockOffset, setClockOffset }}>{children}</Ctx.Provider>;
}

export function useSyncInfo() {
  return useContext(Ctx);
}
