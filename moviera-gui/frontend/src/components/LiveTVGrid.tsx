import { motion } from "framer-motion";
import { Tv, Play, Loader2, AlertTriangle, RefreshCw } from "lucide-react";
import { useState } from "react";
import { api } from "../api/client";
import { useAsync } from "../api/hooks";
import { gradientFor, makeTitleId, type Title } from "../api/types";
import RemoteImage from "./RemoteImage";
import BackendState from "./BackendState";

interface LiveTVGridProps {
  onPlay: (title: Title) => void;
}

/**
 * Live TV backed by the MovieBox-TUI tv config (channels loaded from a
 * user-supplied M3U/JSON playlist — the same file the TUI uses).
 * The backend has no EPG, so "now playing" is not shown.
 */
export default function LiveTVGrid({ onPlay }: LiveTVGridProps) {
  const { data, loading, error, retry } = useAsync(() => api.tvChannels(), []);
  const [url, setUrl] = useState("");
  const [busy, setBusy] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);

  const channels = data?.channels ?? [];
  const loaded = Boolean(data?.loaded && channels.length > 0);

  const loadPlaylist = async () => {
    if (!url.trim() || busy) return;
    setBusy(true);
    setLoadError(null);
    try {
      await api.tvLoad(url.trim());
      retry();
    } catch (e) {
      setLoadError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="min-h-screen pt-28 pb-16">
      <div className="mx-auto max-w-[1920px] px-4 md:px-8">
        <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
          <div>
            <h1 className="flex items-center gap-3 text-3xl font-black tracking-tight">
              <Tv className="h-8 w-8 text-red-500" /> Live TV
            </h1>
            <p className="mt-1 text-sm text-zinc-500">
              {loaded
                ? `${channels.length} channels from your MovieBox-TUI playlist`
                : "Load a playlist (M3U or JSON) to start watching"}
            </p>
          </div>
        </div>

        {loading ? (
          <BackendState state="loading" className="h-64" message="Loading channels from MovieBox-TUI config…" />
        ) : loaded ? (
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6">
            {channels.map((ch, idx) => {
              const title: Title = {
                id: makeTitleId("live", ch.id || String(idx)),
                provider: "live",
                backendId: ch.id || String(idx),
                title: ch.name,
                type: "live",
                genres: [],
                languages: [],
                providers: ["Live TV"],
                isLive: true,
                channel: ch.group || undefined,
                streamUrl: ch.stream_url,
                heroImage: ch.logo || undefined,
                posterGradient: gradientFor(ch.name || ch.id),
              };
              return (
                <motion.button
                  key={ch.id || idx}
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: Math.min(idx * 0.02, 0.4) }}
                  onClick={() => onPlay(title)}
                  className="group relative flex flex-col items-center gap-3 overflow-hidden rounded-xl bg-zinc-900/70 p-4 border border-zinc-800 hover:border-red-600/50 hover:bg-zinc-800/70 transition-colors"
                >
                  <span className="absolute top-2 left-2 flex items-center gap-1 rounded bg-red-600/90 px-1.5 py-0.5 text-[9px] font-bold text-white">
                    <span className="h-1 w-1 animate-pulse rounded-full bg-white" /> LIVE
                  </span>
                  <div className={`h-16 w-16 rounded-full overflow-hidden bg-gradient-to-br ${title.posterGradient} flex items-center justify-center`}>
                    <RemoteImage
                      src={ch.logo}
                      alt={ch.name}
                      fallbackClassName={`bg-gradient-to-br ${title.posterGradient}`}
                      className="h-full w-full object-cover"
                    >
                      <span className="text-lg font-black text-white/40">
                        {(ch.name || "?").slice(0, 1).toUpperCase()}
                      </span>
                    </RemoteImage>
                  </div>
                  <div className="text-center min-w-0 w-full">
                    <p className="truncate text-sm font-semibold text-white">{ch.name}</p>
                    {ch.group && <p className="truncate text-[11px] text-zinc-500">{ch.group}</p>}
                  </div>
                  <div className="flex h-8 w-8 items-center justify-center rounded-full bg-white/10 text-white opacity-0 group-hover:opacity-100 transition-opacity">
                    <Play className="h-4 w-4 fill-white" />
                  </div>
                </motion.button>
              );
            })}
          </div>
        ) : error ? (
          <BackendState state="error" error={error} onRetry={retry} className="h-64" />
        ) : (
          <div className="mx-auto max-w-xl rounded-2xl border border-zinc-800 bg-zinc-900/60 p-6 md:p-8">
            <h2 className="text-lg font-bold text-white">No TV playlist loaded yet</h2>
            <p className="mt-2 text-sm text-zinc-400">
              Paste a playlist URL (M3U / M3U8 or JSON channel list). It is parsed with the MovieBox-TUI
              M3U parser and stored in the MovieBox-TUI TV config, so the TUI and the GUI share the same channels.
            </p>
            <div className="mt-4 flex gap-2">
              <input
                value={url}
                onChange={(e) => setUrl(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && loadPlaylist()}
                placeholder="https://example.com/playlist.m3u"
                className="flex-1 rounded-lg bg-zinc-950 border border-zinc-700 px-3 py-2.5 text-sm text-white placeholder-zinc-600 focus:border-red-600 focus:outline-none"
              />
              <button
                onClick={loadPlaylist}
                disabled={busy || !url.trim()}
                className="flex items-center gap-2 rounded-lg bg-red-600 px-5 py-2.5 text-sm font-bold text-white hover:bg-red-500 transition-colors disabled:opacity-40"
              >
                {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Play className="h-4 w-4" />}
                Load
              </button>
            </div>
            {loadError && (
              <p className="mt-3 flex items-center gap-2 text-sm text-red-400">
                <AlertTriangle className="h-4 w-4" /> {loadError}
              </p>
            )}
            {error && (
              <button
                onClick={retry}
                className="mt-4 flex items-center gap-2 text-sm text-zinc-400 hover:text-white"
              >
                <RefreshCw className="h-4 w-4" /> Retry reading local config
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
