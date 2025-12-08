"use client";

import React, { useState, useEffect, useRef } from "react";
import { useParams } from "next/navigation";
import { Volume2, Monitor, Smartphone, Laptop, Users, ListMusic, Copy, QrCode, UserPlus, X, Search, LogOut, Trash2, Pencil, Check } from "lucide-react";
import Image from "next/image";
import toast from "react-hot-toast";
import MusicPlayer from "@/app/components/MusicPlayer";
import { io, Socket } from "socket.io-client";
import { motion, AnimatePresence } from "framer-motion";
import { authFetch } from "@/lib/authFetch";
import RoomParticipants from "./components/RoomParticipants";
import SongQueue from "./components/SongQueue";
import FileUpload from "@/components/FileUpload";

const url = process.env.NEXT_PUBLIC_API_URL;
interface Device {
    id: string;
    name: string;
    type: string;
    status: string;
}
interface Participant {
    id: string;
    name: string;
    avatar: string;
    isHost: boolean;
    devices: (Device & { isActive: boolean; latency: number; signal: number })[];
}

interface SearchUser {
    id: string;
    name: string;
    username: string;
}

export default function RoomPlayerPage() {

    const code = useParams().code as string;
    const [participants, setParticipants] = useState<Participant[]>([]);
    const [roomName, setRoomName] = useState("");
    const [loading, setLoading] = useState(true);
    const [showQrModal, setShowQrModal] = useState(false);
    const [showInviteModal, setShowInviteModal] = useState(false);
    const [searchQuery, setSearchQuery] = useState("");
    const [searchResults, setSearchResults] = useState<SearchUser[]>([]);
    const [isSearching, setIsSearching] = useState(false);
    const [currentSongIndex, setCurrentSongIndex] = useState(0);
    const [isPlaying, setIsPlaying] = useState(false);
    const [currentTime, setCurrentTime] = useState(0);
    const [isHost, setIsHost] = useState(false);
    const socketRef = useRef<Socket | null>(null);
    const [clockOffset, setClockOffset] = useState(0);
    const syncTimeoutRef = useRef<NodeJS.Timeout | null>(null);
    const [rttMs, setRttMs] = useState<number>(0);
    const [avgRttMs, setAvgRttMs] = useState<number>(0);
    const [latencyMs, setLatencyMs] = useState<number>(0);
    const [storageUsed, setStorageUsed] = useState(0);
    const [hasStarted, setHasStarted] = useState(false);

    interface Song {
        title: string;
        artist: string;
        album: string;
        cover: string;
    }

    const [playlist, setPlaylist] = useState<Song[]>([]);

    const handleSongAdded = (song: Song) => {
        socketRef.current?.emit('playlist:add', { roomId: code, song });
    };


    const [isEditingName, setIsEditingName] = useState(false);
    const [newRoomName, setNewRoomName] = useState("");
    const [showLeaveModal, setShowLeaveModal] = useState(false);

    const handleUpdateRoomName = async () => {
        try {
            const res = await authFetch(`${url}/api/room/${code}`, {
                method: "PUT",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ name: newRoomName })
            });
            if (res.ok) {
                setRoomName(newRoomName);
                setIsEditingName(false);
                toast.success("Room name updated");
            } else {
                toast.error("Failed to update room name");
            }
        } catch (err) {
            console.error(err);
            toast.error("Failed to update room name");
        }
    };

    const handleLeaveRoom = async () => {
        try {
            const res = await authFetch(`${url}/api/room/${code}/leave`, {
                method: "POST"
            });
            if (res.ok) {
                toast.success("Left room successfully");
                window.location.href = "/dashboard";
            } else {
                toast.error("Failed to leave room");
            }
        } catch (err) {
            console.error(err);
            toast.error("Failed to leave room");
        }
    };

    const handleDeleteRoom = async () => {
        try {
            const res = await authFetch(`${url}/api/room/${code}`, {
                method: "DELETE"
            });
            if (res.ok) {
                toast.success("Room deleted successfully");
                window.location.href = "/dashboard";
            } else {
                toast.error("Failed to delete room");
            }
        } catch (err) {
            console.error(err);
            toast.error("Failed to delete room");
        }
    };

    useEffect(() => {

        const socketUrl = process.env.NEXT_PUBLIC_SOCKET_URL || 'http://localhost:5002';

        socketRef.current = io(socketUrl);
        const syncTime = async () => {
            if (!socketRef.current) return;
            const samples: number[] = [];
            const rtts: number[] = [];
            for (let i = 0; i < 5; i++) {
                const t0 = Date.now();
                socketRef.current.emit('time:request', t0, (serverTime: number) => {
                    const t2 = Date.now();
                    const rtt = t2 - t0;
                    const offset = serverTime - (t0 + rtt / 2);
                    samples.push(offset);
                    rtts.push(rtt);

                    if (samples.length === 5) {
                        samples.sort((a, b) => a - b);
                        const medianOffset = samples[2];
                        setClockOffset(medianOffset);
                        const avgRtt = rtts.reduce((a, b) => a + b, 0) / rtts.length;
                        setRttMs(rtts[rtts.length - 1]);
                        setAvgRttMs(Math.round(avgRtt));
                        setLatencyMs(Math.round(avgRtt / 2));
                    }
                });
                await new Promise(resolve => setTimeout(resolve, 50));
            }
        };

        socketRef.current.on('connect', () => {
            syncTime();
            syncTimeoutRef.current = setInterval(syncTime, 10000);

            if (code) {
                socketRef.current?.emit('join-room', code);
            }
        });

        socketRef.current.on('music:play', ({ currentTime, serverTime }) => {
            setHasStarted(true);
            if (serverTime) {
                const localStartTime = serverTime - clockOffset;
                const delay = localStartTime - Date.now();

                // scheduled play details suppressed

                if (delay > 5) {
                    setTimeout(() => {
                        setIsPlaying(true);
                        setCurrentTime(currentTime);
                    }, delay);
                } else {
                    const compensatedTime = delay < -100 ? currentTime + Math.abs(delay) / 1000 : currentTime;
                    setCurrentTime(compensatedTime);
                    setIsPlaying(true);
                }
            } else {
                setIsPlaying(true);
                setCurrentTime(currentTime);
            }
        });

        socketRef.current.on('music:pause', () => {
            setIsPlaying(false);
        });

        socketRef.current.on('music:seek', ({ currentTime, serverTime }) => {
            if (serverTime) {
                const localStartTime = serverTime - clockOffset;
                const delay = localStartTime - Date.now();

                if (delay > 5) {
                    setTimeout(() => setCurrentTime(currentTime), delay);
                } else {
                    const compensatedTime = delay < -100 ? currentTime + Math.abs(delay) / 1000 : currentTime;
                    setCurrentTime(compensatedTime);
                }
            } else {
                setCurrentTime(currentTime);
            }
        });

        socketRef.current.on('music:change', ({ songIndex, serverTime }) => {
            setHasStarted(true);
            if (serverTime) {
                const localStartTime = serverTime - clockOffset;
                const delay = localStartTime - Date.now();

                if (delay > 5) {
                    setTimeout(() => {
                        setCurrentSongIndex(songIndex);
                        setCurrentTime(0);
                        setIsPlaying(true);
                    }, delay);
                } else {
                    setCurrentSongIndex(songIndex);
                    setCurrentTime(0);
                    setIsPlaying(true);
                }
            } else {
                setCurrentSongIndex(songIndex);
                setCurrentTime(0);
                setIsPlaying(true);
            }
        });

        socketRef.current.on('music:sync', (state) => {
            if (state.isPlaying !== undefined) setIsPlaying(state.isPlaying);
            if (state.currentTime !== undefined) setCurrentTime(state.currentTime);
            if (state.currentSongIndex !== undefined) setCurrentSongIndex(state.currentSongIndex);
            if (state.playlist) setPlaylist(state.playlist);

            if (state.isPlaying || (state.currentTime && state.currentTime > 0)) {
                setHasStarted(true);
            }
        });

        socketRef.current.on('playlist:add', (song: Song) => {
            setPlaylist(prev => [...prev, song]);
        });

        socketRef.current.on('connect_error', () => {
            toast.error('Realtime connection error');
        });

        return () => {
            if (syncTimeoutRef.current) clearInterval(syncTimeoutRef.current);
            socketRef.current?.disconnect();
        };
    }, [code, clockOffset]);

    useEffect(() => {
        const fetchRoom = async () => {
            try {
                const token = localStorage.getItem('authToken');
                let currentUserId = "";
                if (token) {
                    try {
                        const payload = JSON.parse(atob(token.split('.')[1]));
                        currentUserId = payload.id;
                    } catch (e) {
                        console.error("Failed to decode token", e);
                    }
                }

                const res = await fetch(`${url}/api/room/${code}`, {
                    headers: {
                        'Authorization': `Bearer ${token}`
                    }
                });
                const data = await res.json();

                if (data.room) {
                    setRoomName(data.room.name);
                    if (data.room.hostId === currentUserId) {
                        setIsHost(true);
                    }

                    // Fetch user profile for storage usage
                    try {
                        const profileRes = await authFetch(`${url}/auth/getprofiledata`, {
                            method: "GET"
                        });
                        if (profileRes.ok) {
                            const profileData = await profileRes.json();
                            setStorageUsed(profileData.user.storageUsed || 0);
                        }
                    } catch (err) {
                        console.error("Failed to fetch profile:", err);
                    }

                    const roomDevices = data.room.connectedDevices.map((rd: { devices: { id: string } }) => rd.devices.id);

                    const mappedParticipants = data.room.participants.map((p: { user: { id: string; name: string; devices: Device[] } }) => ({
                        id: p.user.id,
                        name: p.user.name,
                        avatar: `https://ui-avatars.com/api/?name=${encodeURIComponent(p.user.name)}&background=random`,
                        isHost: p.user.id === data.room.hostId,
                        devices: p.user.devices.map((d: Device) => ({
                            id: d.id,
                            name: d.name,
                            type: d.type,
                            status: d.status,
                            isActive: roomDevices.includes(d.id),
                            latency: Math.floor(Math.random() * 150) + 10,
                            signal: Math.floor(Math.random() * 4) + 1,
                        }))
                    }));
                    setParticipants(mappedParticipants);
                }
            } catch (error) {
                console.error("Failed to fetch room:", error);
                toast.error("Failed to load room details");
            } finally {
                setLoading(false);
            }
        };

        if (code) {
            fetchRoom();
        }
    }, [code]);

    const copyToClipboard = () => {
        navigator.clipboard.writeText(code);
        toast.success("Room code copied!");
    };

    const handleSearch = async (query: string) => {
        setSearchQuery(query);
        if (query.length > 2) {
            setIsSearching(true);
            try {
                const token = localStorage.getItem('authToken');
                const res = await fetch(
                    `${url}/api/users/search?q=${encodeURIComponent(query)}&roomId=${code}`,
                    {
                        headers: {
                            'Authorization': `Bearer ${token}`
                        }
                    }
                );
                const data = await res.json();
                setSearchResults(data.users || []);
            } catch (error) {
                console.error('Search failed:', error);
                setSearchResults([]);
                toast.error('Failed to search users');
            } finally {
                setIsSearching(false);
            }
        } else {
            setSearchResults([]);
        }
    };

    const getDeviceIcon = (type: string | undefined | null) => {
        if (!type) return <Monitor size={16} />;
        switch (type.toLowerCase()) {
            case "phone":
            case "iphone":
            case "android": return <Smartphone size={16} />;
            case "laptop":
            case "mac": return <Laptop size={16} />;
            case "desktop": return <Monitor size={16} />;
            default: return <Monitor size={16} />;
        }
    };

    const getSignalIcon = (strength: number) => {
        return (
            <div className="flex items-end gap-0.5 h-3">
                {[1, 2, 3, 4].map((bar) => (
                    <div
                        key={bar}
                        className={`w-1 rounded-sm ${bar <= strength ? 'bg-current' : 'bg-white/10'}`}
                        style={{ height: `${bar * 25}%` }}
                    />
                ))}
            </div>
        );
    };

    const getLatencyColor = (ms: number) => {
        if (ms < 50) return "text-green-400";
        if (ms < 100) return "text-yellow-400";
        return "text-red-400";
    };

    const handleNext = () => {
        if (!isHost || playlist.length === 0) return;
        const nextIndex = (currentSongIndex + 1) % playlist.length;
        socketRef.current?.emit('music:change', { roomId: code, songIndex: nextIndex });
    };

    const handlePrev = () => {
        if (!isHost || playlist.length === 0) return;
        const prevIndex = (currentSongIndex - 1 + playlist.length) % playlist.length;
        socketRef.current?.emit('music:change', { roomId: code, songIndex: prevIndex });
    };

    const handlePlayPause = (playing: boolean, time: number) => {
        if (!isHost) return;
        if (playing) {
            socketRef.current?.emit('music:play', { roomId: code, currentTime: time });
        } else {
            socketRef.current?.emit('music:pause', { roomId: code });
        }
    };

    const handleSeek = (time: number) => {
        if (!isHost) return;
        socketRef.current?.emit('music:seek', { roomId: code, currentTime: time });
    };

    const currentSong = playlist[currentSongIndex];

    return (
        <div className="h-screen w-full bg-[#121212] text-white overflow-hidden relative font-sans selection:bg-pink-500/30 flex flex-col">
            <div className="fixed top-[-20%] left-[-10%] w-[50%] h-[50%] bg-purple-600/20 rounded-full blur-[120px] pointer-events-none" />
            <div className="fixed bottom-[-20%] right-[-10%] w-[50%] h-[50%] bg-blue-600/10 rounded-full blur-[120px] pointer-events-none" />

            {/* Header Section - Fixed Height */}
            <div className="relative z-10 w-full max-w-7xl mx-auto p-6 md:p-8 shrink-0">
                <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-8">
                    <div className="flex-1">
                        {isEditingName ? (
                            <div className="flex items-center gap-2 mb-1">
                                <input
                                    type="text"
                                    value={newRoomName}
                                    onChange={(e) => setNewRoomName(e.target.value)}
                                    className="text-3xl font-bold bg-white/10 border border-white/20 rounded px-2 py-1 text-white focus:outline-none focus:border-[var(--sb-primary)] w-full max-w-sm"
                                    autoFocus
                                />
                                <button onClick={handleUpdateRoomName} className="p-2 bg-green-500/20 text-green-400 rounded hover:bg-green-500/30"><Check size={24} /></button>
                                <button onClick={() => setIsEditingName(false)} className="p-2 bg-white/10 text-white rounded hover:bg-white/20"><X size={24} /></button>
                            </div>
                        ) : (
                            <div className="flex items-center gap-3 mb-1 group">
                                <h1 className="text-3xl font-bold tracking-tight">{roomName || "Loading..."}</h1>
                                {isHost && (
                                    <button onClick={() => { setNewRoomName(roomName); setIsEditingName(true); }} className="p-1.5 text-white/30 hover:text-white hover:bg-white/10 rounded-lg transition-colors opacity-0 group-hover:opacity-100">
                                        <Pencil size={18} />
                                    </button>
                                )}
                            </div>
                        )}
                        <div className="flex items-center gap-2 text-white/50 text-sm">
                            <span>Code: <span className="font-mono text-white/80">{code}</span></span>
                            <button onClick={copyToClipboard} className="hover:text-white transition-colors p-1 rounded-md hover:bg-white/10" title="Copy Code">
                                <Copy size={14} />
                            </button>
                        </div>
                    </div>
                    <div className="flex items-center gap-3">
                        <button onClick={() => setShowQrModal(true)} className="flex items-center gap-2 px-4 py-2 bg-white/5 hover:bg-white/10 border border-white/10 rounded-full text-sm font-medium transition-all"><QrCode size={16} /><span>QR Code</span></button>
                        <button onClick={() => setShowInviteModal(true)} className="flex items-center gap-2 px-4 py-2 bg-white text-black hover:bg-white/90 rounded-full text-sm font-medium transition-all shadow-lg shadow-white/5"><UserPlus size={16} /><span>Add Member</span></button>
                        <button onClick={() => setShowLeaveModal(true)} className="flex items-center gap-2 px-4 py-2 bg-red-500/10 text-red-400 hover:bg-red-500/20 border border-red-500/20 rounded-full text-sm font-medium transition-all">
                            <LogOut size={16} />
                            <span>Leave</span>
                        </button>
                    </div>
                </div>
                <div className="flex flex-col md:flex-row gap-4 mb-6">
                    <div className="flex items-center gap-2 px-3 py-1 bg-white/5 w-fit rounded-full text-sm font-medium border border-white/5">
                        <Users size={16} className="text-white/60" />
                        <span>{participants.length} Active Members</span>
                    </div>
                    <div className="flex items-center gap-4 px-4 py-2 bg-gradient-to-r from-blue-500/10 to-purple-500/10 w-fit rounded-xl text-sm font-medium border border-blue-500/20">
                        <div className="flex flex-col">
                            <span className="text-[10px] uppercase tracking-wider text-white/40 font-bold">Round Trip Time</span>
                            <span className={`text-lg font-bold font-mono ${getLatencyColor(avgRttMs)}`}>{avgRttMs}ms</span>
                        </div>
                        <div className="h-8 w-px bg-white/10" />
                        <div className="flex flex-col">
                            <span className="text-[10px] uppercase tracking-wider text-white/40 font-bold">Network Latency</span>
                            <span className={`text-lg font-bold font-mono ${getLatencyColor(latencyMs)}`}>{latencyMs}ms</span>
                        </div>
                    </div>
                </div>

                {/* Main Content Area - Fills remaining height */}
                <div className="relative z-10 w-full max-w-7xl mx-auto px-6 md:px-8 flex-1 min-h-0 flex flex-col pb-32">
                    <AnimatePresence mode="wait">
                        {!hasStarted ? (
                            <motion.div
                                key="dashboard-view"
                                initial={{ opacity: 0, x: -50 }}
                                animate={{ opacity: 1, x: 0 }}
                                exit={{ opacity: 0, x: -50 }}
                                transition={{ duration: 0.4, ease: "circOut" }}
                                className="flex-1 flex flex-col items-center justify-center"
                            >
                                <div className="w-full max-w-2xl bg-white/5 rounded-[2.5rem] p-10 border border-white/5 backdrop-blur-md shadow-2xl">
                                    <div className="text-center mb-8">
                                        <h2 className="text-4xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-purple-400 to-pink-500 mb-3">
                                            Upload Your Vibe
                                        </h2>
                                        <p className="text-white/40 text-lg">
                                            Drop a track to get the party started.
                                        </p>
                                    </div>

                                    <div className="mb-8">
                                        <FileUpload
                                            storageUsed={storageUsed}
                                            onUploadSuccess={(data) => {
                                                toast.success("Song uploaded! Waiting for host to queue it.");

                                                handleSongAdded({
                                                    title: data.url,
                                                    artist: 'Unknown Artist',
                                                    album: 'Upload',
                                                    cover: 'https://images.unsplash.com/photo-1470225620780-dba8ba36b745?w=50'
                                                });

                                                const fetchProfile = async () => {
                                                    try {
                                                        const res = await authFetch(`${url}/auth/getprofiledata`, { method: "GET" });
                                                        if (res.ok) {
                                                            const data = await res.json();
                                                            setStorageUsed(data.user.storageUsed || 0);
                                                        }
                                                    } catch (err) { console.error(err); }
                                                };
                                                fetchProfile();
                                            }}
                                        />
                                    </div>

                                    <div className="text-center">
                                        <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-white/5 border border-white/5 text-xs font-medium text-white/30 uppercase tracking-widest animate-pulse">
                                            <ListMusic size={12} /> Waiting for host
                                        </div>
                                    </div>
                                </div>
                            </motion.div>
                        ) : (
                            <motion.div
                                key="focus-view"
                                initial={{ opacity: 0, x: 50 }}
                                animate={{ opacity: 1, x: 0 }}
                                exit={{ opacity: 0, x: 50 }}
                                transition={{ duration: 0.4, ease: "circOut" }}
                                className="grid grid-cols-1 md:grid-cols-12 gap-6 h-full"
                            >
                                {/* Queue (Left Side) */}
                                <div className="md:col-span-3 h-full hidden md:block min-h-0">
                                    <SongQueue
                                        queue={playlist}
                                        currentIndex={currentSongIndex}
                                        isPlaying={isPlaying}
                                        storageUsed={storageUsed}
                                        onSongAdded={(song) => {
                                            handleSongAdded(song);
                                            // Refresh storage
                                            const fetchProfile = async () => {
                                                try {
                                                    const res = await authFetch(`${url}/auth/getprofiledata`, { method: "GET" });
                                                    if (res.ok) {
                                                        const data = await res.json();
                                                        setStorageUsed(data.user.storageUsed || 0);
                                                    }
                                                } catch (err) { console.error(err); }
                                            };
                                            fetchProfile();
                                        }}
                                        onStorageUpdate={() => { }}
                                    />
                                </div>

                                {/* Center Stage (Participants) */}
                                <div className="md:col-span-6 h-full flex flex-col min-h-0">
                                    <div className="bg-gradient-to-b from-white/5 to-white/0 p-1 rounded-[2rem] h-full border border-white/5 relative overflow-hidden group">
                                        <div className="absolute inset-0 bg-black/20 backdrop-blur-sm z-0" />
                                        <div className="relative z-10 h-full p-6 overflow-hidden flex flex-col">
                                            <div className="text-center mb-6 shrink-0">
                                                <h2 className="text-2xl font-bold text-white/90 group-hover:scale-105 transition-transform duration-500">
                                                    Live Session
                                                </h2>
                                                <div className="flex justify-center mt-2">
                                                    <div className="bg-green-500/20 text-green-400 px-3 py-1 rounded-full text-xs font-bold uppercase tracking-wider flex items-center gap-2 border border-green-500/20">
                                                        <div className="w-1.5 h-1.5 rounded-full bg-green-400 animate-pulse" /> On Air
                                                    </div>
                                                </div>
                                            </div>
                                            <div className="flex-1 min-h-0">
                                                <RoomParticipants participants={participants} latencyMs={latencyMs} />
                                            </div>
                                        </div>
                                    </div>
                                </div>

                                {/* Right Side / Mobile Queue */}
                                <div className="md:col-span-3 h-full md:hidden min-h-0">
                                    <SongQueue
                                        queue={playlist}
                                        currentIndex={currentSongIndex}
                                        isPlaying={isPlaying}
                                        storageUsed={storageUsed}
                                        onSongAdded={(song) => {
                                            handleSongAdded(song);
                                            const fetchProfile = async () => {
                                                try {
                                                    const res = await authFetch(`${url}/auth/getprofiledata`, { method: "GET" });
                                                    if (res.ok) {
                                                        const data = await res.json();
                                                        setStorageUsed(data.user.storageUsed || 0);
                                                    }
                                                } catch (err) { console.error(err); }
                                            };
                                            fetchProfile();
                                        }}
                                        onStorageUpdate={() => { }}
                                    />
                                </div>
                                <div className="md:col-span-3 h-full hidden md:block min-h-0">
                                    {/* Placeholder for Chat or Lyrics */}
                                    <div className="bg-white/5 rounded-3xl p-6 border border-white/5 h-full flex items-center justify-center text-white/20">
                                        <p>Chat / Lyrics Coming Soon</p>
                                    </div>
                                </div>
                            </motion.div>
                        )}
                    </AnimatePresence>
                </div>
            </div>

            {showQrModal && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4" onClick={() => setShowQrModal(false)}>
                    <div className="bg-[#1c1c1e] border border-white/10 rounded-3xl p-8 max-w-sm w-full text-center shadow-2xl transform scale-100 transition-all" onClick={e => e.stopPropagation()}>
                        <div className="flex justify-between items-center mb-6">
                            <h3 className="text-xl font-bold">Room QR Code</h3>
                            <button onClick={() => setShowQrModal(false)} className="text-white/50 hover:text-white"><X size={24} /></button>
                        </div>
                        <div className="bg-white p-4 rounded-xl inline-block mb-6">
                            <Image src={`https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=${encodeURIComponent(window.location.href)}`} alt="Room QR Code" width={192} height={192} className="w-48 h-48" unoptimized />
                        </div>
                        <p className="text-white/50 text-sm mb-6">Scan to join <span className="text-white font-medium">{roomName}</span></p>
                        <button onClick={copyToClipboard} className="w-full flex items-center justify-center gap-2 py-3 bg-white/10 hover:bg-white/20 rounded-xl font-medium transition-colors"><Copy size={18} />Copy Link</button>
                    </div>
                </div>
            )}
            {showInviteModal && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4" onClick={() => setShowInviteModal(false)}>
                    <div className="bg-[#1c1c1e] border border-white/10 rounded-3xl p-6 max-w-md w-full shadow-2xl" onClick={e => e.stopPropagation()}>
                        <div className="flex justify-between items-center mb-6">
                            <h3 className="text-xl font-bold">Add Member</h3>
                            <button onClick={() => setShowInviteModal(false)} className="text-white/50 hover:text-white">
                                <X size={24} />
                            </button>
                        </div>

                        <div className="relative mb-6">
                            <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-white/40" size={20} />
                            <input type="text" placeholder="Search by username..." value={searchQuery} onChange={(e) => handleSearch(e.target.value)} className="w-full bg-white/5 border border-white/10 rounded-xl py-3 pl-12 pr-4 text-white placeholder:text-white/30 focus:outline-none focus:border-white/30 transition-colors" autoFocus />
                        </div>

                        <div className="space-y-2 max-h-60 overflow-y-auto">
                            {isSearching ? (
                                <div className="text-center py-8 text-white/30">Searching...</div>
                            ) : searchResults.length > 0 ? (
                                searchResults.map(user => (
                                    <div key={user.id} className="flex items-center justify-between p-3 hover:bg-white/5 rounded-xl transition-colors">
                                        <div className="flex items-center gap-3">
                                            <div className="w-10 h-10 rounded-full bg-gradient-to-br from-purple-500 to-blue-500 flex items-center justify-center text-sm font-bold">
                                                {user.name.charAt(0)}
                                            </div>
                                            <div>
                                                <p className="font-medium">{user.name}</p>
                                                <p className="text-xs text-white/40">@{user.username}</p>
                                            </div>
                                        </div>
                                        <button className="px-3 py-1.5 bg-white text-black text-xs font-bold rounded-full hover:bg-white/90 transition-colors">
                                            Invite
                                        </button>
                                    </div>
                                ))
                            ) : searchQuery.length > 2 ? (
                                <div className="text-center py-8 text-white/30">No users found</div>
                            ) : (
                                <div className="text-center py-8 text-white/30">Type to search users</div>
                            )}
                        </div>
                    </div>
                </div>
            )}

            {showLeaveModal && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4" onClick={() => setShowLeaveModal(false)}>
                    <div className="bg-[#1c1c1e] border border-white/10 rounded-3xl p-8 max-w-sm w-full text-center shadow-2xl" onClick={e => e.stopPropagation()}>
                        <div className="w-16 h-16 rounded-full bg-red-500/10 flex items-center justify-center mb-6 mx-auto text-red-500">
                            <LogOut size={32} />
                        </div>
                        <h3 className="text-2xl font-bold mb-2">Leave Room?</h3>
                        <p className="text-white/50 mb-8">
                            Are you sure you want to leave <span className="text-white font-medium">{roomName}</span>?
                        </p>

                        <div className="flex flex-col gap-3">
                            {isHost && (
                                <button onClick={handleDeleteRoom} className="w-full py-3 bg-red-500 hover:bg-red-600 rounded-xl font-bold text-white transition-colors flex items-center justify-center gap-2">
                                    <Trash2 size={18} /> Delete Room
                                </button>
                            )}
                            <button onClick={handleLeaveRoom} className="w-full py-3 bg-white/10 hover:bg-white/20 rounded-xl font-bold text-white transition-colors">
                                Just Leave
                            </button>
                            <button onClick={() => setShowLeaveModal(false)} className="w-full py-3 text-white/50 hover:text-white transition-colors">
                                Cancel
                            </button>
                        </div>
                    </div>
                </div>
            )}

            <div className="fixed bottom-0 left-0 right-0 p-4 md:p-6 z-50 bg-gradient-to-t from-[#121212] via-[#121212]/90 to-transparent">
                <div className="max-w-4xl mx-auto w-full">
                    <MusicPlayer
                        src={currentSong?.title || undefined}
                        title={currentSong ? decodeURIComponent(currentSong.title.split('/').pop() || "").replace('.mp3', '') : "No Song Selected"}
                        artist={currentSong?.artist || "Unknown Artist"}
                        cover={currentSong?.cover || "https://images.unsplash.com/photo-1470225620780-dba8ba36b745?w=50"}
                        latency={latencyMs}
                        onNext={handleNext}
                        onPrev={handlePrev}
                        isHost={isHost}
                        isPlaying={isPlaying}
                        currentTime={currentTime}
                        onPlayPause={handlePlayPause}
                        onSeek={handleSeek}
                    />
                </div>
            </div>

        </div>
    );
}
