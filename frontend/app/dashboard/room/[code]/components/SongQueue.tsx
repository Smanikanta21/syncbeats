import { useState } from 'react';
import Image from 'next/image';
import { Play, BarChart2, Plus, X } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import FileUpload from '@/components/FileUpload';
import { authFetch } from '@/lib/authFetch';
import { toast } from 'react-toastify';

interface Song {
    title: string;
    artist: string;
    album: string;
    cover: string;
}

interface SongQueueProps {
    queue: Song[];
    currentIndex: number;
    isPlaying: boolean;
    storageUsed?: number;
    onStorageUpdate?: () => void;
    onSongAdded?: (song: Song) => void;
}

export default function SongQueue({ queue, currentIndex, isPlaying, storageUsed = 0, onStorageUpdate, onSongAdded }: SongQueueProps) {
    const [showUpload, setShowUpload] = useState(false);

    return (
        <div className="bg-white/5 rounded-3xl p-6 border border-white/5 h-full overflow-hidden flex flex-col relative">
            <div className="flex items-center justify-between mb-4">
                <h3 className="text-xl font-bold flex items-center gap-2">
                    <BarChart2 size={20} className="text-white/60" /> Up Next
                </h3>
                <button onClick={() => setShowUpload(!showUpload)} className="p-2 rounded-full bg-white/10 hover:bg-white/20 transition-colors">
                    {showUpload ? <X size={18} /> : <Plus size={18} />}
                </button>
            </div>

            <AnimatePresence>
                {showUpload && (
                    <motion.div initial={{ opacity: 0, y: -20 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -20 }} className="absolute inset-x-0 top-16 z-20 p-4 bg-[#121212]/95 backdrop-blur-md border-b border-white/10">
                        <FileUpload storageUsed={storageUsed} onUploadSuccess={(data) => { toast.success("Song uploaded!"); setShowUpload(false); onStorageUpdate?.(); onSongAdded?.({ title: data.url, artist: 'Unknown Artist', album: 'Upload', cover: 'https://images.unsplash.com/photo-1470225620780-dba8ba36b745?w=50' }) }} /></motion.div>)}
            </AnimatePresence>

            <div className="space-y-2 overflow-y-auto custom-scrollbar flex-1">
                {queue.map((song, index) => {
                    const isCurrent = index === currentIndex;
                    return (
                        <motion.div key={index} initial={{ opacity: 0, x: -20 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: index * 0.05 }} className={`flex items-center gap-3 p-3 rounded-xl transition-all group ${isCurrent ? 'bg-white/10 border border-white/10' : 'hover:bg-white/5 border border-transparent'}`}>
                            <div className="relative w-12 h-12 rounded-lg overflow-hidden shrink-0">
                                <Image src={song.cover} alt={song.title} width={48} height={48} className={`object-cover ${isCurrent && isPlaying ? 'animate-pulse' : ''}`} unoptimized />
                                {isCurrent && isPlaying && (
                                    <div className="absolute inset-0 bg-black/40 flex items-center justify-center">
                                        <BarChart2 size={16} className="text-white animate-bounce" />
                                    </div>
                                )}
                            </div>

                            <div className="flex-1 min-w-0">
                                <h4 className={`font-medium truncate ${isCurrent ? 'text-green-400' : 'text-white'}`}>
                                    {decodeURIComponent(song.title).split('/').pop()?.replace('.mp3', '')}
                                </h4>
                                <p className="text-xs text-white/50 truncate">{song.artist}</p>
                            </div>

                            {isCurrent && (
                                <div className="p-2 rounded-full bg-green-500/20 text-green-400">
                                    <Play size={12} fill="currentColor" />
                                </div>
                            )}
                        </motion.div>
                    );
                })}
            </div>
        </div>
    );
}
