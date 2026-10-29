"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowRight, Headphones, LoaderCircle, Music2, Plus, Radio, Sparkles } from "lucide-react";
import { useAuth } from "../../../context/AuthContext";
import { roomsApi, type OnlineRoomRecord, type RoomRecord } from "../../../lib/api";
import { RoomCodeEntry } from "../../../components/landing/RoomCodeEntry";
import { AmbientField } from "../../../components/landing/AmbientField";
import { ThemeToggle } from "../../../components/ThemeToggle";
import { SyncBeatsLogo } from "../../../components/brand/SyncBeatsLogo";

export default function HubPage() {
  const router = useRouter();
  const { user, loading: authLoading } = useAuth();
  const [rooms, setRooms] = useState<RoomRecord[]>([]);
  const [onlineRooms, setOnlineRooms] = useState<OnlineRoomRecord[]>([]);
  const [loadingRooms, setLoadingRooms] = useState(true);
  const [loadingOnline, setLoadingOnline] = useState(true);
  const [onlineError, setOnlineError] = useState(false);
  const [working, setWorking] = useState<"open" | "create" | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (authLoading || !user) return;
    let current = true;
    roomsApi.mine()
      .then(({ rooms: owned }) => { if (current) setRooms(owned); })
      .catch(() => { if (current) setError("Your rooms could not load. Try again in a moment."); })
      .finally(() => { if (current) setLoadingRooms(false); });

    const loadOnlineRooms = () => {
      roomsApi.online()
        .then(({ rooms: online }) => { if (current) { setOnlineRooms(online); setOnlineError(false); } })
        .catch(() => { if (current) { setOnlineRooms([]); setOnlineError(true); } })
        .finally(() => { if (current) setLoadingOnline(false); });
    };
    loadOnlineRooms();
    const refresh = window.setInterval(loadOnlineRooms, 20_000);

    return () => { current = false; window.clearInterval(refresh); };
  }, [authLoading, user]);

  async function openDefaultRoom() {
    setWorking("open");
    setError(null);
    try {
      const { roomId } = await roomsApi.default();
      router.push(`/room/${roomId}`);
    } catch {
      setError("We could not open your room. Please try again.");
      setWorking(null);
    }
  }

  async function createRoom() {
    setWorking("create");
    setError(null);
    try {
      const { roomId } = await roomsApi.create();
      router.push(`/room/${roomId}`);
    } catch {
      setError("We could not create a room. Please try again.");
      setWorking(null);
    }
  }

  const greeting = user?.name?.trim().split(/\s+/)[0] || "there";

  return (
    <main className="relative isolate min-h-dvh overflow-hidden bg-background px-5 pb-[max(2rem,env(safe-area-inset-bottom,0px))] pt-[max(1rem,env(safe-area-inset-top,0px))] text-foreground sm:px-8 lg:px-12">
      <AmbientField />
      <header className="relative z-10 mx-auto flex h-14 w-full max-w-[1440px] items-center justify-between border-b border-foreground/[0.08]">
        <Link href="/" className="flex items-center gap-3 text-sm font-semibold tracking-tight">
          <SyncBeatsLogo markClassName="h-9 w-9" />
        </Link>
        <div className="flex items-center gap-2">
          <ThemeToggle size="sm" />
          <Link href="/profile" className="flex h-9 w-9 items-center justify-center rounded-full border border-foreground/10 bg-foreground/[0.05] text-sm font-semibold transition-colors hover:bg-foreground/10" aria-label="Open profile">
            {user?.name?.trim().charAt(0).toUpperCase() || "S"}
          </Link>
        </div>
      </header>

      <div className="relative z-10 mx-auto grid w-full max-w-[1440px] gap-12 py-10 sm:py-14 xl:min-h-[calc(100dvh-7rem)] xl:grid-cols-[minmax(0,1.08fr)_minmax(27rem,0.82fr)] xl:items-center xl:gap-20 xl:py-12">
        <section className="flex flex-col justify-center">
          <p className="micro-label mb-5 flex items-center gap-2"><Sparkles className="h-3.5 w-3.5" />Your listening space</p>
          <h1 className="max-w-[11ch] text-[clamp(3.25rem,6.6vw,6.75rem)] font-semibold leading-[0.94] tracking-[-0.055em]">Good to see you, {greeting}.</h1>
          <p className="mt-6 max-w-[42ch] text-base leading-relaxed text-foreground/60 sm:text-lg">Your room is ready when you are. Start your own, or drop into a room that’s already playing.</p>

          <div className="mt-9 grid max-w-2xl gap-3 sm:grid-cols-2">
            <button type="button" onClick={openDefaultRoom} disabled={working !== null} className="group flex min-h-16 items-center justify-between rounded-2xl bg-foreground px-5 text-left text-sm font-semibold text-background shadow-[0_12px_40px_rgba(0,0,0,0.12)] transition-transform hover:-translate-y-0.5 disabled:opacity-60 sm:px-6">
              <span className="flex items-center gap-3"><Headphones className="h-4 w-4" />{working === "open" ? "Opening room…" : "Open my room"}</span>
              {working === "open" ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-1" />}
            </button>
            <button type="button" onClick={createRoom} disabled={working !== null} className="flex min-h-16 items-center justify-between rounded-2xl border border-foreground/10 bg-background/45 px-5 text-left text-sm font-semibold backdrop-blur-sm transition-colors hover:bg-foreground/[0.07] disabled:opacity-60 sm:px-6">
              <span className="flex items-center gap-3"><Plus className="h-4 w-4" />{working === "create" ? "Creating room…" : "Create a new room"}</span>
              {working === "create" ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <ArrowRight className="h-4 w-4" />}
            </button>
          </div>

          <div className="mt-9 flex flex-col gap-3 border-t border-foreground/10 pt-5 sm:flex-row sm:items-center sm:justify-between">
            <div className="min-w-0">
              <p className="text-sm font-semibold">Have a room code?</p>
              <p className="mt-1 text-sm text-foreground/50">Join a friend’s listening room.</p>
            </div>
            <RoomCodeEntry className="w-full shrink-0 bg-background/55 sm:w-[17rem]" />
          </div>

          {error && <p role="alert" className="mt-4 rounded-xl border border-bad-500/20 bg-bad-500/10 px-4 py-3 text-sm text-bad-700 dark:text-bad-300">{error}</p>}
        </section>

        <section className="glass-panel relative flex min-h-[28rem] flex-col overflow-hidden rounded-[2rem] border-foreground/10 bg-background/55 p-5 shadow-[0_30px_100px_rgba(0,0,0,0.16)] backdrop-blur-2xl sm:min-h-[31rem] sm:rounded-[2.25rem] sm:p-7 lg:p-8" aria-label="Rooms">
          <div className="mb-5 flex items-end justify-between gap-3">
            <div>
              <p className="micro-label flex items-center gap-2"><Radio className="h-3.5 w-3.5" />Room directory</p>
              <h2 className="mt-1 text-xl font-semibold tracking-tight">Listening now</h2>
            </div>
            <span className="text-sm text-foreground/40">{onlineRooms.length} online</span>
          </div>

          {loadingOnline ? (
            <div className="flex min-h-24 items-center justify-center text-sm text-foreground/45"><LoaderCircle className="mr-2 h-4 w-4 animate-spin" />Finding open rooms</div>
          ) : onlineError ? (
            <div className="rounded-2xl border border-dashed border-foreground/10 px-4 py-5 text-center">
              <p className="text-sm font-semibold">Online rooms are unavailable right now</p>
              <p className="mt-1 text-sm leading-relaxed text-foreground/50">You can still open your room, create one, or join with a code.</p>
            </div>
          ) : onlineRooms.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-foreground/10 px-4 py-5 text-center">
              <p className="text-sm font-semibold">No public rooms are online yet</p>
              <p className="mt-1 text-sm leading-relaxed text-foreground/50">Open your room or start a new one to bring your people together.</p>
            </div>
          ) : (
            <div className="max-h-[18rem] space-y-1 overflow-y-auto">
              {onlineRooms.map((room) => {
                const isMine = rooms.some((owned) => owned.id === room.id && owned.host_id === user?.id);
                return (
                  <button key={room.id} type="button" onClick={() => router.push(`/room/${room.id}`)} className="group flex w-full items-center gap-3 rounded-2xl border border-transparent px-3 py-3 text-left transition-colors hover:border-foreground/[0.08] hover:bg-foreground/[0.035]">
                    <span className="relative flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border border-foreground/10 bg-foreground/[0.04]"><Music2 className="h-4 w-4 text-foreground/55" /><span className="absolute right-1 bottom-1 h-2 w-2 rounded-full bg-ok-500 ring-2 ring-background" /></span>
                    <span className="min-w-0 flex-1">
                      <span className="flex items-center gap-2"><span className="truncate text-sm font-semibold">Room {room.id}</span>{room.is_playing && <span className="shrink-0 text-[10px] font-semibold uppercase tracking-wide text-ok-600 dark:text-ok-400">Playing</span>}</span>
                      <span className="mt-0.5 block truncate text-xs text-foreground/45">Hosted by {isMine ? "you" : room.host_name} · {room.participant_count} {room.participant_count === 1 ? "listener" : "listeners"}</span>
                    </span>
                    <span className="shrink-0 text-xs font-semibold text-foreground/55 group-hover:text-foreground">{isMine ? "Your room" : "Join"}</span>
                    <ArrowRight className="h-4 w-4 shrink-0 text-foreground/35 transition-transform group-hover:translate-x-1" />
                  </button>
                );
              })}
            </div>
          )}

          <div className="mt-5 border-t border-foreground/[0.08] pt-4">
            <div className="mb-2 flex items-center justify-between">
              <h3 className="text-sm font-semibold">Your rooms</h3>
              <span className="text-xs text-foreground/40">{rooms.length}</span>
            </div>
            {loadingRooms ? (
              <p className="py-3 text-sm text-foreground/45"><LoaderCircle className="mr-2 inline h-4 w-4 animate-spin" />Loading your rooms</p>
            ) : rooms.length === 0 ? (
              <p className="py-2 text-sm text-foreground/45">Your room will appear here after you open it.</p>
            ) : (
              <div className="max-h-36 space-y-1 overflow-y-auto">
                {rooms.slice(0, 5).map((room) => (
                  <button key={room.id} type="button" onClick={() => router.push(`/room/${room.id}`)} className="group flex w-full items-center gap-3 rounded-xl px-3 py-2 text-left transition-colors hover:bg-foreground/[0.035]">
                    <span className="min-w-0 flex-1 truncate text-sm font-medium">Room {room.id}</span>
                    <span className="shrink-0 text-xs text-foreground/40">{room.participant_count ?? 0} listeners</span>
                    <ArrowRight className="h-3.5 w-3.5 text-foreground/35 transition-transform group-hover:translate-x-1" />
                  </button>
                ))}
              </div>
            )}
          </div>

        </section>
      </div>
    </main>
  );
}
