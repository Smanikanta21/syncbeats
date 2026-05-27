import { useState } from "react";
import { Search, Play, X, Loader2, ExternalLink } from "lucide-react";
import { roomsApi } from "../lib/api";

interface SearchResult {
  url: string;
  type: "stream";
  title: string;
  thumbnail: string;
  uploaderName: string;
  uploaderUrl: string;
  uploadedDate: string;
  shortDescription: string;
  duration: number;
  views: number;
  uploaded: number;
  uploaderAvatar: string;
  isShort: boolean;
}

interface YouTubeSearchModalProps {
  isOpen: boolean;
  onClose: () => void;
  results: SearchResult[];
  roomId: string;
  onSelect: (url: string) => Promise<void>;
  query: string;
}

export function YouTubeSearchModal({ isOpen, onClose, results, roomId, onSelect, query }: YouTubeSearchModalProps) {
  const [selectedUrl, setSelectedUrl] = useState<string | null>(null);

  if (!isOpen) return null;

  const handleSelect = async (url: string) => {
    setSelectedUrl(url);
    await onSelect(url);
    setSelectedUrl(null);
  };

  const formatDuration = (seconds: number) => {
    if (seconds < 0) return "0:00";
    const m = Math.floor(seconds / 60);
    const s = Math.floor(seconds % 60);
    return `${m}:${s.toString().padStart(2, "0")}`;
  };

  const handleSearchOnYouTube = () => {
    const isMobile = /iPhone|iPad|iPod|Android/i.test(navigator.userAgent);
    const url = `https://www.youtube.com/results?search_query=${encodeURIComponent(query)}`;
    if (isMobile) {
      window.location.href = url; // Attempt to open app on mobile
    } else {
      window.open(url, '_blank');
    }
  };

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
      {/* Backdrop */}
      <div 
        className="absolute inset-0 bg-background/80 backdrop-blur-sm transition-opacity"
        onClick={onClose}
      />

      {/* Modal */}
      <div className="relative w-full max-w-2xl max-h-[85vh] bg-background/60 backdrop-blur-xl border border-foreground/10 rounded-3xl shadow-2xl overflow-hidden flex flex-col">
        {/* Header */}
        <div className="px-6 py-4 border-b border-foreground/10 flex items-center justify-between shrink-0 bg-background/40">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-[#FF0000]/10 flex items-center justify-center">
              <Search className="w-5 h-5 text-[#FF0000]" />
            </div>
            <div>
              <h2 className="text-lg font-bold">Search Results</h2>
              <p className="text-sm text-foreground/50">"{query}"</p>
            </div>
          </div>
          <button 
            onClick={onClose}
            className="w-10 h-10 rounded-full flex items-center justify-center hover:bg-foreground/5 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Results List */}
        <div className="flex-1 overflow-y-auto p-4 space-y-2">
          {results.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-48 text-foreground/50">
              <p>No results found for "{query}".</p>
            </div>
          ) : (
            results.map((result) => (
              <button
                key={result.url}
                onClick={() => handleSelect(result.url)}
                disabled={!!selectedUrl}
                className="w-full flex gap-4 p-3 rounded-2xl hover:bg-foreground/5 border border-transparent hover:border-foreground/10 transition-all text-left group disabled:opacity-50"
              >
                {/* Thumbnail */}
                <div className="relative w-32 md:w-40 aspect-video rounded-xl overflow-hidden shrink-0 bg-foreground/5">
                  <img src={result.thumbnail} alt={result.title} className="w-full h-full object-cover" />
                  <div className="absolute bottom-1.5 right-1.5 px-1.5 py-0.5 bg-black/70 backdrop-blur-md rounded-md text-[10px] font-bold text-white">
                    {formatDuration(result.duration)}
                  </div>
                  {/* Hover Overlay */}
                  <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                    {selectedUrl === result.url ? (
                      <Loader2 className="w-8 h-8 text-white animate-spin" />
                    ) : (
                      <div className="w-10 h-10 rounded-full bg-[#FF0000] flex items-center justify-center shadow-lg transform scale-90 group-hover:scale-100 transition-transform">
                        <Play className="w-5 h-5 text-white ml-1" />
                      </div>
                    )}
                  </div>
                </div>

                {/* Details */}
                <div className="flex flex-col justify-center flex-1 min-w-0">
                  <h3 className="font-bold text-sm md:text-base line-clamp-2 leading-snug mb-1 group-hover:text-[#FF0000] transition-colors">
                    {result.title}
                  </h3>
                  <p className="text-xs text-foreground/50 line-clamp-1 mb-0.5">
                    {result.uploaderName}
                  </p>
                  <p className="text-[11px] text-foreground/40 font-medium">
                    {new Intl.NumberFormat('en-US', { notation: "compact" }).format(result.views)} views
                  </p>
                </div>
              </button>
            ))
          )}
        </div>

        {/* Footer */}
        <div className="p-4 border-t border-foreground/10 shrink-0 bg-background/40">
          <button 
            onClick={handleSearchOnYouTube}
            className="w-full py-3 rounded-xl flex items-center justify-center gap-2 text-sm font-bold bg-foreground/5 hover:bg-foreground/10 transition-colors"
          >
            <ExternalLink className="w-4 h-4" />
            Search on YouTube
          </button>
        </div>
      </div>
    </div>
  );
}
