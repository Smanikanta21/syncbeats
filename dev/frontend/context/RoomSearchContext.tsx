"use client";

import { createContext, useCallback, useContext, useState, type ReactNode } from "react";

const RoomSearchContext = createContext<{
  queries: Record<string, string>;
  setRoomQuery: (roomId: string, query: string) => void;
}>({ queries: {}, setRoomQuery: () => {} });

export function RoomSearchProvider({ children }: { children: ReactNode }) {
  const [queries, setQueries] = useState<Record<string, string>>({});
  const setRoomQuery = useCallback((roomId: string, query: string) => {
    setQueries(previous => previous[roomId] === query ? previous : { ...previous, [roomId]: query });
  }, []);
  return <RoomSearchContext.Provider value={{ queries, setRoomQuery }}>{children}</RoomSearchContext.Provider>;
}

export function useRoomSearch(roomId: string) {
  const { queries, setRoomQuery } = useContext(RoomSearchContext);
  const setQuery = useCallback((query: string) => setRoomQuery(roomId, query), [roomId, setRoomQuery]);
  return { query: queries[roomId] || "", setQuery };
}
