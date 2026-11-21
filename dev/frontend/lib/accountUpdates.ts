"use client";

import { useEffect, useState } from "react";
import { io } from "socket.io-client";
import { getServerUrl } from "./api";

export type AccountUpdateKind = "all" | "library" | "profile" | "devices" | "interests";
const eventName = "syncbeats:account-updated";

export function connectAccountUpdates(token: string, onUpdate: (kind: AccountUpdateKind) => void) {
  const server = getServerUrl();
  const proxy = server === "/api";
  const socket = io(proxy ? window.location.origin : server, {
    autoConnect: false, transports: ["websocket"], withCredentials: true,
    path: proxy ? "/api/socket.io" : "/socket.io",
    reconnectionDelay: 3000, reconnectionDelayMax: 10000,
  });
  let disposed = false;
  let timer: ReturnType<typeof setTimeout> | undefined;
  const pending = new Set<AccountUpdateKind>();
  const deliver = (kind: AccountUpdateKind) => {
    if (disposed) return;
    onUpdate(kind);
    window.dispatchEvent(new CustomEvent(eventName, { detail: kind }));
  };
  const schedule = (kind: AccountUpdateKind) => {
    pending.add(kind);
    clearTimeout(timer);
    timer = setTimeout(() => {
      const kind = pending.size === 1 ? [...pending][0] : "all";
      pending.clear(); deliver(kind);
    }, 250);
  };
  socket.on("connect", () => {
    socket.emit("account:subscribe", { token }, (reply: { ok?: boolean }) => {
      if (reply?.ok) schedule("all");
    });
  });
  socket.on("account:changed", (update: { kind?: AccountUpdateKind }) => {
    if (update && ["library", "profile", "devices", "interests"].includes(update.kind ?? "")) schedule(update.kind!);
  });
  const focused = () => schedule("all");
  const recovery = setInterval(() => { if (document.visibilityState === "visible") schedule("all"); }, 30000);
  window.addEventListener("focus", focused);
  socket.connect();
  return () => {
    disposed = true; clearTimeout(timer); clearInterval(recovery);
    window.removeEventListener("focus", focused); socket.removeAllListeners(); socket.disconnect();
  };
}

export function useAccountRevision(kind: AccountUpdateKind) {
  const [revision, setRevision] = useState(0);
  useEffect(() => {
    const changed = (event: Event) => {
      const update = (event as CustomEvent<AccountUpdateKind>).detail;
      if (kind === "all" || update === "all" || update === kind) setRevision(value => value + 1);
    };
    window.addEventListener(eventName, changed);
    return () => window.removeEventListener(eventName, changed);
  }, [kind]);
  return revision;
}
