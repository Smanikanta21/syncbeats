"use client";

import { useState } from "react";
import { Copy, QrCode, RefreshCw, ScanLine } from "lucide-react";
import { useConnection } from "../../context/ConnectionContext";

interface RoomConnectionPanelProps {
  roomId: string;
  isPrivate: boolean;
  isHost: boolean;
  onShowQR: () => void;
  onScanQR: () => void;
  onTogglePrivate: () => void;
}

export function RoomConnectionPanel({ roomId, isPrivate, isHost, onShowQR, onScanQR, onTogglePrivate }: RoomConnectionPanelProps) {
  const { isOnline, isServerReachable, isSocketConnected, checkConnection } = useConnection();
  const [copyStatus, setCopyStatus] = useState("");
  const [checking, setChecking] = useState(false);
  return <div className="p-4 space-y-6 overflow-y-auto min-h-0">
    <div>
      <p className="text-xs text-foreground/55 mb-2">Room code</p>
      <div className="flex items-center gap-2">
        <span className="text-2xl font-semibold tabular-nums tracking-wide flex-1 select-text">{roomId}</span>
        <button type="button" aria-label="Copy room code" className="rounded-xl p-3 hover:bg-foreground/5 cursor-pointer" onClick={async () => {
          try {
            await navigator.clipboard.writeText(roomId);
            setCopyStatus("Room code copied");
          } catch {
            setCopyStatus("Copy unavailable. Select the room code to copy it manually.");
          }
        }}><Copy size={17} /></button>
      </div>
      {copyStatus && <p role="status" className="text-xs text-foreground/60 mt-2">{copyStatus}</p>}
      <button type="button" onClick={onShowQR} className="mt-3 w-full flex items-center justify-center gap-2 rounded-xl border border-foreground/10 py-3 text-sm font-medium hover:bg-foreground/5 cursor-pointer"><QrCode size={17} />Show room QR code</button>
      <button type="button" onClick={onScanQR} className="mt-2 w-full flex items-center justify-center gap-2 rounded-xl border border-foreground/10 py-3 text-sm font-medium hover:bg-foreground/5 cursor-pointer"><ScanLine size={17} />Scan or enter a room code</button>
    </div>
    <div>
      <h3 className="text-sm font-semibold mb-2">Room privacy</h3>
      <p className="text-xs text-foreground/60 mb-3">{isPrivate ? "Joining this room requires approval." : "Anyone with the room code can join."}</p>
      {isHost ? <button type="button" onClick={onTogglePrivate} aria-pressed={isPrivate}
        className="rounded-xl border border-foreground/10 px-4 py-3 text-sm font-medium hover:bg-foreground/5 cursor-pointer">
        {isPrivate ? "Make room public" : "Make room private"}
      </button> : <p className="text-sm text-foreground/65">{isPrivate ? "Private room" : "Public room"}</p>}
    </div>
    <div>
      <h3 className="text-sm font-semibold mb-3">Connection status</h3>
      <dl className="space-y-3 text-sm">
        {[["Internet", isOnline], ["SyncBeats server", isServerReachable], ["Room connection", isSocketConnected]].map(([name, connected]) => <div key={String(name)} className="flex items-center justify-between gap-3">
          <dt className="text-foreground/60">{name}</dt><dd className="flex items-center gap-2"><span className={`w-1.5 h-1.5 rounded-full ${connected ? 'bg-ok-500' : 'bg-warn-500'}`} />{connected ? "Connected" : "Disconnected"}</dd>
        </div>)}
      </dl>
      <button type="button" disabled={checking} onClick={async () => { setChecking(true); try { await checkConnection(); } finally { setChecking(false); } }} className="mt-4 flex items-center gap-2 text-sm text-foreground/65 hover:text-foreground cursor-pointer disabled:cursor-wait"><RefreshCw size={15} className={checking ? "animate-spin" : ""} />{checking ? "Checking…" : "Check connection"}</button>
    </div>
  </div>;
}
