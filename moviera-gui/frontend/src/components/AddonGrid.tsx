import { motion } from "framer-motion";
import { Puzzle, Plus, Trash2, Search, Loader2, Power, ChevronDown } from "lucide-react";
import { useState } from "react";
import { api } from "../api/client";
import { useAsync } from "../api/hooks";
import {
  gradientFor,
  makeTitleId,
  type AddonMetaItem,
  type InstalledAddon,
  type Title,
} from "../api/types";
import RemoteImage from "./RemoteImage";
import BackendState from "./BackendState";

interface AddonGridProps {
  onSelect: (title: Title) => void;
}

interface SearchSlot {
  loading: boolean;
  error: string | null;
  items: AddonMetaItem[];
}

/** Real MovieBox-TUI addon registry: install / enable / remove / search. */
export default function AddonGrid({ onSelect }: AddonGridProps) {
  const { data, loading, error, retry, setData } = useAsync(() => api.addons(), []);
  const [installUrl, setInstallUrl] = useState("");
  const [busy, setBusy] = useState(false);
  const [installError, setInstallError] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [slot, setSlot] = useState<SearchSlot | null>(null);

  const addons: InstalledAddon[] = data?.addons ?? [];

  const install = async () => {
    if (!installUrl.trim() || busy) return;
    setBusy(true);
    setInstallError(null);
    try {
      const r = await api.addonInstall(installUrl.trim(), true);
      setData({ addons: r.addons });
      setInstallUrl("");
    } catch (e) {
      setInstallError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  const remove = async (url: string) => {
    try {
      const r = await api.addonRemove(url);
      setData({ addons: r.addons });
    } catch (e) {
      setInstallError(e instanceof Error ? e.message : String(e));
    }
  };

  const toggle = async (a: InstalledAddon) => {
    try {
      const r = await api.addonSetEnabled(a.manifest_url, !a.enabled);
      setData({ addons: r.addons });
    } catch (e) {
      setInstallError(e instanceof Error ? e.message : String(e));
    }
  };

  const runSearch = async (a: InstalledAddon) => {
    if (!query.trim()) return;
    setSlot({ loading: true, error: null, items: [] });
    try {
      const type = a.types.includes("series") ? "series" : "movie";
      const r = await api.addonSearch(a.manifest_url, query.trim(), type);
      setSlot({ loading: false, error: null, items: r.items.slice(0, 30) });
    } catch (e) {
      setSlot({ loading: false, error: e instanceof Error ? e.message : String(e), items: [] });
    }
  };

  const metaToTitle = (item: AddonMetaItem, addonName: string): Title => ({
    id: makeTitleId("addons", item.id),
    provider: "addons",
    backendId: item.id,
    title: item.name || item.id,
    type: item.type === "series" ? "series" : "movie",
    description: item.description || item.overview || undefined,
    genres: [],
    languages: [],
    providers: [addonName],
    heroImage: item.poster || item.cover || undefined,
    posterGradient: gradientFor(item.id),
  });

  return (
    <div className="min-h-screen pt-28 pb-16">
      <div className="mx-auto max-w-[1920px] px-4 md:px-8">
        <div className="mb-6">
          <h1 className="flex items-center gap-3 text-3xl font-black tracking-tight">
            <Puzzle className="h-8 w-8 text-red-500" /> Addons
          </h1>
          <p className="mt-1 text-sm text-zinc-500">
            MovieBox-TUI addon registry — install manifests, then browse or search their catalogs.
          </p>
        </div>

        {/* Install */}
        <div className="mb-8 flex flex-col gap-2 md:flex-row md:items-center">
          <input
            value={installUrl}
            onChange={(e) => setInstallUrl(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && install()}
            placeholder="https://…/manifest.json"
            className="w-full md:max-w-md rounded-lg bg-zinc-950 border border-zinc-800 px-3 py-2.5 text-sm text-white placeholder-zinc-600 focus:border-red-600 focus:outline-none"
          />
          <button
            onClick={install}
            disabled={busy || !installUrl.trim()}
            className="flex items-center gap-2 rounded-lg bg-red-600 px-5 py-2.5 text-sm font-bold text-white hover:bg-red-500 transition-colors disabled:opacity-40 flex-shrink-0"
          >
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
            Install addon
          </button>
        </div>
        {installError && <p className="mb-4 text-sm text-red-400">{installError}</p>}

        {loading ? (
          <BackendState state="loading" className="h-48" message="Loading addons from MovieBox-TUI config…" />
        ) : error ? (
          <BackendState state="error" error={error} onRetry={retry} className="h-48" />
        ) : addons.length === 0 ? (
          <BackendState state="empty" className="h-48" message="No addons installed yet. Add a manifest URL above." />
        ) : (
          <div className="grid gap-4 md:grid-cols-2">
            {addons.map((a) => (
              <div key={a.manifest_url} className="rounded-2xl border border-zinc-800 bg-zinc-900/60 p-5">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <h3 className="text-lg font-bold text-white truncate">{a.name}</h3>
                    <p className="text-xs text-zinc-500">
                      {a.version ? `v${a.version} • ` : ""}
                      {[a.provides_catalog && "catalog", a.provides_meta && "meta", a.provides_stream && "stream"]
                        .filter(Boolean)
                        .join(" • ") || "addon"}
                    </p>
                    {a.description && <p className="mt-2 text-sm text-zinc-400 line-clamp-2">{a.description}</p>}
                  </div>
                  <div className="flex items-center gap-1 flex-shrink-0">
                    <button
                      onClick={() => toggle(a)}
                      title={a.enabled ? "Disable addon" : "Enable addon"}
                      className={`p-2 rounded-full transition-colors ${
                        a.enabled
                          ? "bg-green-500/15 text-green-400 hover:bg-green-500/25"
                          : "bg-zinc-800 text-zinc-500 hover:text-white"
                      }`}
                    >
                      <Power className="h-4 w-4" />
                    </button>
                    <button
                      onClick={() => remove(a.manifest_url)}
                      title="Remove addon"
                      className="p-2 rounded-full text-zinc-500 hover:bg-red-500/15 hover:text-red-400 transition-colors"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                </div>

                <button
                  onClick={() => {
                    setExpanded(expanded === a.manifest_url ? null : a.manifest_url);
                    setSlot(null);
                    setQuery("");
                  }}
                  className="mt-4 flex items-center gap-1 text-sm font-semibold text-zinc-300 hover:text-white transition-colors"
                >
                  Search this addon
                  <ChevronDown className={`h-4 w-4 transition-transform ${expanded === a.manifest_url ? "rotate-180" : ""}`} />
                </button>

                {expanded === a.manifest_url && (
                  <div className="mt-3 space-y-3">
                    <div className="flex gap-2">
                      <input
                        value={query}
                        onChange={(e) => setQuery(e.target.value)}
                        onKeyDown={(e) => e.key === "Enter" && a.enabled && runSearch(a)}
                        placeholder="Search inside this addon…"
                        disabled={!a.enabled}
                        className="flex-1 rounded-lg bg-zinc-950 border border-zinc-800 px-3 py-2 text-sm text-white placeholder-zinc-600 focus:border-red-600 focus:outline-none disabled:opacity-40"
                      />
                      <button
                        onClick={() => runSearch(a)}
                        disabled={!a.enabled || !query.trim() || slot?.loading}
                        className="flex items-center gap-2 rounded-lg bg-white/10 px-4 py-2 text-sm font-bold text-white hover:bg-white/20 transition-colors disabled:opacity-40"
                      >
                        {slot?.loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}
                      </button>
                    </div>
                    {!a.enabled && (
                      <p className="text-xs text-zinc-500">Enable the addon to search it.</p>
                    )}
                    {slot?.error && <p className="text-sm text-red-400">{slot.error}</p>}
                    {slot && !slot.loading && !slot.error && slot.items.length === 0 && (
                      <p className="text-sm text-zinc-500">No results.</p>
                    )}
                    {slot && slot.items.length > 0 && (
                      <div className="grid grid-cols-3 gap-3 sm:grid-cols-4">
                        {slot.items.map((m) => (
                          <motion.button
                            key={m.id}
                            whileHover={{ scale: 1.04 }}
                            onClick={() => onSelect(metaToTitle(m, a.name))}
                            className="group overflow-hidden rounded-lg bg-zinc-900 border border-zinc-800 hover:border-white/20 transition-colors"
                          >
                            <div className={`aspect-[2/3] w-full bg-gradient-to-br ${gradientFor(m.id)} overflow-hidden`}>
                              <RemoteImage
                                src={m.poster || m.cover}
                                alt={m.name}
                                fallbackClassName={`bg-gradient-to-br ${gradientFor(m.id)}`}
                                className="h-full w-full object-cover"
                              />
                            </div>
                            <p className="truncate p-2 text-xs font-semibold text-white">{m.name}</p>
                          </motion.button>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
