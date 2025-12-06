"use client";

import React, { useState } from "react";
import { Play, Pause, SkipBack, SkipForward, Volume2, ListMusic } from "lucide-react";
import { motion } from "framer-motion";

export default function MediaPlayer() {
    const [isPlaying, setIsPlaying] = useState(false);
    const [volume, setVolume] = useState(50);
    const [progress, setProgress] = useState(30);

    return (
        <div className="w-full max-w-4xl mx-auto p-6 bg-white/10 backdrop-blur-xl rounded-3xl shadow-2xl border border-white/20 text-white">
            <div className="flex flex-col md:flex-row gap-8 items-center">
                {/* Album Art */}
                <motion.div
                    className="relative w-64 h-64 rounded-2xl overflow-hidden shadow-lg group"
                    whileHover={{ scale: 1.02 }}
                    transition={{ duration: 0.3 }}
                >
                    <div className="absolute inset-0 bg-gradient-to-br from-purple-500 to-blue-600 animate-pulse" />
                    <div className="absolute inset-0 flex items-center justify-center bg-black/20">
                        <ListMusic size={64} className="text-white/50" />
                    </div>
                    {/* Placeholder for actual image */}
                    {/* <img src="/album-art.jpg" alt="Album Art" className="w-full h-full object-cover" /> */}
                </motion.div>

                {/* Controls & Info */}
                <div className="flex-1 w-full flex flex-col justify-center space-y-6">

                    {/* Track Info */}
                    <div className="text-center md:text-left space-y-1">
                        <h2 className="text-3xl font-bold tracking-tight">Midnight City</h2>
                        <p className="text-lg text-white/60 font-medium">M83</p>
                    </div>

                    {/* Progress Bar */}
                    <div className="space-y-2 group">
                        <div className="relative h-1.5 bg-white/10 rounded-full overflow-hidden cursor-pointer">
                            <motion.div
                                className="absolute top-0 left-0 h-full bg-white rounded-full"
                                style={{ width: `${progress}%` }}
                                layoutId="progress"
                            />
                            <div className="absolute top-0 left-0 h-full w-full opacity-0 group-hover:opacity-100 transition-opacity duration-200">
                                <input
                                    type="range"
                                    min="0"
                                    max="100"
                                    value={progress}
                                    onChange={(e) => setProgress(Number(e.target.value))}
                                    className="w-full h-full opacity-0 cursor-pointer"
                                />
                            </div>
                        </div>
                        <div className="flex justify-between text-xs text-white/40 font-medium">
                            <span>1:24</span>
                            <span>4:03</span>
                        </div>
                    </div>

                    {/* Controls */}
                    <div className="flex items-center justify-center md:justify-start gap-8">
                        <button className="text-white/70 hover:text-white transition-colors">
                            <SkipBack size={32} fill="currentColor" />
                        </button>

                        <button
                            onClick={() => setIsPlaying(!isPlaying)}
                            className="w-16 h-16 flex items-center justify-center bg-white text-black rounded-full hover:scale-105 transition-transform shadow-lg shadow-white/10"
                        >
                            {isPlaying ? <Pause size={32} fill="currentColor" /> : <Play size={32} fill="currentColor" className="ml-1" />}
                        </button>

                        <button className="text-white/70 hover:text-white transition-colors">
                            <SkipForward size={32} fill="currentColor" />
                        </button>
                    </div>

                    {/* Volume */}
                    <div className="flex items-center gap-3 justify-center md:justify-start">
                        <Volume2 size={20} className="text-white/60" />
                        <div className="w-24 h-1 bg-white/10 rounded-full relative cursor-pointer group">
                            <motion.div
                                className="absolute top-0 left-0 h-full bg-white/60 rounded-full group-hover:bg-white transition-colors"
                                style={{ width: `${volume}%` }}
                            />
                            <input
                                type="range"
                                min="0"
                                max="100"
                                value={volume}
                                onChange={(e) => setVolume(Number(e.target.value))}
                                className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
                            />
                        </div>
                    </div>

                </div>
            </div>
        </div>
    );
}
