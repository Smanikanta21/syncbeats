import React from "react";
import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { TrackQueueItem } from "../lib/types";
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

  // Check if a custom thumbnail was appended (e.g. from Spotify import)
  const thumbMatch = trackUrl.match(/[?&]thumb=([^&]+)/);
  if (thumbMatch) return decodeURIComponent(thumbMatch[1]);

  // Otherwise, extract YouTube ID
  const ytMatch = trackUrl.match(/^(?:ws-p2p:yt:|youtube:)([^_?]+)/);
  return ytMatch ? `https://i.ytimg.com/vi/${ytMatch[1]}/mqdefault.jpg` : null;
}

export interface TrackItemRowProps {
  item: TrackQueueItem;
  idx: number;
  isCurrent: boolean;
  isPlaying: boolean;
  isHovered: boolean;
  isHost: boolean;
  onHoverStart?: () => void;
  onHoverEnd?: () => void;
  onTrackSelect?: (item: TrackQueueItem) => void;
  onRemoveTrack?: (id: string) => void;
  disableDrag?: boolean;
  isHistory?: boolean;
  isNew?: boolean;
  isDragging?: boolean;
  style?: React.CSSProperties;
  dragHandleProps?: any;
  setNodeRef?: (node: HTMLElement | null) => void;
}

export function TrackItemRow({
  item, idx, isCurrent, isPlaying, isHovered, isHost,
  onHoverStart, onHoverEnd, onTrackSelect, onRemoveTrack, disableDrag, isHistory, isNew,
  isDragging, style, dragHandleProps, setNodeRef
}: TrackItemRowProps) {
  const thumb = ytThumb(item.trackUrl);

  const [isMobile, setIsMobile] = React.useState(false);
  React.useEffect(() => {
    setIsMobile(window.innerWidth < 768);
  }, []);

  return (
    <motion.div
      ref={setNodeRef}
      style={style}
      {...(isMobile && !disableDrag && !isHistory ? dragHandleProps : {})}
      initial={isNew ? { opacity: 0, y: -16, scale: 1.12 } : { opacity: 1, y: 0, scale: 1 }}
      animate={{ opacity: isDragging ? 0.3 : 1, y: 0, scale: 1 }}
      transition={{ 
        type: "spring", 
        stiffness: 500, 
        damping: 22,
      }}
      onMouseEnter={onHoverStart}
      onMouseLeave={onHoverEnd}
      className={`relative flex items-center gap-2 p-2 rounded-xl cursor-pointer group transition-all duration-150 transform-gpu ${
        isCurrent
          ? "bg-foreground/20 border border-foreground/20"
          : isHistory 
            ? "opacity-50 hover:bg-foreground/[0.04] grayscale-[30%]"
            : "border border-transparent hover:bg-foreground/[0.04]"
      } ${isDragging ? "bg-foreground/5 border-dashed border-foreground/20 rounded-2xl" : ""}`}
      onClick={() => onTrackSelect?.(item)}
    >
      {/* Drag Handle */}
      {!disableDrag && !isHistory && (
        <div
          {...dragHandleProps}
          className="hidden md:block p-1 cursor-grab active:cursor-grabbing text-foreground/30 hover:text-foreground/80 opacity-0 group-hover:opacity-100 transition-opacity mr-1"
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
          <img src={thumb} loading="eager" decoding="sync" alt="" className="w-full h-full object-cover pointer-events-none" />
        ) : (
          <Disc className={`w-5 h-5 ${isCurrent ? "text-foreground dark:text-foreground" : "text-foreground/30"}`} />
        )}
      </div>

      {/* Title + Added by */}
      <div className="flex-1 min-w-0 pointer-events-none">
        <div className={`text-sm font-semibold truncate ${isCurrent ? "text-foreground dark:text-foreground" : "text-foreground/80"}`}>
          {cleanTitle(item.title)}
        </div>
        {item.artist && (
          <div className="text-[11px] text-foreground/50 truncate mt-[1px]">
            {item.artist}
          </div>
        )}
        {item.addedByName && (
          <div className="text-[10px] text-foreground/25 truncate mt-0.5">
            Added by {item.addedByName}
          </div>
        )}
      </div>

      {/* Remove button */}
      {isHovered && !isDragging && !isHistory && (
        <motion.button
          initial={{ opacity: 0, scale: 0.8 }}
          animate={{ opacity: 1, scale: 1 }}
          onClick={e => { e.stopPropagation(); onRemoveTrack?.(item.id); }}
          className="shrink-0 p-1.5 rounded-lg bg-red-500/10 text-red-500 hover:bg-red-500/20 transition-colors"
        >
          <Trash2 className="w-3 h-3" />
        </motion.button>
      )}
    </motion.div>
  );
}

export interface SortableTrackItemProps {
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
  isHistory?: boolean;
  isNew?: boolean;
}

export function SortableTrackItem(props: SortableTrackItemProps) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: props.item.id, disabled: props.disableDrag });

  const style: React.CSSProperties = {
    transform: isDragging ? undefined : CSS.Transform.toString(transform),
    transition,
  };

  const dragHandleProps = props.disableDrag ? undefined : { ...attributes, ...listeners };

  return (
    <TrackItemRow
      {...props}
      isDragging={isDragging}
      style={style}
      dragHandleProps={dragHandleProps}
      setNodeRef={setNodeRef}
    />
  );
}
