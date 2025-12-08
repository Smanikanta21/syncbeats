"use client"
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Music, UserCircle, LogOut, ArrowRight, Play, Radio, RefreshCw, Cast, Users, Wifi, Clock, Activity, Moon, Sun, Pencil, Trash2, X, Check } from 'lucide-react';
import Link from 'next/link';
import { CreateRoom, JoinRoom } from '../components/RoomModal'
import { toast } from 'react-toastify';
import { Skeleton } from "@/components/ui/skeleton"
import { authFetch, clearAuthToken } from '@/lib/authFetch'
import { motion, AnimatePresence } from 'framer-motion';
import { useTheme } from '../context/ThemeContext';

export default function DashBoard() {
    const router = useRouter();
    const { theme, toggleTheme } = useTheme();
    const [name, setName] = useState<string>('')
    type Device = {
        id: string;
        name: string;
        status: 'online' | 'offline';
        ip?: string;
        updatedAt?: string;
    };
    const [devices, setDevices] = useState<Device[]>([]);
    const [createroomModal, setCrm] = useState<boolean>(false)
    const [joinroomModal, setJoinRm] = useState<boolean>(false)
    const url = process.env.NEXT_PUBLIC_API_URL || "http://localhost:5001"
    const [loader, SetLoader] = useState<boolean>(false)
    const [recentRooms, setRecentRooms] = useState<Array<{ code: string; name: string; joinedAt: string }>>([]);

    const HandleDeviceRefresher = async () => {
        try {
            SetLoader(true)
            const refreshedDevices = await authFetch(`${url}/auth/dashboard/devices`, {
                method: "GET"
            });
            const data = await refreshedDevices.json();
            if (refreshedDevices.ok && data.devices) {
                setDevices(Array.isArray(data.devices) ? data.devices : []);
            } else {
                toast.error("Failed to refresh devices");
            }
        } catch (err) {
            console.error(err);
        } finally {
            SetLoader(false)
        }
    }


    const [editingRoom, setEditingRoom] = useState<{ code: string, name: string } | null>(null);
    const [deletingRoomCode, setDeletingRoomCode] = useState<string | null>(null);

    const handleUpdateRoom = async (code: string, newName: string) => {
        try {
            SetLoader(true);
            const res = await authFetch(`${url}/api/room/${code}`, {
                method: "PUT",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ name: newName })
            });
            if (res.ok) {
                toast.success("Room updated successfully");
                setRecentRooms(prev => prev.map(r => r.code === code ? { ...r, name: newName } : r));
                setEditingRoom(null);
            } else {
                const data = await res.json();
                toast.error(data.message || "Failed to update room");
            }
        } catch (err) {
            console.error(err);
            toast.error("Failed to update room");
        } finally {
            SetLoader(false);
        }
    };

    const handleDeleteRoom = async (code: string) => {
        try {
            SetLoader(true);
            const res = await authFetch(`${url}/api/room/${code}`, {
                method: "DELETE"
            });
            if (res.ok) {
                toast.success("Room deleted successfully");
                setRecentRooms(prev => prev.filter(r => r.code !== code));
                setDeletingRoomCode(null);
            } else {
                const data = await res.json();
                toast.error(data.message || "Failed to delete room");
            }
        } catch (err) {
            console.error(err);
            toast.error("Failed to delete room");
        } finally {
            SetLoader(false);
        }
    };

    useEffect(() => {
        // Check for token in URL (from Google Auth redirect)
        const params = new URLSearchParams(window.location.search);
        const token = params.get('token');
        const authStatus = params.get('auth');

        if (authStatus === 'success' && token) {
            console.log('[Dashboard] Google Auth successful, saving token');
            localStorage.setItem('authToken', token);
            // Clean up URL
            window.history.replaceState({}, document.title, '/dashboard');
            toast.success("Successfully logged in with Google!");
        } else if (params.get('error') === 'google_auth_failed') {
            toast.error("Google Authentication failed");
            router.push('/');
            return;
        }

        const dashboardInit = async () => {
            try {
                SetLoader(true)
                console.log(`[Dashboard] Fetching dashboard from ${url}/auth/dashboard`)
                const res = await authFetch(`${url}/auth/dashboard`, {
                    method: "GET"
                });

                console.log(`[Dashboard] Response status: ${res.status}`)
                const raw = await res.text();
                let data = null;
                try {
                    data = raw ? JSON.parse(raw) : null
                } catch (e) {
                    console.warn(e)
                }

                if (res.ok && data) {
                    console.log(`[Dashboard] Successfully authenticated as ${data.message}`)
                    setName(data.message || "");
                    setDevices(Array.isArray(data.devices) ? data.devices : []);
                    try {
                        const roomRes = await authFetch(`${url}/api/recent-rooms`, {
                            method: "GET"
                        });
                        if (roomRes.ok) {
                            const roomData = await roomRes.json();
                            setRecentRooms(Array.isArray(roomData.rooms) ? roomData.rooms : []);
                        }
                    } catch (err) {
                        console.warn("Failed to fetch recent rooms:", err);
                    }
                } else {
                    console.error(`[Dashboard] Authentication failed with status ${res.status}`)
                    router.push('/')
                }
            } catch (err) {
                console.error(`[Dashboard] Error:`, err);
            } finally {
                SetLoader(false)
            }
        };

        dashboardInit();
    }, [router, url]);

    const handleLogout = async () => {
        try {
            SetLoader(true)
            await authFetch(`${url}/auth/logout`, {
                method: 'POST'
            });

            clearAuthToken();
            toast.success('Logged out successfully!');
            router.push('/');
        } catch (err) {
            toast.error("Logout unsuccessful");
            console.log(err);
        } finally {
            SetLoader(false)
        }
    };

    const handleroomCreation = async () => {
        setCrm(!createroomModal)
    }

    useEffect(() => {
        if (createroomModal) {
            document.body.style.overflow = 'hidden';
            document.body.style.position = 'fixed';
            document.body.style.width = '100%';
        } else {
            document.body.style.overflow = '';
            document.body.style.position = '';
            document.body.style.width = '';
        }
    }, [createroomModal]);

    useEffect(() => {
        if (joinroomModal) {
            document.body.style.overflow = 'hidden';
            document.body.style.position = 'fixed';
            document.body.style.width = '100%';
        } else {
            document.body.style.overflow = '';
            document.body.style.position = '';
            document.body.style.width = '';
        }
    }, [joinroomModal]);


    function formatLastSeen(dateString?: string) {
        if (!dateString) return '-';
        const d = new Date(dateString);
        const now = new Date();
        const diffMs = now.getTime() - d.getTime();
        const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

        if (now.toDateString() === d.toDateString()) {
            return `Today at ${d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`;
        }

        const yesterday = new Date(now);
        yesterday.setDate(now.getDate() - 1);
        if (yesterday.toDateString() === d.toDateString()) {
            return `Yesterday at ${d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`;
        }

        if (diffDays < 7) {
            return `${diffDays} day${diffDays > 1 ? 's' : ''} ago`;
        }

        return d.toLocaleDateString();
    }

    const fadeInUp = {
        hidden: { opacity: 0, y: 20 },
        visible: { opacity: 1, y: 0, transition: { duration: 0.5 } }
    };

    if (loader) {
        return (
            <div className="min-h-screen bg-[var(--sb-bg)] text-[var(--sb-text-main)] font-sans selection:bg-[var(--sb-primary)] selection:text-white">
                <header className="fixed top-0 left-0 right-0 z-40 px-6 py-4 flex justify-center">
                    <div className="glass-panel rounded-full px-8 py-4 flex items-center justify-between w-full max-w-7xl">
                        <div className="flex items-center gap-3">
                            <div className="w-10 h-10 rounded-full bg-gradient-to-br from-[var(--sb-primary)] to-[var(--sb-secondary)] flex items-center justify-center shadow-[0_0_15px_rgba(var(--primary-glow),0.5)]">
                                <Wifi className="text-[var(--sb-text-muted)]" size={20} />
                            </div>
                            <span className="font-bold text-xl tracking-tight hidden md:block">Sync Beats</span>
                        </div>
                        <div className="flex items-center gap-4">
                            <Skeleton className="h-10 w-32 rounded-full bg-[var(--sb-surface-2)]" />
                            <Skeleton className="h-10 w-10 rounded-full bg-[var(--sb-surface-2)]" />
                        </div>
                    </div>
                </header>

                <main className="w-full px-6 pt-32 pb-14 max-w-7xl mx-auto flex flex-col gap-8">
                    <section className="glass-card rounded-3xl p-8 border-[var(--sb-primary)]/20 relative overflow-hidden">
                        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-6 relative z-10">
                            <div className="flex flex-col gap-3">
                                <Skeleton className="h-12 w-64 rounded-lg bg-[var(--sb-surface-2)]" />
                                <Skeleton className="h-5 w-40 rounded-lg bg-[var(--sb-surface-2)]" />
                            </div>
                            <div className="flex flex-col sm:flex-row gap-3 w-full md:w-auto">
                                <Skeleton className="h-12 w-full sm:w-40 rounded-full bg-[var(--sb-surface-2)]" />
                                <Skeleton className="h-12 w-full sm:w-40 rounded-full bg-[var(--sb-surface-2)]" />
                                <Skeleton className="h-12 w-full sm:w-40 rounded-full bg-[var(--sb-surface-2)]" />
                            </div>
                        </div>
                    </section>

                    <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
                        <div className="lg:col-span-2 glass-card rounded-3xl p-8 flex flex-col gap-6">
                            <Skeleton className="h-8 w-48 rounded-lg bg-[var(--sb-surface-2)]" />
                            <Skeleton className="h-32 w-full rounded-xl bg-[var(--sb-surface-2)]" />
                        </div>
                        <div className="glass-card rounded-3xl p-8 flex flex-col gap-6">
                            <Skeleton className="h-8 w-32 rounded-lg bg-[var(--sb-surface-2)]" />
                            <div className="space-y-4">
                                <Skeleton className="h-20 w-full rounded-xl bg-[var(--sb-surface-2)]" />
                                <Skeleton className="h-20 w-full rounded-xl bg-[var(--sb-surface-2)]" />
                            </div>
                        </div>
                    </div>
                </main>
            </div>
        );
    }

    return (
        <div className="min-h-screen bg-[var(--sb-bg)] text-[var(--sb-text-main)] font-sans selection:bg-[var(--sb-primary)] selection:text-white overflow-x-hidden">
            {/* Background Ambience */}
            <div className="fixed top-0 left-0 w-full h-full overflow-hidden pointer-events-none z-0">
                <div className="absolute top-[-10%] right-[-5%] w-[500px] h-[500px] bg-[var(--sb-primary)] opacity-[0.08] blur-[100px] rounded-full animate-pulse-glow" />
                <div className="absolute bottom-[-10%] left-[-5%] w-[600px] h-[600px] bg-[var(--sb-secondary)] opacity-[0.05] blur-[120px] rounded-full" />
            </div>

            <AnimatePresence>
                {createroomModal && (
                    <motion.div
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        className='fixed inset-0 z-50 flex justify-center items-center bg-black/80 backdrop-blur-md p-4'
                    >
                        <motion.div
                            initial={{ scale: 0.95, opacity: 0 }}
                            animate={{ scale: 1, opacity: 1 }}
                            exit={{ scale: 0.95, opacity: 0 }}
                            className='w-full max-w-2xl relative'
                        >
                            <CreateRoom onBack={() => setCrm(false)} />
                        </motion.div>
                    </motion.div>
                )}
                {joinroomModal && (
                    <motion.div
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        className='fixed inset-0 z-50 flex justify-center items-center bg-black/80 backdrop-blur-md p-4'
                    >
                        <motion.div
                            initial={{ scale: 0.95, opacity: 0 }}
                            animate={{ scale: 1, opacity: 1 }}
                            exit={{ scale: 0.95, opacity: 0 }}
                            className='w-full max-w-2xl relative'
                        >
                            <JoinRoom onBack={() => setJoinRm(false)} />
                        </motion.div>
                    </motion.div>
                )}
            </AnimatePresence>

            {/* Navbar */}
            <motion.header
                initial={{ y: -100 }}
                animate={{ y: 0 }}
                transition={{ duration: 0.5 }}
                className="fixed top-0 left-0 right-0 z-40 px-6 py-4 flex justify-center"
            >
                <div className="glass-panel rounded-full px-6 py-3 md:px-8 md:py-4 flex items-center justify-between w-full max-w-7xl transition-all duration-300">
                    <div className="flex items-center gap-3">
                        <Link href="/" className="flex items-center gap-3 group">
                            <div className="w-10 h-10 rounded-full bg-gradient-to-br from-[var(--sb-primary)] to-[var(--sb-secondary)] flex items-center justify-center shadow-[0_0_15px_rgba(var(--primary-glow),0.5)] group-hover:scale-105 transition-transform">
                                <Wifi className="text-[var(--sb-text-muted)]" size={20} />
                            </div>
                            <span className="font-bold text-xl tracking-tight hidden md:block group-hover:text-[var(--sb-primary)] transition-colors">Sync Beats</span>
                        </Link>
                    </div>

                    <div className="flex items-center gap-4">
                        <button
                            onClick={toggleTheme}
                            className="p-2 rounded-full hover:bg-[var(--sb-surface-2)] text-[var(--sb-text-muted)] hover:text-[var(--sb-text-main)] transition-colors"
                            aria-label="Toggle theme"
                        >
                            {theme === 'dark' ? <Moon size={20} /> : <Sun size={20} />}
                        </button>
                        <Link href="/profile" className="hidden md:flex items-center gap-2 px-4 py-2 rounded-full hover:bg-[var(--sb-surface-2)] transition-colors text-sm font-medium text-[var(--sb-text-muted)] hover:text-[var(--sb-text-main)]">
                            <UserCircle size={18} />
                            <span>Profile</span>
                        </Link>
                        <button
                            className="hidden md:flex items-center gap-2 px-4 py-2 rounded-full border border-red-500/30 text-red-400 hover:bg-red-500/10 hover:text-red-300 transition-colors text-sm font-medium"
                            onClick={handleLogout}
                        >
                            <LogOut size={16} /> Logout
                        </button>
                        <button className="md:hidden p-2 text-[var(--sb-text-muted)] hover:text-[var(--sb-text-main)]" onClick={handleLogout}>
                            <LogOut size={20} />
                        </button>
                    </div>
                </div>
            </motion.header>

            <main className="w-full px-6 pt-32 pb-14 max-w-7xl mx-auto flex flex-col gap-8 relative z-10">
                {/* Welcome Section */}
                <motion.section
                    initial="hidden"
                    animate="visible"
                    variants={fadeInUp}
                    className="glass-card rounded-3xl p-8 md:p-10 border-[var(--sb-primary)]/20 relative overflow-hidden group"
                >
                    {/* Decorative background elements */}
                    <div className="absolute top-0 right-0 p-12 opacity-[0.05] group-hover:opacity-[0.1] transition-opacity duration-500 scale-150 pointer-events-none">
                        <Music size={200} />
                    </div>

                    <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-8 relative z-10">
                        <div>
                            <h1 className='text-4xl md:text-5xl font-bold mb-2'>
                                Hello, <span className="text-gradient-primary">{name}</span>
                            </h1>
                            <p className="text-[var(--sb-text-muted)] text-lg">Ready to sync your vibe today?</p>
                        </div>
                        <div className="flex flex-col sm:flex-row gap-4 w-full md:w-auto">
                            <button onClick={handleroomCreation} className="btn-primary px-6 py-3.5 rounded-full font-bold shadow-lg shadow-blue-500/20 flex items-center justify-center gap-2 group/btn">
                                <Play size={18} className="fill-white/20" />
                                Start Session
                            </button>
                            <button onClick={() => setJoinRm(!joinroomModal)} className="btn-secondary px-6 py-3.5 rounded-full font-bold flex items-center justify-center gap-2 group/btn">
                                <Users size={18} />
                                Join Session
                            </button>
                            <button className="px-6 py-3.5 rounded-full border border-[var(--sb-border)] hover:border-[var(--sb-primary)]/50 hover:bg-[var(--sb-surface-2)] transition-all font-semibold flex items-center justify-center gap-2 text-[var(--sb-text-muted)] hover:text-[var(--sb-text-main)]">
                                <RefreshCw size={18} />
                            </button>
                        </div>
                    </div>
                </motion.section>

                <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
                    {/* Current Session Panel */}
                    <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1, duration: 0.5 }} className="lg:col-span-2 glass-card rounded-3xl p-8 flex flex-col gap-6">
                        <div className="flex items-center justify-between">
                            <h2 className="text-2xl font-bold flex items-center gap-3">
                                <div className="p-2 rounded-lg bg-[var(--sb-surface-2)] text-[var(--sb-success)]">
                                    <Radio size={24} />
                                </div>
                                Current Session
                            </h2>
                        </div>

                        <div className="flex-1 flex flex-col items-center justify-center py-12 text-center border-2 border-dashed border-[var(--sb-border)] rounded-2xl bg-[var(--sb-surface-1)]">
                            <div className="w-16 h-16 rounded-full bg-[var(--sb-surface-2)] flex items-center justify-center mb-4 text-[var(--sb-text-muted)]">
                                <Music size={32} />
                            </div>
                            <h3 className="text-lg font-semibold mb-2">No active session</h3>
                            <p className="text-[var(--sb-text-muted)] max-w-md mx-auto mb-6">
                                Start a new session to become the host, or join an existing one to sync up.
                            </p>
                            <div className="flex gap-3">
                                <button onClick={handleroomCreation} className="text-sm font-medium text-[var(--sb-primary)] hover:text-[var(--sb-text-main)] transition-colors">Start Host</button>
                                <span className="text-[var(--sb-border)]">|</span>
                                <button onClick={() => setJoinRm(true)} className="text-sm font-medium text-[var(--sb-text-muted)] hover:text-[var(--sb-text-main)] transition-colors">Join Code</button>
                            </div>
                        </div>

                        <div className="grid grid-cols-3 gap-4">
                            <div className="bg-[var(--sb-surface-2)] p-4 rounded-2xl border border-[var(--sb-border)]">
                                <div className="flex items-center gap-2 text-[var(--sb-text-muted)] mb-2 text-xs uppercase tracking-wider font-bold">
                                    <Clock size={14} /> Latency
                                </div>
                                <p className="text-xl font-mono font-bold text-[var(--sb-text-main)]">— ms</p>
                            </div>
                            <div className="bg-[var(--sb-surface-2)] p-4 rounded-2xl border border-[var(--sb-border)]">
                                <div className="flex items-center gap-2 text-[var(--sb-text-muted)] mb-2 text-xs uppercase tracking-wider font-bold">
                                    <Users size={14} /> Devices
                                </div>
                                <p className="text-xl font-mono font-bold text-[var(--sb-text-main)]">{devices.length}</p>
                            </div>
                            <div className="bg-[var(--sb-surface-2)] p-4 rounded-2xl border border-[var(--sb-border)]">
                                <div className="flex items-center gap-2 text-[var(--sb-text-muted)] mb-2 text-xs uppercase tracking-wider font-bold">
                                    <Activity size={14} /> Status
                                </div>
                                <p className="text-xl font-mono font-bold text-[var(--sb-text-muted)]">Idle</p>
                            </div>
                        </div>
                    </motion.div>

                    {/* Devices Panel */}
                    <motion.div
                        initial={{ opacity: 0, y: 20 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ delay: 0.2, duration: 0.5 }}
                        className="glass-card rounded-3xl p-8 flex flex-col gap-6"
                    >
                        <div className="flex items-center justify-between">
                            <h2 className="text-xl font-bold flex items-center gap-3">
                                <div className="p-2 rounded-lg bg-[var(--sb-surface-2)] text-[var(--sb-secondary)]">
                                    <Cast size={20} />
                                </div>
                                Devices
                            </h2>
                            <button
                                className="p-2 rounded-full hover:bg-[var(--sb-surface-2)] text-[var(--sb-text-muted)] hover:text-[var(--sb-text-main)] transition-colors"
                                onClick={() => HandleDeviceRefresher()}
                                title="Refresh Devices"
                            >
                                <RefreshCw size={16} />
                            </button>
                        </div>

                        <div className="flex-1 overflow-y-auto max-h-[400px] pr-2 custom-scrollbar">
                            {devices.length === 0 ? (
                                <div className="flex flex-col items-center justify-center h-40 text-center">
                                    <Cast size={32} className="text-[var(--sb-surface-3)] mb-3" />
                                    <p className="text-[var(--sb-text-muted)] text-sm">No devices found.</p>
                                </div>
                            ) : (
                                <ul className="space-y-3">
                                    {devices.map(device => (
                                        <li key={device.id} className="bg-[var(--sb-surface-1)] hover:bg-[var(--sb-surface-2)] p-4 rounded-2xl border border-[var(--sb-border)] transition-colors group">
                                            <div className="flex items-start justify-between mb-2">
                                                <div className="font-semibold text-[var(--sb-text-main)] group-hover:text-[var(--sb-primary)] transition-colors">{device.name}</div>
                                                <div className={`w-2 h-2 rounded-full ${device.status === 'online' ? 'bg-[var(--sb-success)] shadow-[0_0_8px_rgba(16,185,129,0.5)]' : 'bg-red-500'}`}></div>
                                            </div>
                                            <div className="flex items-center justify-between text-xs text-[var(--sb-text-muted)]">
                                                <span className="font-mono">{device.ip}</span>
                                                <span>{device.updatedAt ? formatLastSeen(device.updatedAt) : '-'}</span>
                                            </div>
                                        </li>
                                    ))}
                                </ul>
                            )}
                        </div>
                    </motion.div>
                </div>

                {/* Recent Activity */}
                <motion.section
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.3, duration: 0.5 }}
                    className="grid grid-cols-1 lg:grid-cols-2 gap-8"
                >
                    <div className="glass-card rounded-3xl p-8 flex flex-col gap-6">
                        <h2 className="text-xl font-bold flex items-center gap-3">
                            <div className="p-2 rounded-lg bg-[var(--sb-surface-2)] text-[var(--sb-accent)]">
                                <Clock size={20} />
                            </div>
                            Recent Rooms
                        </h2>

                        {recentRooms.length === 0 ? (
                            <div className="p-8 text-center border border-dashed border-[var(--sb-border)] rounded-2xl">
                                <p className="text-sm text-[var(--sb-text-muted)]">No recent rooms. Join or create a session to get started.</p>
                            </div>
                        ) : (
                            <ul className="space-y-3">
                                {recentRooms.slice(0, 5).map((room) => (

                                    <li key={room.code} className="bg-[var(--sb-surface-1)] hover:bg-[var(--sb-surface-2)] p-4 rounded-2xl border border-[var(--sb-border)] transition-all flex items-center justify-between group">
                                        <div className="flex-1 mr-4">
                                            {editingRoom?.code === room.code ? (
                                                <div className="flex items-center gap-2">
                                                    <input
                                                        type="text"
                                                        value={editingRoom.name}
                                                        onChange={(e) => setEditingRoom({ ...editingRoom, name: e.target.value })}
                                                        className="bg-[var(--sb-surface-3)] border border-[var(--sb-border)] rounded px-2 py-1 text-sm text-white w-full focus:outline-none focus:border-[var(--sb-primary)]"
                                                        autoFocus
                                                    />
                                                    <button onClick={() => handleUpdateRoom(room.code, editingRoom.name)} className="p-1 text-green-400 hover:bg-green-500/10 rounded"><Check size={16} /></button>
                                                    <button onClick={() => setEditingRoom(null)} className="p-1 text-red-400 hover:bg-red-500/10 rounded"><X size={16} /></button>
                                                </div>
                                            ) : (
                                                <>
                                                    <p className="font-bold text-sm text-[var(--sb-text-main)] group-hover:text-[var(--sb-accent)] transition-colors">{room.name}</p>
                                                    <p className="text-xs font-mono text-[var(--sb-text-muted)] mt-1">{room.code}</p>
                                                </>
                                            )}
                                        </div>
                                        <div className="flex items-center gap-2">
                                            {!editingRoom && (
                                                <>
                                                    <button onClick={() => setEditingRoom({ code: room.code, name: room.name })} className="p-2 text-[var(--sb-text-muted)] hover:text-[var(--sb-text-main)] hover:bg-[var(--sb-surface-3)] rounded-lg transition-colors opacity-0 group-hover:opacity-100" title="Edit Name">
                                                        <Pencil size={14} />
                                                    </button>
                                                    {deletingRoomCode === room.code ? (
                                                        <div className="flex items-center gap-2 bg-[var(--sb-surface-2)] p-2 rounded-lg border border-red-500/20 shadow-lg animate-in fade-in slide-in-from-right-4 duration-200">
                                                            <span className="text-xs text-red-400 font-bold whitespace-nowrap">Delete?</span>
                                                            <button onClick={() => handleDeleteRoom(room.code)} className="p-1 bg-red-500/10 text-red-400 hover:bg-red-500 hover:text-white rounded transition-colors"><Check size={14} /></button>
                                                            <button onClick={() => setDeletingRoomCode(null)} className="p-1 bg-[var(--sb-surface-3)] text-white hover:bg-white/10 rounded transition-colors"><X size={14} /></button>
                                                        </div>
                                                    ) : (
                                                        <>
                                                            <button onClick={() => setDeletingRoomCode(room.code)} className="p-2 text-[var(--sb-text-muted)] hover:text-red-400 hover:bg-red-500/10 rounded-lg transition-colors opacity-0 group-hover:opacity-100" title="Delete Room">
                                                                <Trash2 size={14} />
                                                            </button>
                                                            <div className="h-4 w-px bg-[var(--sb-border)] mx-1" />
                                                            <span className="text-xs text-[var(--sb-text-muted)] hidden sm:block mr-2">{formatLastSeen(room.joinedAt)}</span>
                                                            <Link href={`/dashboard/room/${room.code}`} className="p-2 rounded-full bg-[var(--sb-surface-2)] hover:bg-[var(--sb-primary)] text-[var(--sb-text-main)] hover:text-white transition-colors">
                                                                <ArrowRight size={16} />
                                                            </Link>
                                                        </>
                                                    )}
                                                </>
                                            )}
                                        </div>
                                    </li>
                                ))}
                            </ul>
                        )}
                    </div>
                </motion.section>
            </main>
        </div>
    );
}

