import React from 'react';
import Image from 'next/image';
import { Monitor, Smartphone, Laptop, Pencil, Check, X } from 'lucide-react';
import { motion } from 'framer-motion';

interface Device {
    id: string;
    name: string;
    type: string;
    status: string;
    isActive: boolean;
    latency: number;
    signal: number;
}

interface Participant {
    id: string;
    name: string;
    avatar: string;
    isHost: boolean;
    devices: Device[];
}

interface RoomParticipantsProps {
    participants: Participant[];
    latencyMs: number;
    onDeviceUpdate?: () => void;
}

import { authFetch } from '@/lib/authFetch';
import { toast } from 'react-hot-toast';
import { useState } from 'react';

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

export default function RoomParticipants({ participants, latencyMs, onDeviceUpdate }: RoomParticipantsProps) {
    const [editingDevice, setEditingDevice] = useState<{ id: string, name: string } | null>(null);
    const url = process.env.NEXT_PUBLIC_API_URL;

    const handleRenameDevice = async (deviceId: string, newName: string) => {
        try {
            const res = await authFetch(`${url}/auth/device/${deviceId}`, {
                method: "PUT",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ name: newName })
            });

            if (res.ok) {
                toast.success("Device renamed");
                setEditingDevice(null);
                if (onDeviceUpdate) onDeviceUpdate();
            } else {
                toast.error("Failed to rename device");
            }
        } catch (err) {
            console.error(err);
            toast.error("Failed to rename device");
        }
    };

    if (participants.length === 0) {
        return <div className="text-white/30 text-center py-8">No participants yet</div>;
    }

    return (
        <div className="space-y-4 h-full overflow-y-auto pr-2 custom-scrollbar">
            {participants.map((participant) => (
                <motion.div
                    layoutId={`participant-${participant.id}`}
                    key={participant.id}
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="bg-white/5 rounded-2xl p-4 border border-white/5 hover:bg-white/10 transition-colors group"
                >
                    <div className="flex items-center gap-4 mb-3">
                        <div className="relative">
                            <div className="w-12 h-12 rounded-full overflow-hidden border-2 border-white/10 group-hover:border-white/20 transition-colors">
                                <Image src={participant.avatar} alt={participant.name} width={48} height={48} className="object-cover" unoptimized />
                            </div>
                            <div className="absolute bottom-0 right-0 w-3.5 h-3.5 bg-green-500 border-2 border-[#121212] rounded-full" />
                        </div>
                        <div>
                            <p className="font-semibold text-lg text-white/90">{participant.name}</p>
                            {participant.isHost ? <p className="text-sm text-white/40">Host • Online</p> : <p className="text-sm text-white/40">Online</p>}
                        </div>
                    </div>
                    <div className="pl-6 md:pl-8 relative">
                        <div className="absolute left-6 md:left-8 top-0 bottom-4 w-px bg-white/10" />
                        {participant.devices.length > 0 ? (
                            <div className="space-y-2">
                                {participant.devices.map((device) => (
                                    <div
                                        key={device.id}
                                        className={`relative flex items-center gap-4 p-3 rounded-xl text-sm transition-all ml-4 ${device.isActive
                                            ? "bg-white/10 text-white shadow-sm border border-white/5"
                                            : "text-white/50 hover:bg-white/5 hover:text-white/80"
                                            }`}
                                    >
                                        <div className="absolute -left-4 top-1/2 w-4 h-4 rounded-bl-xl border-b-2 border-l-2 border-white/10" />
                                        <span className={device.isActive ? "text-green-400" : "opacity-60"}>
                                            {getDeviceIcon(device.type)}
                                        </span>

                                        <div className="flex-1 flex flex-col group/device">
                                            {editingDevice?.id === device.id ? (
                                                <div className="flex items-center gap-2">
                                                    <input
                                                        type="text"
                                                        value={editingDevice.name}
                                                        onChange={(e) => setEditingDevice({ ...editingDevice, name: e.target.value })}
                                                        className="bg-black/20 border border-white/10 rounded px-2 py-0.5 text-sm text-white w-full focus:outline-none focus:border-white/30"
                                                        autoFocus
                                                        onClick={(e) => e.stopPropagation()}
                                                    />
                                                    <button onClick={(e) => { e.stopPropagation(); handleRenameDevice(device.id, editingDevice.name); }} className="p-1 text-green-400 hover:bg-green-500/10 rounded"><Check size={14} /></button>
                                                    <button onClick={(e) => { e.stopPropagation(); setEditingDevice(null); }} className="p-1 text-red-400 hover:bg-red-500/10 rounded"><X size={14} /></button>
                                                </div>
                                            ) : (
                                                <div className="flex items-center gap-2">
                                                    <span className="font-medium">{device.name}</span>
                                                    <button
                                                        onClick={(e) => { e.stopPropagation(); setEditingDevice({ id: device.id, name: device.name }); }}
                                                        className="p-1 text-white/20 hover:text-white opacity-0 group-hover/device:opacity-100 transition-opacity"
                                                        title="Rename Device"
                                                    >
                                                        <Pencil size={12} />
                                                    </button>
                                                </div>
                                            )}
                                            {device.isActive && <span className="text-[10px] uppercase tracking-wider text-green-400/80 font-bold">Syncing</span>}
                                        </div>
                                        <div className="flex items-center gap-2">
                                            {device.isActive && (
                                                <div className={`flex flex-col items-end gap-0.5 px-2 py-1 rounded-lg bg-white/5 border ${getLatencyColor(latencyMs)} border-current/20`}>
                                                    <span className="text-[9px] uppercase tracking-wider opacity-60 font-bold">Latency</span>
                                                    <div className="flex items-center gap-1">
                                                        <span className="text-xs font-mono font-bold">{latencyMs}ms</span>
                                                        <div className={device.latency < 50 ? "text-green-400" : device.latency < 100 ? "text-yellow-400" : "text-red-400"}>
                                                            {getSignalIcon(device.signal)}
                                                        </div>
                                                    </div>
                                                </div>
                                            )}
                                        </div>

                                        {device.isActive && (
                                            <div className="w-2 h-2 bg-green-400 rounded-full animate-pulse shadow-[0_0_8px_rgba(74,222,128,0.5)]" />
                                        )}
                                    </div>
                                ))}
                            </div>
                        ) : (
                            <div className="ml-4 pl-4 py-2 text-sm text-white/20 italic relative">
                                <div className="absolute -left-0 top-1/2 w-4 h-px bg-white/10" />
                                No active devices
                            </div>
                        )}
                    </div>
                </motion.div>
            ))}
        </div>
    );
}
