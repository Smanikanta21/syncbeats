import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { TrackQueueItem } from "../lib/api";
import { Play, Disc, Trash2, GripVertical } from "lucide-react";
import { motion } from "framer-motion";

function cleanTitle(t: string) {
  return (
    t
      .replace(/\s*\[.*?\]/g, "")
      .replace(/\s*\(.*?\)/g, "")
      .replace(/\s*[\[\(].*?(official|music|video|audio|lyric|hd|hq|4k|live).*?[\)\]]/gi, "")
      .replace(/\s*-\s*.*?(official|music|video|audio).*$/gi, "")
      .trim() || t
  );
}

function ytThumb(trackUrl: string | null | undefined) {
  if (!trackUrl) return null;
  const m = trackUrl.match(/^ws-p2p:yt:([^_]+)_/);
  return m ? `https://i.ytimg.com/vi/${m[1]}/mqdefault.jpg` : null;
}

interface SortableTrackItemProps {
  item: TrackQueueItem;
  idx: number;
  isCurrent: boolean;
  isPlaying: boolean;
  isHovered: boolean;
  isHost: boolean;
  onHoverStart: () => void;
  onHoverEnd: () => void;
  onTrackSelect: (item: TrackQueueItem) => void;
  onRemoveTrack: (id: string) => void;
  disableDrag?: boolean;
}

export function SortableTrackItem({
  item, idx, isCurrent, isPlaying, isHovered, isHost,
  onHoverStart, onHoverEnd, onTrackSelect, onRemoveTrack, disableDrag
}: SortableTrackItemProps) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: item.id, disabled: disableDrag });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    zIndex: isDragging ? 10 : 1,
    opacity: isDragging ? 0.8 : 1,
  };

  const thumb = ytThumb(item.trackUrl);

  return (
    <div
      ref={setNodeRef}
      style={style}
      onMouseEnter={onHoverStart}
      onMouseLeave={onHoverEnd}
      className={`relative flex items-center gap-2 p-2 rounded-xl cursor-pointer group transition-colors duration-150 ${
        isCurrent
          ? "bg-foreground/20 border border-foreground/20"
          : "border border-transparent hover:bg-foreground/[0.04]"
      } ${isDragging ? "shadow-lg bg-foreground/10" : ""}`}
      onClick={() => onTrackSelect(item)}
    >
      {/* Drag Handle */}
      {isHost && !disableDrag && (
        <div
          {...attributes}
          {...listeners}
          className="p-1 cursor-grab active:cursor-grabbing text-foreground/30 hover:text-foreground/80 opacity-0 group-hover:opacity-100 transition-opacity mr-1"
          onClick={(e) => e.stopPropagation()}
        >
          <GripVertical className="w-4 h-4" />
        </div>
      )}

      {/* Track number / playing indicator */}
      <div className={`w-5 shrink-0 flex items-center justify-center ${(!isHost || disableDrag) ? "ml-1" : ""}`}>
        {isCurrent ? (
          <div className="flex gap-[2px] h-4 items-end">
            {isPlaying ? (
              <>
                <motion.div
                  className="w-[3px] rounded-full bg-foreground text-background dark:bg-foreground"
                  animate={{ height: ["30%", "100%", "60%", "100%", "30%"] }}
                  transition={{ duration: 1.2, repeat: Infinity, ease: "linear" }}
                />
                <motion.div
                  className="w-[3px] rounded-full bg-foreground text-background dark:bg-foreground"
                  animate={{ height: ["100%", "30%", "100%", "50%", "100%"] }}
                  transition={{ duration: 1.2, repeat: Infinity, ease: "linear", delay: 0.2 }}
                />
                <motion.div
                  className="w-[3px] rounded-full bg-foreground text-background dark:bg-foreground"
                  animate={{ height: ["60%", "100%", "30%", "80%", "60%"] }}
                  transition={{ duration: 1.2, repeat: Infinity, ease: "linear", delay: 0.4 }}
                />
              </>
            ) : (
              <>
                <div className="w-[3px] h-[30%] rounded-full bg-foreground text-background dark:bg-foreground opacity-50" />
                <div className="w-[3px] h-[60%] rounded-full bg-foreground text-background dark:bg-foreground opacity-50" />
                <div className="w-[3px] h-[40%] rounded-full bg-foreground text-background dark:bg-foreground opacity-50" />
              </>
            )}
          </div>
        ) : (
          <>
            <span className="text-[11px] font-bold text-foreground/20 group-hover:opacity-0 transition-opacity">
              {idx + 1}
            </span>
            {isHovered && !isDragging && (
              <Play className="absolute w-3.5 h-3.5 text-foreground/60 fill-foreground/60" />
            )}
          </>
        )}
      </div>

      {/* Thumbnail */}
      <div className={`w-9 h-9 rounded-lg shrink-0 overflow-hidden flex items-center justify-center ${thumb ? "" : "bg-foreground/10"}`}>
        {thumb ? (
          <img src={thumb} alt="" className="w-full h-full object-cover pointer-events-none" />
        ) : (
          <Disc className={`w-5 h-5 ${isCurrent ? "text-foreground dark:text-foreground" : "text-foreground/30"}`} />
        )}
      </div>

      {/* Title + Added by */}
      <div className="flex-1 min-w-0 pointer-events-none">
        <div className={`text-sm font-semibold truncate ${isCurrent ? "text-foreground dark:text-foreground" : "text-foreground/80"}`}>
          {cleanTitle(item.title)}
        </div>
        {item.addedByName && (
          <div className="text-[10px] text-foreground/25 truncate mt-0.5">
            Added by {item.addedByName}
          </div>
        )}
      </div>

      {/* Remove button (host only) */}
      {isHost && isHovered && !isDragging && (
        <motion.button
          initial={{ opacity: 0, scale: 0.8 }}
          animate={{ opacity: 1, scale: 1 }}
          onClick={e => { e.stopPropagation(); onRemoveTrack(item.id); }}
          className="shrink-0 p-1.5 rounded-lg bg-red-500/10 text-red-500 hover:bg-red-500/20 transition-colors"
        >
          <Trash2 className="w-3 h-3" />
        </motion.button>
      )}
    </div>
  );
}
