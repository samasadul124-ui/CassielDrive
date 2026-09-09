import { motion, AnimatePresence } from "framer-motion";
import { X, Save, Globe, Cpu, FolderOpen, CheckCircle2, Loader2 } from "lucide-react";
import { useEffect, useState } from "react";
import { api } from "../api/client";
import { useAsync } from "../api/hooks";
import { PROVIDER_KEYS, PROVIDER_LABELS, type BackendSettings } from "../api/types";
import { LANGUAGES } from "../data/mockData";
import BackendState from "./BackendState";

interface SettingsPanelProps {
  open: boolean;
  onClose: () => void;
}

/**
 * Settings panel.
 *  - "Backend" section: real MovieBox-TUI Config values (player, download
 *    directory, provider, feature toggles) persisted via config::save.
 *  - "Interface" section: GUI-only preferences (UI language).
 */
export default function SettingsPanel({ open, onClose }: SettingsPanelProps) {
  const { data, loading, error, retry } = useAsync(() => api.settings(), [open]);

  const [defaultPlayer, setDefaultPlayer] = useState<string>("");
  const [downloadDir, setDownloadDir] = useState<string>("");
  const [activeProvider, setActiveProvider] = useState<string>("moviebox");
  const [streamingEnabled, setStreamingEnabled] = useState(true);
  const [tvEnabled, setTvEnabled] = useState(true);
  const [addonsEnabled, setAddonsEnabled] = useState(false);
  const [bdixEnabled, setBdixEnabled] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [language, setLanguage] = useState("en");

  useEffect(() => {
    const s: BackendSettings | null = data;
    if (s) {
      setDefaultPlayer(s.config.default_player ?? "");
      setDownloadDir(s.config.download_dir ?? "");
      setActiveProvider(s.config.active_provider ?? "moviebox");
      setStreamingEnabled(s.config.streaming_enabled);
      setTvEnabled(s.config.tv_enabled);
      setAddonsEnabled(s.config.addons_enabled);
      setBdixEnabled(s.config.bdix_enabled);
    }
  }, [data]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    if (open) {
      document.body.style.overflow = "hidden";
      window.addEventListener("keydown", onKey);
    }
    return () => {
      document.body.style.overflow = "";
      window.removeEventListener("keydown", onKey);
    };
  }, [open, onClose]);

  const save = async () => {
    setSaving(true);
    setSaveError(null);
    setSaved(false);
    try {
      await api.saveSettings({
        default_player: defaultPlayer,
        download_dir: downloadDir,
        active_provider: activeProvider,
        streaming_enabled: streamingEnabled,
        tv_enabled: tvEnabled,
        addons_enabled: addonsEnabled,
        bdix_enabled: bdixEnabled,
      });
      setSaved(true);
      window.setTimeout(() => setSaved(false), 2500);
    } catch (e) {
      setSaveError(e instanceof Error ? e.message : String(e));
    } finally {
      setSaving(false);
    }
  };

  if (!open) return null;

  const players = data?.players ?? [];
  const activeLang = LANGUAGES.find((l) => l.code === language) || LANGUAGES[0];

  return (
    <div className="fixed inset-0 z-[110] flex justify-end">
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        onClick={onClose}
        className="absolute inset-0 bg-black/60 backdrop-blur-sm"
      />
      <motion.div
        initial={{ x: "100%" }}
        animate={{ x: 0 }}
        exit={{ x: "100%" }}
        transition={{ type: "spring", stiffness: 300, damping: 30 }}
        className="relative z-10 w-full max-w-md bg-zinc-900 shadow-2xl flex flex-col"
      >
        <div className="flex items-center justify-between border-b border-zinc-800 p-5">
          <h2 className="text-xl font-bold text-white">Settings</h2>
          <button
            onClick={onClose}
            className="flex h-9 w-9 items-center justify-center rounded-full text-zinc-400 hover:bg-white/10 hover:text-white transition-colors"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-5 space-y-6 no-scrollbar">
          {loading ? (
            <BackendState state="loading" message="Loading MovieBox-TUI settings…" className="h-48" />
          ) : error ? (
            <BackendState state="error" error={error} onRetry={retry} className="h-48" />
          ) : (
            <>
              <section>
                <h3 className="mb-3 flex items-center gap-2 text-xs font-bold uppercase tracking-wide text-zinc-500">
                  <Cpu className="h-4 w-4" /> Backend — MovieBox-TUI
                </h3>
                <div className="space-y-4">
                  <div>
                    <label className="mb-1.5 block text-sm font-medium text-zinc-300">Default player</label>
                    <select
                      value={defaultPlayer}
                      onChange={(e) => setDefaultPlayer(e.target.value)}
                      className="w-full rounded-lg bg-zinc-950 border border-zinc-700 px-3 py-2.5 text-sm text-white focus:border-red-600 focus:outline-none"
                    >
                      <option value="">Auto-detect</option>
                      {players.map((p) => (
                        <option key={p} value={p}>
                          {p}
                        </option>
                      ))}
                    </select>
                    <p className="mt-1 text-xs text-zinc-500">
                      Detected on this machine: {players.length ? players.join(", ") : "none"}
                    </p>
                  </div>

                  <div>
                    <label className="mb-1.5 block text-sm font-medium text-zinc-300">Download directory</label>
                    <input
                      value={downloadDir}
                      onChange={(e) => setDownloadDir(e.target.value)}
                      placeholder="(default: your Downloads folder)"
                      className="w-full rounded-lg bg-zinc-950 border border-zinc-700 px-3 py-2.5 text-sm text-white placeholder-zinc-600 focus:border-red-600 focus:outline-none"
                    />
                    <p className="mt-1 flex items-center gap-1.5 text-xs text-zinc-500">
                      <FolderOpen className="h-3 w-3" />
                      Resolves to: <span className="truncate">{data?.download_dir ?? "—"}</span>
                    </p>
                  </div>

                  <div>
                    <label className="mb-1.5 block text-sm font-medium text-zinc-300">Active provider</label>
                    <select
                      value={activeProvider}
                      onChange={(e) => setActiveProvider(e.target.value)}
                      className="w-full rounded-lg bg-zinc-950 border border-zinc-700 px-3 py-2.5 text-sm text-white focus:border-red-600 focus:outline-none"
                    >
                      {PROVIDER_KEYS.map((k) => (
                        <option key={k} value={k}>
                          {PROVIDER_LABELS[k]}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    {(
                      [
                        ["Streaming", streamingEnabled, setStreamingEnabled],
                        ["Live TV", tvEnabled, setTvEnabled],
                        ["Addons", addonsEnabled, setAddonsEnabled],
                        ["BDIX providers", bdixEnabled, setBdixEnabled],
                      ] as const
                    ).map(([label, value, setter]) => (
                      <button
                        key={label}
                        onClick={() => setter(!value)}
                        className={`flex items-center justify-between rounded-xl border px-3.5 py-3 text-sm font-medium transition-colors ${
                          value
                            ? "border-red-600/50 bg-red-600/10 text-white"
                            : "border-zinc-700 bg-zinc-800/50 text-zinc-400"
                        }`}
                      >
                        {label}
                        <span
                          className={`h-2.5 w-2.5 rounded-full ${value ? "bg-red-500" : "bg-zinc-600"}`}
                        />
                      </button>
                    ))}
                  </div>
                </div>
              </section>

              <section>
                <h3 className="mb-3 flex items-center gap-2 text-xs font-bold uppercase tracking-wide text-zinc-500">
                  <Globe className="h-4 w-4" /> Interface — GUI only
                </h3>
                <div>
                  <label className="mb-1.5 block text-sm font-medium text-zinc-300">UI language</label>
                  <div className="flex flex-wrap gap-2">
                    {LANGUAGES.map((l) => (
                      <button
                        key={l.code}
                        onClick={() => setLanguage(l.code)}
                        className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                          language === l.code ? "bg-red-600 text-white" : "bg-zinc-800 text-zinc-400 hover:bg-zinc-700"
                        }`}
                      >
                        {l.flag} {l.name}
                      </button>
                    ))}
                  </div>
                  <p className="mt-1.5 text-xs text-zinc-500">
                    {activeLang.name} — interface preference only (content language depends on the provider).
                  </p>
                </div>
              </section>
            </>
          )}
        </div>

        {/* Footer */}
        <div className="border-t border-zinc-800 p-4 space-y-2">
          {saveError && <p className="text-xs text-red-400">{saveError}</p>}
          <AnimatePresence>
            {saved && (
              <motion.p
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="flex items-center gap-1.5 text-xs text-green-400"
              >
                <CheckCircle2 className="h-3.5 w-3.5" /> Saved to MovieBox-TUI config
              </motion.p>
            )}
          </AnimatePresence>
          <button
            onClick={save}
            disabled={saving || loading || Boolean(error)}
            className="flex w-full items-center justify-center gap-2 rounded-lg bg-red-600 py-2.5 text-sm font-bold text-white hover:bg-red-500 transition-colors disabled:opacity-40"
          >
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
            Save backend settings
          </button>
        </div>
      </motion.div>
    </div>
  );
}
