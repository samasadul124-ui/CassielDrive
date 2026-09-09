import { motion, AnimatePresence } from "framer-motion";
import { Play, Info, Plus, Check, Volume2, VolumeX, ChevronRight, Film } from "lucide-react";
import { useEffect, useState, useCallback } from "react";
import type { Title } from "../api/types";
import RemoteImage from "./RemoteImage";

interface HeroProps {
  /** real titles from the MovieBox-TUI backend (first home section) */
  titles: Title[];
  loading: boolean;
  onPlay: (title: Title) => void;
  onDetails: (title: Title) => void;
  onDownload: (title: Title) => void;
}

export default function Hero({ titles, loading, onPlay, onDetails, onDownload }: HeroProps) {
  const [index, setIndex] = useState(0);
  const [muted, setMuted] = useState(true);
  const [inMyList, setInMyList] = useState<Set<string>>(new Set());

  const current = titles.length ? titles[index % titles.length] : null;

  const next = useCallback(() => {
    setIndex((i) => (titles.length ? (i + 1) % titles.length : 0));
  }, [titles.length]);

  useEffect(() => {
    if (!titles.length) return;
    const timer = setInterval(next, 8000);
    return () => clearInterval(timer);
  }, [next, titles.length]);

  useEffect(() => {
    if (index >= titles.length) setIndex(0);
  }, [titles.length, index]);

  const toggleList = (id: string) => {
    setInMyList((prev) => {
      const n = new Set(prev);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });
  };

  if (loading || !current) {
    return (
      <div className="relative h-[70vh] min-h-[520px] w-full overflow-hidden bg-zinc-950 md:h-[85vh]">
        <div className="absolute inset-0 bg-gradient-to-br from-zinc-900 via-zinc-950 to-black" />
        <div className="relative z-10 flex h-full flex-col items-center justify-center gap-4 text-center">
          <div className="h-16 w-16 animate-pulse rounded-2xl bg-gradient-to-br from-red-600 to-red-800 flex items-center justify-center">
            <Film className="h-8 w-8 text-white" />
          </div>
          <p className="text-sm text-zinc-500">
            {loading ? "Loading hero content from MovieBox-TUI…" : "No hero content available from the backend right now."}
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="relative h-[70vh] min-h-[520px] w-full overflow-hidden md:h-[85vh]">
      <AnimatePresence mode="wait">
        <motion.div
          key={current.id}
          initial={{ opacity: 0, scale: 1.05 }}
          animate={{ opacity: 1, scale: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 1 }}
          className="absolute inset-0"
        >
          <div className={`absolute inset-0 bg-gradient-to-br ${current.posterGradient}`} />
          <RemoteImage
            src={current.heroImage}
            alt={current.title}
            eager
            fallbackClassName={`bg-gradient-to-br ${current.posterGradient}`}
            className="absolute inset-0 h-full w-full object-cover opacity-85"
          >
            <Film className="h-24 w-24 text-white/10" />
          </RemoteImage>
          <div className="absolute inset-0 bg-gradient-to-t from-black via-black/40 to-transparent" />
          <div className="absolute inset-0 bg-gradient-to-r from-black/90 via-black/40 to-transparent" />
        </motion.div>
      </AnimatePresence>

      {/* Mute toggle */}
      <button
        onClick={() => setMuted(!muted)}
        className="absolute top-24 right-6 z-20 hidden md:flex h-10 w-10 items-center justify-center rounded-full border border-white/20 bg-black/30 text-white backdrop-blur-sm hover:bg-white/10 transition-colors"
      >
        {muted ? <VolumeX className="h-4 w-4" /> : <Volume2 className="h-4 w-4" />}
      </button>

      {/* Content */}
      <div className="absolute inset-0 z-10 flex items-end">
        <div className="mx-auto w-full max-w-[1920px] px-4 pb-16 md:px-8 md:pb-24">
          <AnimatePresence mode="wait">
            <motion.div
              key={current.id}
              initial={{ opacity: 0, y: 30 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
              transition={{ duration: 0.6, delay: 0.2 }}
              className="max-w-2xl"
            >
              <div className="mb-4 flex items-center gap-3">
                <span className="rounded-md bg-red-600 px-2 py-0.5 text-xs font-bold uppercase tracking-wide text-white shadow-lg shadow-red-900/30">
                  {current.type === "movie" ? "Movie" : current.type === "series" ? "Series" : current.type === "anime" ? "Anime" : "Live"}
                </span>
                {current.match ? (
                  <span className="text-sm font-semibold text-green-400">{current.match}% Match</span>
                ) : null}
                {current.year && <span className="text-sm text-zinc-300">{current.year}</span>}
                {current.maturity && (
                  <span className="rounded border border-white/30 px-1.5 py-0.5 text-xs text-zinc-300">{current.maturity}</span>
                )}
                {current.duration && <span className="text-sm text-zinc-300">{current.duration}</span>}
                {current.seasons && (
                  <span className="text-sm text-zinc-300">
                    {current.seasons} Season{current.seasons > 1 ? "s" : ""}
                  </span>
                )}
              </div>

              <h1 className="mb-3 text-4xl font-black leading-tight tracking-tight text-white md:text-6xl lg:text-7xl drop-shadow-2xl">
                {current.title}
              </h1>
              {current.tagline && (
                <p className="mb-2 text-lg font-medium italic text-zinc-200 md:text-xl">{current.tagline}</p>
              )}
              {current.description && (
                <p className="mb-8 line-clamp-3 text-base leading-relaxed text-zinc-300 md:text-lg">
                  {current.description}
                </p>
              )}

              <div className="flex flex-wrap items-center gap-3 md:gap-4">
                <button
                  onClick={() => onPlay(current)}
                  className="group flex items-center gap-2 rounded-lg bg-white px-6 py-3 text-base font-bold text-black transition-transform hover:scale-105 hover:bg-zinc-200 md:px-8 md:py-3.5 md:text-lg"
                >
                  <Play className="h-5 w-5 fill-black" />
                  Play Now
                </button>
                <button
                  onClick={() => onDetails(current)}
                  className="flex items-center gap-2 rounded-lg bg-zinc-700/80 px-6 py-3 text-base font-bold text-white backdrop-blur-sm transition-colors hover:bg-zinc-600/80 md:px-8 md:py-3.5 md:text-lg"
                >
                  <Info className="h-5 w-5" />
                  More Info
                </button>
                <button
                  onClick={() => toggleList(current.id)}
                  className="flex h-12 w-12 items-center justify-center rounded-full border-2 border-zinc-500 text-white transition-colors hover:border-white md:h-14 md:w-14"
                  title="My List"
                >
                  {inMyList.has(current.id) ? <Check className="h-6 w-6" /> : <Plus className="h-6 w-6" />}
                </button>
                <button
                  onClick={() => onDownload(current)}
                  className="flex h-12 w-12 items-center justify-center rounded-full border-2 border-zinc-500 text-white transition-colors hover:border-white md:h-14 md:w-14"
                  title="Download"
                >
                  <Play className="hidden" />
                  <span className="text-lg">↓</span>
                </button>
              </div>
            </motion.div>
          </AnimatePresence>
        </div>
      </div>

      {/* Dots */}
      <div className="absolute bottom-6 left-1/2 z-20 flex -translate-x-1/2 items-center gap-1.5">
        {titles.map((t, i) => (
          <button
            key={t.id}
            onClick={() => setIndex(i)}
            aria-label={`Show ${t.title}`}
            className={`h-1.5 rounded-full transition-all ${
              i === index % titles.length ? "w-8 bg-red-600" : "w-2 bg-white/30 hover:bg-white/50"
            }`}
          />
        ))}
        <button
          onClick={next}
          className="ml-2 flex h-7 w-7 items-center justify-center rounded-full bg-white/10 text-white hover:bg-white/20 transition-colors"
        >
          <ChevronRight className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}
