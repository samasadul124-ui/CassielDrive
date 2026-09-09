import { motion } from "framer-motion";
import { Play, Info, Plus, Check, Star, Download, Film } from "lucide-react";
import { useState } from "react";
import type { Title } from "../api/types";
import RemoteImage from "./RemoteImage";

interface ContentCardProps {
  title: Title;
  onPlay: (title: Title) => void;
  onDetails: (title: Title) => void;
  onDownload: (title: Title) => void;
  size?: "normal" | "large";
}

export default function ContentCard({ title, onPlay, onDetails, onDownload, size = "normal" }: ContentCardProps) {
  const [inList, setInList] = useState(false);

  const isLarge = size === "large";

  return (
    <motion.div
      whileHover={{ scale: 1.06, zIndex: 20 }}
      transition={{ type: "spring", stiffness: 300, damping: 25 }}
      className={`relative flex-shrink-0 cursor-pointer snap-start overflow-hidden rounded-xl bg-zinc-900 shadow-xl ${
        isLarge ? "w-72 md:w-80 aspect-[3/4.5]" : "w-44 md:w-56 aspect-[2/3]"
      }`}
      onClick={() => onDetails(title)}
    >
      {/* Background fallback (only visible when remote artwork is missing/failed) */}
      <div className={`absolute inset-0 bg-gradient-to-br ${title.posterGradient}`} />
      <RemoteImage
        src={title.heroImage}
        alt={title.title}
        fallbackClassName={`bg-gradient-to-br ${title.posterGradient}`}
        className="absolute inset-0 h-full w-full object-cover opacity-80"
      >
        <Film className="h-10 w-10 text-white/20" />
      </RemoteImage>
      <div className="absolute inset-0 bg-gradient-to-t from-black via-black/20 to-transparent" />

      {/* Top badges */}
      <div className="absolute top-2 left-2 flex flex-wrap gap-1.5">
        <span className="rounded bg-red-600 px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide text-white">
          {title.type}
        </span>
        {title.maturity && (
          <span className="rounded bg-black/50 px-1.5 py-0.5 text-[10px] font-medium text-white backdrop-blur-sm">
            {title.maturity}
          </span>
        )}
      </div>

      {title.isLive && (
        <div className="absolute top-2 right-2 flex items-center gap-1.5 rounded bg-red-600/90 px-2 py-0.5 text-[10px] font-bold text-white">
          <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-white" />
          LIVE
        </div>
      )}

      {/* Bottom info */}
      <div className="absolute inset-x-0 bottom-0 p-3 md:p-4">
        <h3 className={`font-bold text-white leading-tight ${isLarge ? "text-lg md:text-xl" : "text-sm md:text-base"}`}>
          {title.title}
        </h3>
        <div className="mt-1 flex items-center gap-2 text-[10px] md:text-xs text-zinc-300">
          {title.rating ? (
            <span className="flex items-center gap-0.5 text-yellow-400">
              <Star className="h-3 w-3 fill-yellow-400" />
              {title.rating}
            </span>
          ) : null}
          {title.year && <span>{title.year}</span>}
          <span>{title.duration || (title.seasons ? `${title.seasons}S` : "")}</span>
        </div>
        {title.description && (
          <p className={`mt-1.5 line-clamp-2 text-[10px] md:text-xs text-zinc-400 ${isLarge ? "md:line-clamp-3" : ""}`}>
            {title.description}
          </p>
        )}

        {/* Action buttons */}
        <div className="mt-3 flex items-center gap-2">
          <button
            onClick={(e) => {
              e.stopPropagation();
              onPlay(title);
            }}
            className="flex h-8 w-8 items-center justify-center rounded-full bg-white text-black hover:bg-zinc-200 transition-colors"
          >
            <Play className="h-4 w-4 fill-black" />
          </button>
          <button
            onClick={(e) => {
              e.stopPropagation();
              onDetails(title);
            }}
            className="flex h-8 w-8 items-center justify-center rounded-full border border-white/40 text-white hover:bg-white/10 transition-colors"
          >
            <Info className="h-4 w-4" />
          </button>
          <button
            onClick={(e) => {
              e.stopPropagation();
              setInList(!inList);
            }}
            className={`flex h-8 w-8 items-center justify-center rounded-full border transition-colors ${
              inList ? "border-white bg-white/20 text-white" : "border-white/40 text-white hover:bg-white/10"
            }`}
          >
            {inList ? <Check className="h-4 w-4" /> : <Plus className="h-4 w-4" />}
          </button>
          <button
            onClick={(e) => {
              e.stopPropagation();
              onDownload(title);
            }}
            className="ml-auto flex h-8 w-8 items-center justify-center rounded-full border border-white/40 text-white hover:bg-white/10 transition-colors"
          >
            <Download className="h-4 w-4" />
          </button>
        </div>
      </div>
    </motion.div>
  );
}
