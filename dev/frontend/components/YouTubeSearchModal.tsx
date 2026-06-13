import { useState } from "react";
import { Search, Play, X, Loader2, ExternalLink, Edit3, Check } from "lucide-react";
import { roomsApi } from "../lib/api";
import { useUpload } from "../context/UploadContext";

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
  onSelect: (url: string, title?: string) => Promise<void>;
  query: string;
}

export function YouTubeSearchModal({ isOpen, onClose, results, roomId, onSelect, query }: YouTubeSearchModalProps) {
  const upload = useUpload();
  const [selectedUrl, setSelectedUrl] = useState<string | null>(null);
  const [downloadingUrl, setDownloadingUrl] = useState<string | null>(null);

  // Editing track title before playing/downloading
  const [customTitles, setCustomTitles] = useState<Record<string, string>>({});
  const [editingTitleId, setEditingTitleId] = useState<string | null>(null);
  const [editingTitle, setEditingTitle] = useState<string>("");

  if (!isOpen) return null;

  const handleSelect = async (url: string) => {
    setSelectedUrl(url);
    await onSelect(url, customTitles[url]);
    setSelectedUrl(null);
  };

  const handleDownloadAndPlay = async (result: SearchResult, e: React.MouseEvent) => {
    e.stopPropagation();
    const videoId = result.url.split('v=')[1]?.split('&')[0] || result.url.split('youtu.be/')[1]?.split('?')[0];
    if (!videoId) {
      alert("Invalid YouTube URL");
      return;
    }

    setDownloadingUrl(result.url);
    try {
      await upload.downloadYoutubeToP2P(roomId, videoId, customTitles[result.url] || result.title);
      onClose(); // Only close on success
    } catch (error) {
      console.error("YouTube P2P proxy failed:", error);
      alert(`Failed to stream track: "${customTitles[result.url] || result.title}"`);
    } finally {
      setDownloadingUrl(null);
    }
  };

  const startEditing = (result: SearchResult, e: React.MouseEvent) => {
    e.stopPropagation();
    setEditingTitleId(result.url);
    setEditingTitle(customTitles[result.url] || result.title);
  };

  const saveEditing = () => {
    if (editingTitleId && editingTitle.trim()) {
      setCustomTitles(prev => ({ ...prev, [editingTitleId]: editingTitle.trim() }));
    }
    setEditingTitleId(null);
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
              <div
                key={result.url}
                className="w-full flex flex-col sm:flex-row gap-4 p-3 rounded-2xl hover:bg-foreground/5 border border-transparent hover:border-foreground/10 transition-all text-left group"
              >
                <div className="flex gap-4 flex-1 cursor-pointer" role="button" tabIndex={0} onClick={() => { if (selectedUrl) return; void handleSelect(result.url); }} onKeyDown={(e) => { if (selectedUrl) return; if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); void handleSelect(result.url); } }}>
                  {/* Thumbnail */}
                  <div className="relative w-32 md:w-40 aspect-video rounded-xl overflow-hidden shrink-0 bg-foreground/5">
                    <img src={result.thumbnail} alt={result.title} className="w-full h-full object-cover" />
                    <div className="absolute bottom-1.5 right-1.5 px-1.5 py-0.5 bg-black/70 backdrop-blur-md rounded-md text-[10px] font-bold text-white">
                      {formatDuration(result.duration)}
                    </div>
                  </div>

                  {/* Details */}
                  <div className="flex flex-col justify-center flex-1 min-w-0">
                    {editingTitleId === result.url ? (
                      <div className="flex items-center gap-2 mb-1" onClick={e => e.stopPropagation()}>
                        <input
                          autoFocus
                          value={editingTitle}
                          onChange={(e) => setEditingTitle(e.target.value)}
                          onBlur={saveEditing}
                          onKeyDown={(e) => {
                            e.stopPropagation();
                            if (e.key === 'Enter') saveEditing();
                            if (e.key === 'Escape') setEditingTitleId(null);
                          }}
                          className="flex-1 bg-background/50 border border-foreground/20 rounded px-2 py-1 text-sm md:text-base font-bold text-foreground focus:outline-none focus:border-foreground/40"
                        />
                        <button onClick={(e) => { e.stopPropagation(); saveEditing(); }} className="p-1.5 rounded bg-green-500/20 text-green-500 hover:bg-green-500/30 transition-colors">
                          <Check className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    ) : (
                      <div className="flex items-start justify-between gap-2 mb-1 group/title">
                        <h3 className="font-bold text-sm md:text-base line-clamp-2 leading-snug group-hover:text-[#FF0000] transition-colors flex-1">
                          {customTitles[result.url] || result.title}
                        </h3>
                        <button 
                          onClick={(e) => startEditing(result, e)}
                          className="p-1.5 rounded-full hover:bg-foreground/10 text-foreground/40 hover:text-foreground opacity-0 group-hover/title:opacity-100 transition-all shrink-0 focus:opacity-100"
                          title="Edit track title"
                        >
                          <Edit3 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    )}
                    <p className="text-xs text-foreground/50 line-clamp-1 mb-0.5">
                      {result.uploaderName}
                    </p>
                    <p className="text-[11px] text-foreground/40 font-medium">
                      {new Intl.NumberFormat('en-US', { notation: "compact" }).format(result.views)} views
                    </p>
                  </div>
                </div>

                {/* Actions */}
                <div className="flex flex-row sm:flex-col gap-2 shrink-0 justify-center">
                  <button
                    onClick={(e) => { e.stopPropagation(); handleSelect(result.url); }}
                    disabled={!!selectedUrl || !!downloadingUrl}
                    className="flex-1 sm:flex-none px-4 py-2 rounded-xl bg-foreground/5 hover:bg-foreground/10 text-xs font-bold transition-colors flex items-center justify-center gap-2 disabled:opacity-50"
                  >
                    {selectedUrl === result.url ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Play className="w-3.5 h-3.5" />}
                    Play <span className="bg-orange-500/20 text-orange-500 px-1.5 py-0.5 rounded text-[10px] ml-1">Beta</span>
                  </button>
                  <button
                    onClick={(e) => handleDownloadAndPlay(result, e)}
                    disabled={!!selectedUrl || !!downloadingUrl}
                    className="flex-1 sm:flex-none px-4 py-2 rounded-xl bg-[#FF0000] hover:bg-[#FF0000]/90 text-white text-xs font-bold transition-colors flex items-center justify-center gap-2 disabled:opacity-50 shadow-lg shadow-red-500/20"
                  >
                    {downloadingUrl === result.url ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Search className="w-3.5 h-3.5 hidden" />}
                    {downloadingUrl === result.url ? "Proxying..." : "Download & Play"}
                  </button>
                </div>
              </div>
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
