import { motion, AnimatePresence } from "framer-motion";
import {
  Play,
  Plus,
  Check,
  Download,
  X,
  Star,
  Calendar,
  Clock,
  Server,
  Subtitles,
  ChevronDown,
  CheckCircle2,
  Loader2,
} from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { api } from "../api/client";
import {
  detailsToTitle,
  PROVIDER_LABELS,
  type MediaDetails,
  type SubtitleOption,
  type Title,
} from "../api/types";
import { useAsync } from "../api/hooks";
import RemoteImage from "./RemoteImage";
import BackendState from "./BackendState";

interface DetailModalProps {
  title: Title | null;
  open: boolean;
  onClose: () => void;
  onPlay: (title: Title, season?: number, episode?: number) => void;
  onDownload: (title: Title, season?: number, episode?: number) => void;
  onDownloadSeason: (title: Title, season: number, episodes: number[]) => void;
}

/**
 * Details screen backed by real MovieBox-TUI metadata (details endpoint).
 * Seasons/episodes/subtitles come straight from the provider.
 */
export default function DetailModal({ title, open, onClose, onPlay, onDownload, onDownloadSeason }: DetailModalProps) {
  const { data: detailsData, loading, error, retry } = useAsync(
    async () => {
      if (!title) throw new Error("no title");
      return api.details(title.provider, title.backendId, false);
    },
    [title?.id, open],
  );

  const details: MediaDetails | null = detailsData?.details ?? null;
  const fullTitle: Title | null = title && details ? detailsToTitle(title, details) : title;

  const isSeries = Boolean(fullTitle && (fullTitle.type === "series" || fullTitle.type === "anime"));
  const [season, setSeason] = useState(1);
  const [showAllEpisodes, setShowAllEpisodes] = useState(false);
  const [downloadMode, setDownloadMode] = useState<"single" | "season">("single");
  const [toast, setToast] = useState<string | null>(null);
  const [inList, setInList] = useState(false);
  const [subtitles, setSubtitles] = useState<SubtitleOption[]>([]);
  const [subtitle, setSubtitle] = useState<string>("Off");
  const [subsLoading, setSubsLoading] = useState(false);

  const isAddon = fullTitle?.provider === "addons";

  const showToast = (msg: string) => {
    setToast(msg);
    window.setTimeout(() => setToast(null), 2500);
  };

  // real season/episode selection from backend data
  const seasons = details?.seasons ?? [];
  const activeSeasonNumber = seasons.some((s) => s.number === season) ? season : seasons[0]?.number ?? 1;
  const episodes = seasons.find((s) => s.number === activeSeasonNumber)?.episodes ?? [];

  // subtitles: resolved lazily from the first release's resource id (real data)
  const loadSubtitles = useCallback(async () => {
    if (!title) return;
    const s = isSeries ? 1 : 0;
    const e = isSeries ? 1 : 0;
    setSubsLoading(true);
    try {
      const { releases } = await api.streams(title.provider, title.backendId, s, e);
      const rid = releases.find((r) => r.resource_id)?.resource_id;
      if (rid) {
        const { subtitles: subs } = await api.subtitles(title.provider, title.backendId, rid);
        setSubtitles(subs);
      } else {
        setSubtitles([]);
      }
    } catch {
      setSubtitles([]);
    } finally {
      setSubsLoading(false);
    }
  }, [title, isSeries]);

  useEffect(() => {
    if (open && title && title.provider !== "addons") {
      setSeason(1);
      setShowAllEpisodes(false);
      setSubtitle("Off");
      setDownloadMode("single");
      void loadSubtitles();
    }
  }, [open, title?.id, loadSubtitles]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    if (open) {
      document.body.style.overflow = "hidden";
      window.addEventListener("keydown", onKey);
    }
    return () => {
      document.body.style.overflow = "";
      window.removeEventListener("keydown", onKey);
    };
  }, [open, onClose]);

  if (!title || !open) return null;

  // non-null view of the (possibly enriched) title for the rendered branch
  const ft: Title = fullTitle ?? title;

  const handleDownload = () => {
    if (!fullTitle) return;
    if (isAddon) {
      showToast("Addon downloads are handled by MovieBox-TUI");
      return;
    }
    if (downloadMode === "season" && isSeries) {
      onDownloadSeason(fullTitle, activeSeasonNumber, episodes.map((ep) => ep.number));
    } else {
      onDownload(fullTitle, isSeries ? activeSeasonNumber : 0, isSeries ? 1 : 0);
    }
    showToast(
      downloadMode === "season" && isSeries
        ? `Added ${fullTitle.title} Season ${activeSeasonNumber} to downloads`
        : `Added ${fullTitle.title} to downloads`,
    );
  };

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-0 md:p-6">
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        onClick={onClose}
        className="absolute inset-0 bg-black/85 backdrop-blur-sm"
      />
      <motion.div
        initial={{ opacity: 0, scale: 0.95, y: 40 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.95, y: 40 }}
        transition={{ type: "spring", stiffness: 300, damping: 30 }}
        className="relative z-10 w-full max-w-4xl max-h-[90vh] overflow-y-auto rounded-none md:rounded-2xl bg-zinc-900 shadow-2xl"
      >
        {loading ? (
          <div className="h-[520px]">
            <BackendState state="loading" message="Fetching metadata from MovieBox-TUI…" className="h-full" />
          </div>
        ) : error ? (
          <div className="h-[520px]">
            <BackendState state="error" error={error} onRetry={retry} className="h-full" />
          </div>
        ) : (
          <>
            {/* Hero image header — real remote backdrop/poster */}
            <div className="relative h-64 md:h-80 overflow-hidden">
              <div className={`absolute inset-0 bg-gradient-to-br ${fullTitle?.posterGradient}`} />
              <RemoteImage
                src={fullTitle?.heroImage}
                alt={fullTitle?.title ?? title.title}
                eager
                fallbackClassName={`bg-gradient-to-br ${fullTitle?.posterGradient ?? "bg-zinc-800"}`}
                className="h-full w-full object-cover opacity-80"
              />
              <div className="absolute inset-0 bg-gradient-to-t from-zinc-900 via-zinc-900/40 to-transparent" />
              <button
                onClick={onClose}
                className="absolute top-4 right-4 z-20 flex h-10 w-10 items-center justify-center rounded-full bg-black/50 text-white hover:bg-black/70 transition-colors"
              >
                <X className="h-5 w-5" />
              </button>
              <div className="absolute bottom-0 left-0 right-0 p-6 md:p-8">
                <h2 className="text-3xl md:text-4xl font-black tracking-tight drop-shadow-lg">
                  {fullTitle?.title ?? title.title}
                </h2>
                <div className="mt-2 flex flex-wrap items-center gap-3 text-sm">
                  {fullTitle?.rating ? (
                    <span className="flex items-center gap-1 font-bold text-green-400">
                      <Star className="h-4 w-4 fill-green-400" /> {fullTitle.rating}
                    </span>
                  ) : null}
                  {fullTitle?.year && <span className="text-zinc-300">{fullTitle.year}</span>}
                  {fullTitle?.duration && (
                    <span className="flex items-center gap-1 text-zinc-300">
                      <Clock className="h-3.5 w-3.5" /> {fullTitle.duration}
                    </span>
                  )}
                  {fullTitle?.seasons ? (
                    <span className="text-zinc-300">
                      {fullTitle.seasons} Season{fullTitle.seasons > 1 ? "s" : ""}
                    </span>
                  ) : null}
                  <span className="rounded bg-white/10 px-2 py-0.5 text-xs font-semibold text-zinc-200">
                    {PROVIDER_LABELS[title.provider as keyof typeof PROVIDER_LABELS] ?? title.provider}
                  </span>
                </div>
              </div>
            </div>

            <div className="p-6 md:p-8 space-y-6">
              {fullTitle?.description && (
                <p className="text-sm md:text-base leading-relaxed text-zinc-300">{fullTitle.description}</p>
              )}

              {/* Actions */}
              <div className="flex flex-wrap items-center gap-3">
                <button
                  onClick={() => onPlay(ft, isSeries ? activeSeasonNumber : 0, isSeries ? 1 : 0)}
                  disabled={isAddon}
                  title={isAddon ? "Addon streams play inside MovieBox-TUI" : undefined}
                  className={`flex items-center gap-2 rounded-lg px-6 py-3 text-base font-bold transition-all ${
                    isAddon
                      ? "bg-zinc-800 text-zinc-600 cursor-not-allowed"
                      : "bg-white text-black hover:scale-105 hover:bg-zinc-200"
                  }`}
                >
                  <Play className="h-5 w-5 fill-black" />
                  Play Now
                </button>
                <button
                  onClick={() => setInList(!inList)}
                  className={`flex items-center gap-2 rounded-lg px-5 py-3 text-base font-bold transition-all border ${
                    inList ? "bg-white/10 border-white text-white" : "border-white/30 text-white hover:bg-white/10"
                  }`}
                >
                  {inList ? <Check className="h-5 w-5" /> : <Plus className="h-5 w-5" />}
                  {inList ? "In My List" : "My List"}
                </button>
                <button
                  onClick={handleDownload}
                  className="flex items-center gap-2 rounded-lg border border-white/30 px-5 py-3 text-base font-bold text-white transition-all hover:bg-white/10"
                >
                  <Download className="h-5 w-5" />
                  Download
                </button>
              </div>

              {/* Options grid — real backend values only */}
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                <div className="rounded-xl bg-zinc-800/50 p-4">
                  <label className="mb-2 flex items-center gap-2 text-xs font-bold uppercase tracking-wide text-zinc-500">
                    <Server className="h-4 w-4" /> Source
                  </label>
                  <p className="text-sm font-semibold text-white">
                    {PROVIDER_LABELS[title.provider as keyof typeof PROVIDER_LABELS] ?? title.provider}
                  </p>
                  <p className="mt-1 text-xs text-zinc-500">Resolved by MovieBox-TUI providers</p>
                </div>

                {fullTitle?.audios && (
                  <div className="rounded-xl bg-zinc-800/50 p-4">
                    <label className="mb-2 flex items-center gap-2 text-xs font-bold uppercase tracking-wide text-zinc-500">
                      Audio Tracks
                    </label>
                    <p className="text-sm text-zinc-200">{fullTitle.audios}</p>
                  </div>
                )}

                <div className="rounded-xl bg-zinc-800/50 p-4">
                  <label className="mb-2 flex items-center gap-2 text-xs font-bold uppercase tracking-wide text-zinc-500">
                    <Subtitles className="h-4 w-4" /> Subtitles
                  </label>
                  {subsLoading ? (
                    <p className="flex items-center gap-2 text-sm text-zinc-400">
                      <Loader2 className="h-4 w-4 animate-spin" /> Resolving…
                    </p>
                  ) : (
                    <select
                      value={subtitle}
                      onChange={(e) => setSubtitle(e.target.value)}
                      className="w-full rounded-lg bg-zinc-950 border border-zinc-700 px-3 py-2 text-sm text-white focus:border-red-600 focus:outline-none"
                    >
                      <option>Off</option>
                      <option>Auto</option>
                      {subtitles.map((s) => (
                        <option key={s.url} value={s.url}>
                          {s.name}
                        </option>
                      ))}
                    </select>
                  )}
                  {subtitles.length === 0 && !subsLoading && (
                    <p className="mt-1 text-xs text-zinc-500">No external subtitles found for this release</p>
                  )}
                </div>
              </div>

              {/* Season + Episodes — real backend data */}
              {isSeries && seasons.length > 0 && (
                <div className="space-y-4">
                  <div className="flex items-center justify-between">
                    <h3 className="text-lg font-bold text-white flex items-center gap-2">
                      <Calendar className="h-5 w-5 text-red-500" />
                      Episodes
                    </h3>
                    <select
                      value={activeSeasonNumber}
                      onChange={(e) => {
                        setSeason(Number(e.target.value));
                        setShowAllEpisodes(false);
                      }}
                      className="rounded-lg bg-zinc-800 border border-zinc-700 px-3 py-1.5 text-sm text-white focus:border-red-600 focus:outline-none"
                    >
                      {seasons.map((s) => (
                        <option key={s.number} value={s.number}>
                          Season {s.number}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div className="space-y-2">
                    {episodes.length === 0 ? (
                      <p className="rounded-xl bg-zinc-800/30 p-4 text-sm text-zinc-500">
                        No episode metadata returned by the provider for this season.
                      </p>
                    ) : (
                      episodes.slice(0, showAllEpisodes ? undefined : 12).map((ep) => (
                        <div
                          key={ep.number}
                          className="group flex items-center gap-4 rounded-xl bg-zinc-800/30 p-3 hover:bg-zinc-800/60 transition-colors"
                        >
                          <span className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full bg-zinc-800 text-sm font-bold text-zinc-400 group-hover:bg-red-600 group-hover:text-white transition-colors">
                            {ep.number}
                          </span>
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-semibold text-white truncate">
                              {ep.title || `Episode ${ep.number}`}
                            </p>
                          </div>
                          <button
                            onClick={() => onPlay(ft, activeSeasonNumber, ep.number)}
                            disabled={isAddon}
                            className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full bg-white/10 text-white opacity-0 group-hover:opacity-100 transition-opacity hover:bg-white/20 disabled:cursor-not-allowed"
                          >
                            <Play className="h-4 w-4 fill-white" />
                          </button>
                        </div>
                      ))
                    )}
                  </div>

                  {episodes.length > 12 && (
                    <button
                      onClick={() => setShowAllEpisodes(!showAllEpisodes)}
                      className="flex w-full items-center justify-center gap-1 rounded-lg bg-zinc-800/50 py-2 text-sm font-medium text-zinc-300 hover:bg-zinc-800 transition-colors"
                    >
                      {showAllEpisodes ? "Show Less" : `Show All ${episodes.length} Episodes`}
                      <ChevronDown className={`h-4 w-4 transition-transform ${showAllEpisodes ? "rotate-180" : ""}`} />
                    </button>
                  )}
                </div>
              )}

              {/* Download options */}
              <div className="rounded-xl bg-zinc-800/30 p-4 space-y-3">
                <h3 className="text-sm font-bold uppercase tracking-wide text-zinc-500">Download Options</h3>
                <div className="flex flex-wrap gap-2">
                  <button
                    onClick={() => setDownloadMode("single")}
                    className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                      downloadMode === "single" ? "bg-red-600 text-white" : "bg-zinc-800 text-zinc-300 hover:bg-zinc-700"
                    }`}
                  >
                    {isSeries ? "Single Episode" : "This Movie"}
                  </button>
                  {isSeries && (
                    <button
                      onClick={() => setDownloadMode("season")}
                      className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                        downloadMode === "season" ? "bg-red-600 text-white" : "bg-zinc-800 text-zinc-300 hover:bg-zinc-700"
                      }`}
                    >
                      Entire Season
                    </button>
                  )}
                </div>
                <p className="text-xs text-zinc-500">
                  Downloads run through the MovieBox-TUI download engine (HTTP range resume, cancel supported).
                </p>
              </div>

              {/* Cast / Info — only fields the backend provided */}
              {((fullTitle?.cast && fullTitle.cast.length > 0) || fullTitle?.director || (fullTitle?.genres && fullTitle.genres.length > 0)) && (
                <div className="grid gap-4 border-t border-zinc-800 pt-6 text-sm text-zinc-400 sm:grid-cols-2">
                  {fullTitle?.cast && fullTitle.cast.length > 0 && (
                    <div>
                      <span className="font-semibold text-zinc-200">Cast:</span> {fullTitle.cast.join(", ")}
                    </div>
                  )}
                  {fullTitle?.director && (
                    <div>
                      <span className="font-semibold text-zinc-200">Director:</span> {fullTitle.director}
                    </div>
                  )}
                  {fullTitle?.genres && fullTitle.genres.length > 0 && (
                    <div>
                      <span className="font-semibold text-zinc-200">Genres:</span> {fullTitle.genres.join(", ")}
                    </div>
                  )}
                </div>
              )}
            </div>
          </>
        )}

        {/* Toast */}
        <AnimatePresence>
          {toast && (
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 20 }}
              className="absolute bottom-6 left-1/2 -translate-x-1/2 flex items-center gap-2 rounded-full bg-green-600 px-4 py-2 text-sm font-semibold text-white shadow-lg"
            >
              <CheckCircle2 className="h-4 w-4" />
              {toast}
            </motion.div>
          )}
        </AnimatePresence>
      </motion.div>
    </div>
  );
}
