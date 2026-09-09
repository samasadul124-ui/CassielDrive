import { motion, AnimatePresence } from "framer-motion";
import { X, XCircle, FolderOpen, HardDrive, Download, Loader2 } from "lucide-react";
import { useEffect, useState } from "react";
import { api } from "../api/client";
import { isTauri } from "../api/platform";
import type { DownloadTask } from "../api/types";
import BackendState from "./BackendState";

interface DownloadsPanelProps {
  open: boolean;
  onClose: () => void;
}

function formatBytes(n: number | null | undefined): string {
  if (!n) return "";
  const units = ["B", "KB", "MB", "GB", "TB"];
  let i = 0;
  let v = n;
  while (v >= 1024 && i < units.length - 1) {
    v /= 1024;
    i++;
  }
  return `${v.toFixed(v >= 100 || i === 0 ? 0 : 1)} ${units[i]}`;
}

function formatSpeed(bps: number): string {
  if (!bps) return "";
  return `${formatBytes(bps)}/s`;
}

const STATE_LABEL: Record<string, { text: string; color: string }> = {
  downloading: { text: "Downloading", color: "text-blue-400" },
  completed: { text: "Completed", color: "text-green-400" },
  failed: { text: "Failed", color: "text-red-400" },
  canceled: { text: "Canceled", color: "text-zinc-400" },
};

