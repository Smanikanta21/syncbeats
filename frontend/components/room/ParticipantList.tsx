"use client";

import React from "react";
import { Laptop, Smartphone, Monitor, User, Tablet } from "lucide-react";
import { motion } from "framer-motion";

// Mock types for UI development
export interface Device {
    id: string;
    name: string;
    type: "mobile" | "desktop" | "tablet";
    isCurrent?: boolean;
}

export interface Participant {
    id: string;
    name: string;
    avatar?: string;
    devices: Device[];
    isHost?: boolean;
}

const DeviceIcon = ({ type }: { type: Device["type"] }) => {
    switch (type) {
        case "mobile":
            return <Smartphone size={14} />;
        case "desktop":
            return <Laptop size={14} />;
        case "tablet":
            return <Tablet size={14} />;
        default:
            return <Monitor size={14} />;
    }
};

export default function ParticipantList({ participants }: { participants: Participant[] }) {
    return (
        <div className="w-full max-w-md bg-white/5 backdrop-blur-lg rounded-3xl border border-white/10 p-6 text-white overflow-hidden">
            <h3 className="text-xl font-semibold mb-6 px-2">Participants</h3>

            <div className="space-y-6">
                {participants.map((participant, index) => (
                    <motion.div
                        key={participant.id}
                        initial={{ opacity: 0, y: 10 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ delay: index * 0.1 }}
                        className="group"
                    >
                        {/* Participant Header */}
                        <div className="flex items-center gap-3 mb-2 px-2">
                            <div className="w-10 h-10 rounded-full bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center shadow-md">
                                {participant.avatar ? (
                                    <img src={participant.avatar} alt={participant.name} className="w-full h-full rounded-full object-cover" />
                                ) : (
                                    <User size={20} className="text-white" />
                                )}
                            </div>
                            <div className="flex-1">
                                <div className="flex items-center gap-2">
                                    <span className="font-medium text-sm">{participant.name}</span>
                                    {participant.isHost && (
                                        <span className="text-[10px] bg-white/20 px-1.5 py-0.5 rounded-full font-medium">HOST</span>
                                    )}
                                </div>
                            </div>
                        </div>

                        {/* Devices List - Indented */}
                        <div className="ml-12 space-y-1 relative">
                            {/* Vertical line for hierarchy */}
                            <div className="absolute left-[-18px] top-0 bottom-2 w-px bg-white/10" />

                            {participant.devices.map((device) => (
                                <div
                                    key={device.id}
                                    className={`flex items-center gap-2 py-1.5 px-3 rounded-lg text-sm transition-colors ${device.isCurrent ? "bg-white/10 text-white" : "text-white/50 hover:bg-white/5 hover:text-white/80"
                                        }`}
                                >
                                    {/* Connection curve */}
                                    <div className="absolute left-[-18px] w-3 h-px bg-white/10" style={{ top: "50%" }} />

                                    <DeviceIcon type={device.type} />
                                    <span className="truncate">{device.name}</span>
                                    {device.isCurrent && (
                                        <div className="ml-auto w-1.5 h-1.5 rounded-full bg-green-400 shadow-[0_0_8px_rgba(74,222,128,0.5)]" />
                                    )}
                                </div>
                            ))}
                        </div>
                    </motion.div>
                ))}
            </div>
        </div>
    );
}
