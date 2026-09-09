import { useCallback, useEffect, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import Navbar from "./components/Navbar";
import Hero from "./components/Hero";
import ContentRow from "./components/ContentRow";
import DetailModal from "./components/DetailModal";
import PlayerModal from "./components/PlayerModal";
import DownloadsPanel from "./components/DownloadsPanel";
import SettingsPanel from "./components/SettingsPanel";
import LiveTVGrid from "./components/LiveTVGrid";
import AddonGrid from "./components/AddonGrid";
import SearchOverlay from "./components/SearchOverlay";
import Footer from "./components/Footer";
import { api } from "./api/client";
import { canLaunchNativePlayer, playExternal } from "./api/platform";
import { catalogToTitle } from "./api/types";
import type { CatalogItem, PlaybackSource, Title } from "./api/types";

/**
 * App shell. All content is fetched from the moviera-adapter (MovieBox-TUI
 * core) — no static catalog is used in production.
 */

interface RowSpec {
  key: string;
  label: string;
  tab: string;
  typeFilter?: "movie" | "series";
  size?: "normal" | "large";
}

interface RowState {
  key: string;
  label: string;
  size: "normal" | "large";
  items: CatalogItem[];
}

const HOME_ROWS: RowSpec[] = [
  { key: "trending", label: "Trending Now", tab: "trending" },
  { key: "popular", label: "Popular Movies", tab: "popular" },
  { key: "top", label: "Top Rated", tab: "top_rated" },
  { key: "anime", label: "Anime Picks", tab: "anime", size: "large" },
  { key: "latest", label: "Latest Releases", tab: "latest" },
];

const TAB_ROWS: Record<string, RowSpec[]> = {
  home: HOME_ROWS,
  movies: [
    { key: "m-popular", label: "Popular Movies", tab: "popular", typeFilter: "movie" },
    { key: "m-latest", label: "New Movies", tab: "latest", typeFilter: "movie" },
    { key: "m-top", label: "Top Rated Movies", tab: "top_rated", typeFilter: "movie" },
  ],
  series: [
    { key: "s-popular", label: "Popular Series", tab: "popular", typeFilter: "series" },
    { key: "s-latest", label: "New Series", tab: "latest", typeFilter: "series" },
    { key: "s-top", label: "Top Rated Series", tab: "top_rated", typeFilter: "series" },
  ],
  anime: [
    { key: "a-anime", label: "Anime", tab: "anime", typeFilter: "series", size: "large" },
    { key: "a-latest", label: "Latest Anime", tab: "latest", typeFilter: "series", size: "large" },
  ],
};

export default function App() {
  const [activeTab, setActiveTab] = useState("home");
  const [backendOnline, setBackendOnline] = useState<boolean | null>(null);

  const [rows, setRows] = useState<RowState[]>([]);
  const [rowsLoading, setRowsLoading] = useState(true);
  const [rowsError, setRowsError] = useState<string | null>(null);
  const [rowsNonce, setRowsNonce] = useState(0);

  const [selectedTitle, setSelectedTitle] = useState<Title | null>(null);
  const [detailOpen, setDetailOpen] = useState(false);
  const [playerTitle, setPlayerTitle] = useState<Title | null>(null);
  const [playerOpen, setPlayerOpen] = useState(false);
  const [playerLoading, setPlayerLoading] = useState(false);
  const [playerSource, setPlayerSource] = useState<PlaybackSource | null>(null);
  const [playerLaunched, setPlayerLaunched] = useState(false);
  const [playerLabel, setPlayerLabel] = useState("");
  const [playerError, setPlayerError] = useState<string | null>(null);
  const [playerNonce, setPlayerNonce] = useState(0);
  const [downloadsOpen, setDownloadsOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [language, setLanguage] = useState("en");
  const [toast, setToast] = useState<string | null>(null);
  const [intro, setIntro] = useState(true);

  useEffect(() => {
    const t = setTimeout(() => setIntro(false), 2200);
    return () => clearTimeout(t);
  }, []);

  const showToast = useCallback((msg: string) => {
    setToast(msg);
    window.setTimeout(() => setToast(null), 3200);
  }, []);

  // ---- home / tab rows from the backend ------------------------------------
  const spec = TAB_ROWS[activeTab] ?? HOME_ROWS;

  useEffect(() => {
    let alive = true;
    setRowsLoading(true);
    setRowsError(null);
    setRows([]);
    Promise.allSettled(spec.map((s) => api.home(s.tab, 0))).then((results) => {
      if (!alive) return;
      const next: RowState[] = [];
      results.forEach((r, i) => {
        const s = spec[i];
        if (r.status === "fulfilled" && r.value.items.length > 0) {
          let items = r.value.items;
          if (s.typeFilter) items = items.filter((it) => it.media_type === s.typeFilter);
          if (items.length > 0) {
            next.push({ key: s.key, label: s.label, size: s.size ?? "normal", items });
          }
        }
      });
      setRows(next);
      setRowsLoading(false);
      if (next.length === 0) {
        setRowsError(
          "The MovieBox backend returned no content for this view. Check your connection and backend status, then retry.",
        );
      }
    });
    return () => {
      alive = false;
    };
  }, [activeTab, rowsNonce, spec]);

  // ---- backend status --------------------------------------------------------
  useEffect(() => {
    api
      .health()
      .then((h) => setBackendOnline(Boolean(h.ok)))
      .catch(() => setBackendOnline(false));
  }, [rowsNonce, activeTab]);

  const heroTitles: Title[] = rows[0]?.items.map((it) => catalogToTitle(it, rows[0]?.key === "anime" ? "anime" : undefined)) ?? [];

  // ---- playback ---------------------------------------------------------------
  const startPlayback = useCallback(async (title: Title, season: number, episode: number) => {
    setPlayerTitle(title);
    setPlayerOpen(true);
    setDetailOpen(false);
    setPlayerLoading(true);
    setPlayerSource(null);
    setPlayerLaunched(false);
    setPlayerLabel("");
    setPlayerError(null);
    try {
      if (title.type === "live" && title.streamUrl) {
        if (canLaunchNativePlayer()) {
          const label = await playExternal(title.streamUrl, []);
          setPlayerLaunched(true);
          setPlayerLabel(label);
        } else {
          setPlayerSource({
            provider: "live-tv",
            url: title.streamUrl,
            headers: [],
            label: title.title,
            quality: null,
            codec: null,
            size_bytes: null,
            resource_id: null,
          });
        }
      } else {
        const native = canLaunchNativePlayer();
        const res = await api.play({
          provider: title.provider,
          id: title.backendId,
          title: title.title,
          season,
          episode,
          auto_launch: native,
        });
        setPlayerSource(res.source);
        setPlayerLaunched(res.launched);
        setPlayerLabel(res.player);
        if (native && !res.launched) {
          setPlayerError(res.launch_note || "Could not launch a local player");
        }
      }
    } catch (e) {
      setPlayerError(e instanceof Error ? e.message : String(e));
    } finally {
      setPlayerLoading(false);
    }
  }, []);

  const handlePlay = useCallback(
    (title: Title, season?: number, episode?: number) => {
      const isSeries = title.type === "series" || title.type === "anime";
      const s = season ?? (isSeries ? 1 : 0);
      const e = episode ?? (isSeries ? 1 : 0);
      void startPlayback(title, s, e);
    },
    [startPlayback],
  );

  const handleDetails = useCallback((title: Title) => {
    setSelectedTitle(title);
    setDetailOpen(true);
  }, []);

  // ---- downloads -----------------------------------------------------------------
  const startDownload = useCallback(
    async (title: Title, season: number, episode: number, silent = false) => {
      try {
        await api.startDownload({
          provider: title.provider,
          id: title.backendId,
          title: title.title,
          season,
          episode,
        });
        if (!silent) showToast(`Download started: ${title.title}`);
        return true;
      } catch (e) {
        if (!silent) showToast(`Download failed: ${e instanceof Error ? e.message : String(e)}`);
        return false;
      }
    },
    [showToast],
  );

  const handleDownload = useCallback(
    (title: Title, season?: number, episode?: number) => {
      const isSeries = title.type === "series" || title.type === "anime";
      const s = season ?? (isSeries ? 1 : 0);
      const e = episode ?? (isSeries ? 1 : 0);
      void (async () => {
        const ok = await startDownload(title, s, e);
        if (ok) setDownloadsOpen(true);
      })();
    },
    [startDownload],
  );

  /** Season download: one real backend task per episode (capped). */
  const handleDownloadSeason = useCallback(
    async (title: Title, season: number, episodeNumbers: number[]) => {
      const capped = episodeNumbers.slice(0, 30);
      let started = 0;
      for (const ep of capped) {
        const ok = await startDownload(title, season, ep, true);
        if (ok) started += 1;
      }
      if (started > 0) {
        showToast(`Season ${season}: ${started} episode${started > 1 ? "s" : ""} queued to download`);
        setDownloadsOpen(true);
      } else {
        showToast("Could not start any downloads for this season");
      }
    },
    [startDownload, showToast],
  );

  const retryPlayback = useCallback(() => {
    if (playerTitle) {
      setPlayerNonce((n) => n + 1);
    }
  }, [playerTitle]);

  useEffect(() => {
    if (playerOpen && playerNonce > 0 && playerTitle) {
      const isSeries = playerTitle.type === "series" || playerTitle.type === "anime";
      void startPlayback(playerTitle, isSeries ? 1 : 0, isSeries ? 1 : 0);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [playerNonce]);

  return (
    <div className="min-h-screen bg-black text-white overflow-x-hidden">
      {/* Intro splash */}
      <AnimatePresence>
        {intro && (
          <motion.div
            initial={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.8 }}
            className="fixed inset-0 z-[300] flex items-center justify-center bg-black"
          >
            <motion.div
              initial={{ scale: 0.8, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 1.1, opacity: 0 }}
              transition={{ duration: 0.6 }}
              className="flex flex-col items-center gap-4"
            >
              <div className="h-20 w-20 rounded-2xl bg-gradient-to-br from-red-600 to-red-800 flex items-center justify-center shadow-2xl shadow-red-900/50 pulse-glow">
                <svg className="h-10 w-10 text-white" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
                  <rect x="2" y="4" width="20" height="16" rx="2" />
                  <path d="M10 4v4" />
                  <path d="M2 8h20" />
                </svg>
              </div>
              <h1 className="text-3xl font-black tracking-tighter text-white">MovieBox</h1>
              <p className="text-xs uppercase tracking-[0.3em] text-zinc-500">GUI for MovieBox-TUI</p>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      <Navbar
        activeTab={activeTab}
        setActiveTab={setActiveTab}
        searchOpen={searchOpen}
        setSearchOpen={setSearchOpen}
        onOpenSettings={() => setSettingsOpen(true)}
        onOpenDownloads={() => setDownloadsOpen(true)}
        language={language}
        setLanguage={setLanguage}
        backendOnline={backendOnline}
      />

      {/* Toast */}
      <AnimatePresence>
        {toast && (
          <motion.div
            initial={{ opacity: 0, y: 30 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 30 }}
            className="fixed bottom-6 left-1/2 z-[400] -translate-x-1/2 rounded-full bg-zinc-800 px-5 py-2.5 text-sm font-semibold text-white shadow-2xl border border-white/10 max-w-[90vw]"
          >
            {toast}
          </motion.div>
        )}
      </AnimatePresence>

      <main className="pt-0">
        <AnimatePresence mode="wait">
          <motion.div
            key={activeTab}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.3 }}
          >
            {activeTab === "live" ? (
              <LiveTVGrid onPlay={(t) => handlePlay(t)} />
            ) : activeTab === "addons" ? (
              <AddonGrid
                onSelect={(t) => {
                  setSelectedTitle(t);
                  setDetailOpen(true);
                }}
              />
            ) : (
              <>
                {activeTab === "home" && (
                  <Hero
                    titles={heroTitles}
                    loading={rowsLoading}
                    onPlay={handlePlay}
                    onDetails={handleDetails}
                    onDownload={handleDownload}
                  />
                )}
                {activeTab !== "home" && (
                  <div className="bg-gradient-to-b from-zinc-900 to-black px-4 md:px-8 pt-28 pb-6">
                    <h1 className="text-3xl md:text-4xl font-black tracking-tight">{activeTab}</h1>
                    <p className="text-sm text-zinc-500 mt-1">Live from MovieBox-TUI providers</p>
                  </div>
                )}

                {rowsLoading && (
                  <div className="space-y-10 py-8">
                    {[0, 1, 2].map((i) => (
                      <div key={i} className="mx-auto max-w-[1920px] px-4 md:px-8">
                        <div className="mb-4 h-6 w-48 animate-pulse rounded bg-zinc-800" />
                        <div className="flex gap-4 overflow-hidden">
                          {Array.from({ length: 8 }).map((_, j) => (
                            <div key={j} className="h-64 w-44 md:w-56 flex-shrink-0 animate-pulse rounded-xl bg-zinc-800/70" />
                          ))}
                        </div>
                      </div>
                    ))}
                  </div>
                )}

                {!rowsLoading && rowsError && (
                  <div className="mx-auto max-w-xl px-4 py-24 text-center">
                    <p className="text-lg font-bold text-white mb-2">Backend content unavailable</p>
                    <p className="text-sm text-zinc-400 mb-4">{rowsError}</p>
                    <button
                      onClick={() => setRowsNonce((n) => n + 1)}
                      className="rounded-full bg-red-600 px-6 py-2.5 text-sm font-bold text-white hover:bg-red-500 transition-colors"
                    >
                      Retry
                    </button>
                    {backendOnline === false && (
                      <p className="mt-4 text-xs text-zinc-500">
                        The MovieBox-TUI adapter does not appear to be running.
                      </p>
                    )}
                  </div>
                )}

                {!rowsLoading &&
                  rows.map((row, idx) => (
                    <ContentRow
                      key={row.key}
                      title={row.label}
                      items={row.items.map((it) =>
                        catalogToTitle(it, row.key.includes("anime") ? "anime" : undefined),
                      )}
                      onPlay={handlePlay}
                      onDetails={handleDetails}
                      onDownload={handleDownload}
                      size={row.size}
                      delay={idx * 0.05}
                    />
                  ))}
              </>
            )}
          </motion.div>
        </AnimatePresence>
      </main>

      <Footer />

      {/* Modals */}
      <DetailModal
        title={selectedTitle}
        open={detailOpen}
        onClose={() => setDetailOpen(false)}
        onPlay={handlePlay}
        onDownload={handleDownload}
        onDownloadSeason={handleDownloadSeason}
      />
      <PlayerModal
        title={playerTitle}
        open={playerOpen}
        loading={playerLoading}
        source={playerSource}
        launched={playerLaunched}
        player={playerLabel}
        error={playerError}
        onClose={() => {
          setPlayerOpen(false);
          setPlayerNonce(0);
        }}
        onRetry={retryPlayback}
      />
      <DownloadsPanel open={downloadsOpen} onClose={() => setDownloadsOpen(false)} />
      <SettingsPanel open={settingsOpen} onClose={() => setSettingsOpen(false)} />
      <SearchOverlay
        open={searchOpen}
        onClose={() => setSearchOpen(false)}
        onSelect={handleDetails}
      />
    </div>
  );
}
