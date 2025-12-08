"use client";
import React, { useState, useRef, useEffect } from 'react';
import { Play, Pause, SkipBack, SkipForward, Volume2, ChevronDown } from 'lucide-react';

interface MusicPlayerProps {
    latency?: number;
    src?: string;
    title?: string;
    artist?: string;
    cover?: string;
    onNext?: () => void;
    onPrev?: () => void;
    isHost?: boolean;
    isPlaying?: boolean;
    currentTime?: number;
    onPlayPause?: (playing: boolean, time: number) => void;
    onSeek?: (time: number) => void;
}

export default function MusicPlayer({
    latency = 0,
    src,
    title = "No Song Playing",
    artist = "Waiting for host...",
    cover,
    onNext,
    onPrev,
    isHost = false,
    isPlaying: propIsPlaying = false,
    currentTime: propCurrentTime = 0,
    onPlayPause,
    onSeek
}: MusicPlayerProps) {
    const audioRef = useRef<HTMLAudioElement>(null);
    const [localIsPlaying, setLocalIsPlaying] = useState(false);
    const [progress, setProgress] = useState(0);
    const [localCurrentTime, setLocalCurrentTime] = useState(0);
    const [duration, setDuration] = useState(0);
    const [volume, setVolume] = useState(1);
    const [isDragging, setIsDragging] = useState(false);
    const [isExpanded, setIsExpanded] = useState(false);
    const [isVolumeDragging, setIsVolumeDragging] = useState(false);
    const [audioUnlocked, setAudioUnlocked] = useState(false);

    useEffect(() => {
        const unlockAudio = () => {
            if (!audioUnlocked && audioRef.current) {
                audioRef.current.muted = true;
                audioRef.current.play().then(() => {
                    audioRef.current!.pause();
                    audioRef.current!.currentTime = 0;
                    audioRef.current!.muted = false;
                    setAudioUnlocked(true);
                    console.log('Audio unlocked via user interaction');
                }).catch(() => {
                    console.log('Audio unlock failed - user interaction required');
                });
            }
        };

        document.addEventListener('click', unlockAudio, { once: true });
        document.addEventListener('touchstart', unlockAudio, { once: true });

        return () => {
            document.removeEventListener('click', unlockAudio);
            document.removeEventListener('touchstart', unlockAudio);
        };
    }, [audioUnlocked]);

    useEffect(() => {
        if (propIsPlaying !== localIsPlaying) {
            setLocalIsPlaying(propIsPlaying);
            if (audioRef.current) {
                if (propIsPlaying) {
                    if (!audioUnlocked) {
                        audioRef.current.muted = true;
                        audioRef.current.play().then(() => {
                            audioRef.current!.pause();
                            audioRef.current!.currentTime = 0;
                            audioRef.current!.muted = false;
                            setAudioUnlocked(true);
                            audioRef.current!.play().catch(e => {
                                if (e.name === 'NotAllowedError') {
                                    console.warn('Autoplay blocked - click anywhere to enable audio');
                                } else {
                                    console.error("Play error:", e);
                                }
                            });
                        }).catch(() => {
                            console.warn('Audio unlock failed - user interaction required');
                        });
                    } else {
                        audioRef.current.play().catch(e => {
                            if (e.name === 'NotAllowedError') {
                                console.warn('Autoplay blocked - click anywhere to enable audio');
                            } else {
                                console.error("Play error:", e);
                            }
                        });
                    }
                } else {
                    audioRef.current.pause();
                }
            }
        }
    }, [propIsPlaying, localIsPlaying, audioUnlocked]);

    useEffect(() => {
        if (audioRef.current && Math.abs(audioRef.current.currentTime - propCurrentTime) > 0.5 && !isDragging) {
            audioRef.current.currentTime = propCurrentTime;
            setLocalCurrentTime(propCurrentTime);
        }
    }, [propCurrentTime, isDragging]);

    useEffect(() => {
        if (src && audioRef.current) {
            audioRef.current.load();
            if (audioRef.current.readyState >= 1) {
                setDuration(audioRef.current.duration);
            }
        }
    }, [src]);

    useEffect(() => {
        if (audioRef.current) {
            audioRef.current.volume = volume;
        }
    }, [volume]);

    const togglePlay = () => {
        if (!src) return;

        if (isHost) {
            const newPlayingState = !localIsPlaying;
            onPlayPause?.(newPlayingState, audioRef.current?.currentTime || 0);
        } else {
            console.log("Only host can toggle playback");
        }
    };

    const handleTimeUpdate = () => {
        if (!audioRef.current || isDragging || audioRef.current.seeking) return;
        const current = audioRef.current.currentTime;
        const dur = audioRef.current.duration;
        setLocalCurrentTime(current);
        if (dur) {
            setProgress((current / dur) * 100);
        }
    };

    const handleLoadedMetadata = () => {
        if (!audioRef.current) return;
        setDuration(audioRef.current.duration);
    };

    const handleEnded = () => {
        if (isHost && onNext) {
            onNext();
        }
    };

    const handleSeek = (e: React.ChangeEvent<HTMLInputElement>) => {
        if (!isHost) return; 
        const newProgress = parseFloat(e.target.value);
        setProgress(newProgress);

        if (duration) {
            const newTime = (newProgress / 100) * duration;
            setLocalCurrentTime(newTime);
        }
    };

    const handleSeekEnd = () => {
        if (!isHost) return;
        if (audioRef.current && duration) {
            const newTime = (progress / 100) * duration;
            audioRef.current.currentTime = newTime;
            onSeek?.(newTime);
        }
        setIsDragging(false);
    };

    const handleVolumeChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        if (!audioRef.current) return;
        const newVolume = parseFloat(e.target.value);
        audioRef.current.volume = newVolume;
        setVolume(newVolume);
    };

    const formatTime = (time: number) => {
        if (isNaN(time)) return "0:00";
        const minutes = Math.floor(time / 60);
        const seconds = Math.floor(time % 60);
        return `${minutes}:${seconds.toString().padStart(2, '0')}`;
    };

    return (
        <>
            <div className={`fixed inset-0 z-[60] backdrop-blur-md flex flex-col p-6 transition-transform duration-300 ease-out md:hidden ${isExpanded ? 'translate-y-0' : 'translate-y-[100vh]'}`}>
                <div className="flex justify-center mb-8">
                    <button onClick={() => setIsExpanded(false)} className="p-2 text-white/50 hover:text-white">
                        <ChevronDown size={32} />
                    </button>
                </div>

                <div className="flex-1 flex flex-col items-center justify-center gap-8">
                    <div className={`relative w-64 h-64 overflow-hidden shadow-2xl border-2 rounded-full border-white/10 ${localIsPlaying ? 'animate-[spin_20s_linear_infinite]' : ''}`}>
                        {cover ? (<img src={cover} alt={title} className="w-full h-full object-cover" />) : (<div className="w-full h-full bg-gradient-to-br from-[var(--sb-primary)] to-[var(--sb-secondary)] flex items-center justify-center"><span className="text-4xl">🎵</span></div>)}
                        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-8 h-8 bg-[#1C1C1E] rounded-full border border-white/10" />
                    </div>

                    <div className="text-center w-full">
                        <h2 className="text-2xl font-bold text-white mb-2 truncate">{title}</h2>
                        <p className="text-lg text-white/50 truncate">{artist}</p>
                    </div>
                    <div className="w-full px-2">
                        <div className="relative w-full h-10 flex items-center group/expanded-progress touch-none">
                            <input type="range" min="0" max="100" step="0.1" value={progress || 0} onChange={handleSeek} onMouseDown={(e) => { e.stopPropagation(); if (isHost) setIsDragging(true); }} onTouchStart={(e) => { e.stopPropagation(); if (isHost) setIsDragging(true); }} onMouseUp={handleSeekEnd} onTouchEnd={handleSeekEnd} disabled={!isHost} className={`absolute inset-0 w-full h-full opacity-0 z-[100] pointer-events-auto ${isHost ? 'cursor-pointer' : 'cursor-default'}`}/>
                            <div className="absolute left-0 right-0 top-1/2 -translate-y-1/2 h-2 bg-white/10 rounded-full pointer-events-none" />
                            <div className="absolute left-0 top-1/2 -translate-y-1/2 h-2 bg-[var(--sb-primary)] rounded-full pointer-events-none" style={{ width: `${progress}%` }}/>
                            <div className="absolute top-1/2 h-4 w-6 bg-white rounded-full shadow-lg pointer-events-none z-10" style={{ left: `${progress}%`, transform: 'translate(-50%, -50%)' }}/>
                        </div>
                        <div className="flex justify-between text-xs font-mono text-white/40 mt-2">
                            <span>{formatTime(localCurrentTime)}</span>
                            <span>{formatTime(duration)}</span>
                        </div>
                    </div>

                    <div className="flex items-center justify-center gap-8 w-full">
                        <button className={`p-4 text-white hover:scale-110 transition-transform ${!isHost && 'opacity-50 cursor-not-allowed'}`} onClick={(e) => { e.stopPropagation(); if (isHost) onPrev?.(); }}>
                            <SkipBack size={32} fill="currentColor" />
                        </button>
                        <button className={`w-20 h-20 rounded-full text-white flex items-center justify-center ${localIsPlaying ? 'shadow-[0_8px_32px_rgba(59,130,246,0.5)]' : ''} hover:scale-105 active:scale-95 transition-all ${!isHost && 'opacity-50 cursor-not-allowed'}`} onClick={(e) => { e.stopPropagation(); togglePlay(); }}>
                            {localIsPlaying ? <Pause size={40} fill="currentColor" /> : <Play size={40} fill="currentColor" />}
                        </button>
                        <button className={`p-4 text-white hover:scale-110 transition-transform ${!isHost && 'opacity-50 cursor-not-allowed'}`} onClick={(e) => { e.stopPropagation(); if (isHost) onNext?.(); }}>
                            <SkipForward size={32} fill="currentColor" />
                        </button>
                    </div>
                </div>
            </div>

            <div className="bg-transparent backdrop-blur-2xl md:p-6 md:pb-8 p-2 pr-6 rounded-[2.5rem] flex flex-row gap-2 md:gap-6 items-center relative shadow-[0_8px_32px_rgba(0,0,0,0.4)] border border-white/5 w-full group cursor-pointer md:cursor-default" onClick={() => setIsExpanded(true)}>
                <div className={`relative w-12 h-12 md:w-16 md:h-16 rounded-full overflow-hidden shadow-lg flex-shrink-0 border-2 border-[#2C2C2E] ${localIsPlaying ? 'animate-[spin_10s_linear_infinite]' : ''}`}>
                    {cover ? (<img src={cover} alt={title} className="w-full h-full object-cover" />) : (
                        <div className="w-full h-full bg-gradient-to-br from-[var(--sb-primary)] to-[var(--sb-secondary)] flex items-center justify-center">
                            <span className="text-xl">🎵</span>
                        </div>
                    )}
                    <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-3 h-3 bg-[#1C1C1E] rounded-full border border-[#2C2C2E]" />
                </div>
                <div className="flex-1 flex flex-col items-center md:items-start min-w-0 text-center md:text-left gap-0.5">
                    <h3 className="text-base md:text-lg font-bold text-white truncate w-full max-w-[200px] md:max-w-xs">{title}</h3>
                    <p className="text-xs md:text-sm text-white/50 truncate font-medium">{artist}</p>
                </div>
                <div className="flex items-center md:gap-6">
                    <button className={`md:hidden p-2 md:text-white/50 hover:text-white transition-colors active:scale-95 ${!isHost && 'opacity-50 cursor-not-allowed'}`} onClick={(e) => { e.stopPropagation(); if (isHost) onPrev?.(); }}><SkipBack size={18} fill="currentColor" /></button>
                    <button className={`hidden md:flex w-12 h-12 rounded-full text-white items-center justify-center hover:scale-105 transition-all duration-300 ${!isHost && 'opacity-50 cursor-not-allowed'}`} onClick={(e) => { e.stopPropagation(); if (isHost) onPrev?.(); }}><SkipBack size={18} fill="currentColor" /></button>
                    <button className={`w-12 md:hidden h-12 rounded-full text-white flex items-center justify-center hover:scale-105 transition-all duration-300 ${!isHost && 'opacity-50 cursor-not-allowed'}`} onClick={(e) => { e.stopPropagation(); togglePlay(); }}>{localIsPlaying ? <Pause size={18} fill="" /> : <Play size={18} fill="currentColor" className="ml-1" />}</button>
                    <button className={`hidden md:flex w-12 h-12 rounded-full bg-[var(--sb-primary)] text-white items-center justify-center shadow-[0_4px_16px_rgba(59,130,246,0.3)] hover:shadow-[0_6px_20px_rgba(59,130,246,0.4)] hover:scale-105 active:scale-95 transition-all duration-300 ${!isHost && 'opacity-50 cursor-not-allowed'}`} onClick={(e) => { e.stopPropagation(); togglePlay(); }}>{localIsPlaying ? <Pause size={24} fill="currentColor" /> : <Play size={24} fill="currentColor" className="ml-1" />}</button>
                    <button className={`md:hidden p-2 md:text-white/50 hover:text-white transition-colors active:scale-95 ${!isHost && 'opacity-50 cursor-not-allowed'}`} onClick={(e) => { e.stopPropagation(); if (isHost) onNext?.(); }}><SkipForward size={18} fill="currentColor" /></button>
                    <button className={`hidden md:flex w-12 h-12 rounded-full text-white items-center justify-center hover:scale-105 transition-all duration-300 ${!isHost && 'opacity-50 cursor-not-allowed'}`} onClick={(e) => { e.stopPropagation(); if (isHost) onNext?.(); }}><SkipForward size={18} fill="currentColor" /></button>
                </div>
                <div className="hidden md:flex items-center gap-6 pl-4 border-l border-white/5">
                    <div className="text-xs font-mono text-white/40 min-w-[80px] text-center">
                        {formatTime(localCurrentTime)} / {formatTime(duration)}
                    </div>

                    <div className="flex items-center gap-2 group/vol w-32 relative">
                        <Volume2 size={16} className="text-white/40 group-hover/vol:text-white transition-colors" />

                        <div className="relative flex-1 h-6 flex items-center">
                            <input type="range" min="0" max="1" step="0.01" value={volume} onChange={handleVolumeChange} onMouseDown={() => setIsVolumeDragging(true)} onMouseUp={() => setIsVolumeDragging(false)} onTouchStart={() => setIsVolumeDragging(true)} onTouchEnd={() => setIsVolumeDragging(false)} className="absolute inset-0 w-full h-full opacity-0 cursor-pointer z-20"/>
                            <div className="absolute left-0 right-0 h-1 bg-white/10 rounded-full overflow-hidden">
                                <div className="h-full bg-[var(--sb-primary)]" style={{ width: `${volume * 100}%` }} />
                            </div>
                            <div className={`absolute h-5 px-2 ${isVolumeDragging ? 'bg-white text-black' : 'bg-[var(--sb-primary)] text-white'} rounded-full flex items-center justify-center text-[10px] font-bold shadow-lg pointer-events-none transition-transform duration-100 z-10`} style={{left: `${volume * 100}%`,transform: `translateX(-50%) scale(${volume > 0 ? 1 : 0})`}}>
                                {Math.round(volume * 100)}%
                            </div>
                        </div>
                    </div>
                </div>
                <div className="hidden absolute bottom-0 left-0 right-0 h-10 group/progress touch-none md:flex items-center px-6 z-30">
                    <div className="relative w-full h-full flex items-center">
                        <input type="range" min="0" max="100" step="0.1" value={progress || 0} onChange={handleSeek} onMouseDown={(e) => { e.stopPropagation(); if (isHost) setIsDragging(true); }} onTouchStart={(e) => { e.stopPropagation(); if (isHost) setIsDragging(true); }} onMouseUp={(e) => { e.stopPropagation(); handleSeekEnd(); }} onTouchEnd={(e) => { e.stopPropagation(); handleSeekEnd(); }} disabled={!isHost} className={`absolute inset-0 w-full h-full opacity-0 z-[100] pointer-events-auto ${isHost ? 'cursor-pointer' : 'cursor-default'}`}/>
                        <div className="absolute left-0 right-0 top-1/2 -translate-y-1/2 h-1.5 bg-white/10 rounded-full pointer-events-none" />
                        <div className="absolute left-0 top-1/2 -translate-y-1/2 h-1.5 bg-[var(--sb-primary)] rounded-full transition-all duration-100 ease-linear pointer-events-none" style={{ width: `${progress}%` }}/>
                        <div className="absolute top-1/2 -translate-y-1/2 h-6 px-3 bg-[var(--sb-primary)] rounded-full flex items-center justify-center text-[10px] font-bold text-white shadow-lg pointer-events-none transition-all duration-100 z-10 opacity-0 group-hover/progress:opacity-100" style={{left: `${progress}%`,transform: 'translate(-50%, -50%)'}}>{formatTime(localCurrentTime)}</div>
                    </div>
                </div>
                <audio ref={audioRef} src={src} preload="metadata" onTimeUpdate={handleTimeUpdate} onLoadedMetadata={handleLoadedMetadata} onEnded={handleEnded}/>
            </div>
        </>
    );
}