/** Real downloads from the MovieBox-TUI download engine (progress/cancel/resume). */
export default function DownloadsPanel({ open, onClose }: DownloadsPanelProps) {
  const [downloads, setDownloads] = useState<DownloadTask[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [nonce, setNonce] = useState(0);

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

  // poll the backend task registry while open
  useEffect(() => {
    if (!open) return;
    let alive = true;
    const poll = async () => {
      try {
        const r = await api.downloads();
        if (!alive) return;
        setDownloads(r.downloads);
        setError(null);
        setLoading(false);
      } catch (e) {
        if (!alive) return;
        setError(e instanceof Error ? e.message : String(e));
        setLoading(false);
      }
    };
    void poll();
    const interval = setInterval(poll, 2500);
    return () => {
      alive = false;
      clearInterval(interval);
    };
  }, [open, nonce]);

  const cancel = async (id: string) => {
    try {
      await api.cancelDownload(id);
      setNonce((n) => n + 1);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  };

  const openFolder = () => {
    if (isTauri() && window.__TAURI__?.core?.invoke) {
      void window.__TAURI__.core.invoke("open_downloads_dir").catch(() => {});
    }
  };

  const list = downloads ?? [];
  const stats = {
    completed: list.filter((d) => d.state === "completed").length,
    active: list.filter((d) => d.state === "downloading").length,
    failed: list.filter((d) => d.state === "failed" || d.state === "canceled").length,
  };

  return (
    <AnimatePresence>
      {open && (
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
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-full bg-red-600/20 text-red-500">
                  <Download className="h-5 w-5" />
                </div>
                <div>
                  <h2 className="text-xl font-bold text-white">Downloads</h2>
                  <p className="text-xs text-zinc-500">MovieBox-TUI download engine</p>
                </div>
              </div>
              <button
                onClick={onClose}
                className="flex h-9 w-9 items-center justify-center rounded-full text-zinc-400 hover:bg-white/10 hover:text-white transition-colors"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            {/* Stats */}
            <div className="grid grid-cols-3 gap-2 border-b border-zinc-800 p-4">
              {[
                { label: "Active", value: stats.active },
                { label: "Completed", value: stats.completed },
                { label: "Stopped", value: stats.failed },
              ].map((s) => (
                <div key={s.label} className="rounded-xl bg-zinc-800/50 p-3 text-center">
                  <p className="text-lg font-bold text-white">{s.value}</p>
                  <p className="text-[10px] uppercase tracking-wide text-zinc-500">{s.label}</p>
                </div>
              ))}
            </div>

            {/* List */}
            <div className="flex-1 overflow-y-auto p-4 space-y-3 no-scrollbar">
              {loading ? (
                <BackendState state="loading" message="Loading download tasks…" className="h-48" />
              ) : error && list.length === 0 ? (
                <BackendState
                  state="error"
                  error={error}
                  onRetry={() => setNonce((n) => n + 1)}
                  className="h-48"
                />
              ) : list.length === 0 ? (
                <div className="flex h-48 flex-col items-center justify-center gap-3 text-zinc-500">
                  <HardDrive className="h-10 w-10 opacity-50" />
                  <p className="text-sm">No downloads yet</p>
                  <p className="text-xs text-zinc-600">Start a download from any title's details screen.</p>
                </div>
              ) : (
                list.map((d) => {
                  const meta = STATE_LABEL[d.state] ?? STATE_LABEL.downloading;
                  const pct = d.total ? Math.min(100, (d.downloaded / d.total) * 100) : 0;
                  return (
                    <motion.div layout key={d.id} className="rounded-xl bg-zinc-800/40 p-4 border border-zinc-800">
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0 flex-1">
                          <h3 className="truncate text-sm font-semibold text-white">
                            {d.title}
                            {d.season > 0 && d.episode > 0 ? ` S${String(d.season).padStart(2, "0")}E${String(d.episode).padStart(2, "0")}` : ""}
                          </h3>
                          <p className="mt-0.5 truncate text-xs text-zinc-500">
                            {d.filename}
                            {d.total ? ` • ${formatBytes(d.total)}` : ""}
                          </p>
                        </div>
                        <div className="flex items-center gap-1">
                          {d.state === "downloading" && (
                            <button
                              onClick={() => cancel(d.id)}
                              className="flex items-center gap-1 rounded-full bg-red-500/15 px-2.5 py-1 text-[11px] font-semibold text-red-300 hover:bg-red-500/30 transition-colors"
                              title="Cancel download"
                            >
                              <XCircle className="h-3.5 w-3.5" /> Cancel
                            </button>
                          )}
                        </div>
                      </div>

                      <div className="mt-3">
                        <div className="flex items-center justify-between text-xs mb-1.5">
                          <span className={`font-medium flex items-center gap-1.5 ${meta.color}`}>
                            {d.state === "downloading" && <Loader2 className="h-3 w-3 animate-spin" />}
                            {meta.text}
                          </span>
                          {d.total && <span className="text-zinc-500">{Math.round(pct)}%</span>}
                        </div>
                        <div className="h-1.5 w-full rounded-full bg-zinc-800 overflow-hidden">
                          <motion.div
                            initial={false}
                            animate={{ width: d.total ? `${pct}%` : "100%" }}
                            transition={{ duration: 0.6 }}
                            className={`h-full rounded-full ${
                              d.state === "completed"
                                ? "bg-green-500"
                                : d.state === "downloading"
                                  ? "bg-blue-500"
                                  : d.state === "failed"
                                    ? "bg-red-500"
                                    : "bg-zinc-600"
                            }`}
                          />
                        </div>
                        {d.state === "downloading" && (
                          <div className="mt-1.5 flex items-center justify-between text-[10px] text-zinc-500">
                            <span>{formatBytes(d.downloaded)}{d.total ? ` / ${formatBytes(d.total)}` : ""}</span>
                            <span>{formatSpeed(d.bytes_per_second)}</span>
                          </div>
                        )}
                        {d.error && <p className="mt-1.5 text-[11px] text-red-400/80">{d.error}</p>}
                      </div>
                    </motion.div>
                  );
                })
              )}
            </div>

            {/* Footer */}
            <div className="border-t border-zinc-800 p-4">
              <button
                onClick={openFolder}
                disabled={!isTauri()}
                title={isTauri() ? "Open the download directory" : "Available in the desktop app"}
                className="flex w-full items-center justify-center gap-2 rounded-lg bg-zinc-800 py-2.5 text-sm font-semibold text-zinc-300 hover:bg-zinc-700 transition-colors disabled:opacity-40 disabled:cursor-default"
              >
                <FolderOpen className="h-4 w-4" />
                Open Download Folder
              </button>
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}
