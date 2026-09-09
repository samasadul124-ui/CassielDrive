import { useRef, useState } from "react";
import { motion } from "framer-motion";
import { ChevronLeft, ChevronRight } from "lucide-react";
import ContentCard from "./ContentCard";
import type { Title } from "../api/types";

interface ContentRowProps {
  title: string;
  items: Title[];
  onPlay: (title: Title) => void;
  onDetails: (title: Title) => void;
  onDownload: (title: Title) => void;
  size?: "normal" | "large";
  delay?: number;
}

export default function ContentRow({ title, items, onPlay, onDetails, onDownload, size = "normal", delay = 0 }: ContentRowProps) {
  const rowRef = useRef<HTMLDivElement>(null);
  const [canScrollLeft, setCanScrollLeft] = useState(false);
  const [canScrollRight, setCanScrollRight] = useState(true);

  const checkScroll = () => {
    if (!rowRef.current) return;
    const { scrollLeft, scrollWidth, clientWidth } = rowRef.current;
    setCanScrollLeft(scrollLeft > 0);
    setCanScrollRight(scrollLeft < scrollWidth - clientWidth - 10);
  };

  const scroll = (dir: "left" | "right") => {
    if (!rowRef.current) return;
    const cardWidth = size === "large" ? 320 : 224;
    rowRef.current.scrollBy({ left: dir === "left" ? -cardWidth * 2 : cardWidth * 2, behavior: "smooth" });
    setTimeout(checkScroll, 300);
  };

  return (
    <motion.section
      initial={{ opacity: 0, y: 40 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, amount: 0.1 }}
      transition={{ duration: 0.6, delay }}
      className="relative py-4 md:py-6"
    >
      <div className="mx-auto max-w-[1920px] px-4 md:px-8">
        <div className="mb-3 flex items-center justify-between md:mb-4">
          <h2 className="text-lg font-bold text-white md:text-2xl flex items-center gap-2">
            {title}
            <ChevronRight className="h-5 w-5 text-zinc-500" />
          </h2>
          <div className="hidden sm:flex items-center gap-2">
            <button
              onClick={() => scroll("left")}
              disabled={!canScrollLeft}
              className={`flex h-8 w-8 items-center justify-center rounded-full transition-colors ${
                canScrollLeft ? "bg-white/10 text-white hover:bg-white/20" : "bg-white/5 text-zinc-600 cursor-default"
              }`}
            >
              <ChevronLeft className="h-4 w-4" />
            </button>
            <button
              onClick={() => scroll("right")}
              disabled={!canScrollRight}
              className={`flex h-8 w-8 items-center justify-center rounded-full transition-colors ${
                canScrollRight ? "bg-white/10 text-white hover:bg-white/20" : "bg-white/5 text-zinc-600 cursor-default"
              }`}
            >
              <ChevronRight className="h-4 w-4" />
            </button>
          </div>
        </div>
      </div>

      <div className="relative group">
        {canScrollLeft && (
          <button
            onClick={() => scroll("left")}
            className="absolute left-0 top-0 z-30 hidden h-full w-12 items-center justify-center bg-gradient-to-r from-black/90 to-transparent md:flex"
          >
            <ChevronLeft className="h-8 w-8 text-white drop-shadow-lg" />
          </button>
        )}
        {canScrollRight && (
          <button
            onClick={() => scroll("right")}
            className="absolute right-0 top-0 z-30 hidden h-full w-12 items-center justify-center bg-gradient-to-l from-black/90 to-transparent md:flex"
          >
            <ChevronRight className="h-8 w-8 text-white drop-shadow-lg" />
          </button>
        )}

        <div
          ref={rowRef}
          onScroll={checkScroll}
          className="mx-auto flex max-w-[1920px] gap-3 overflow-x-auto px-4 pb-6 pt-1 no-scrollbar md:gap-4 md:px-8 snap-x"
        >
          {items.map((item, idx) => (
            <ContentCard
              key={`${item.id}-${idx}`}
              title={item}
              onPlay={onPlay}
              onDetails={onDetails}
              onDownload={onDownload}
              size={size}
            />
          ))}
          {/* Explore more card */}
          <motion.button
            whileHover={{ scale: 1.06 }}
            className={`flex-shrink-0 snap-start rounded-xl border border-white/10 bg-zinc-900/50 flex flex-col items-center justify-center gap-3 text-zinc-400 hover:text-white hover:border-white/20 transition-colors ${
              size === "large" ? "w-72 md:w-80 aspect-[3/4.5]" : "w-44 md:w-56 aspect-[2/3]"
            }`}
          >
            <div className="flex h-14 w-14 items-center justify-center rounded-full bg-white/5">
              <ChevronRight className="h-7 w-7" />
            </div>
            <span className="text-sm font-medium">Explore All</span>
          </motion.button>
        </div>
      </div>
    </motion.section>
  );
}
