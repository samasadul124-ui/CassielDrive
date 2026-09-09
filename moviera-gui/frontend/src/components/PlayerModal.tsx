import { motion } from "framer-motion";
import { X, CheckCircle2, Loader2, AlertTriangle, Copy, MonitorPlay } from "lucide-react";
import { useEffect, useState } from "react";
import type { PlaybackSource, Title } from "../api/types";
import RemoteImage from "./RemoteImage";
import BackendState from "./BackendState";

interface PlayerModalProps {
  title: Title | null;
  open: boolean;
  loading: boolean;
  source: PlaybackSource | null;
  launched: boolean;
  player: string;
  error: string | null;
  onClose: () => void;
  onRetry: () => void;
}

function buildMpvCommand(url: string, headers: [string, string][]): string {
  const parts = [`mpv`];
  for (const [k, v] of headers) parts.push(`--http-header-fields="${k}: ${v}"`);
  parts.push(`"${url}"`);
  return parts.join(" \\\n  ");
}

/**
 * Real player modal.
 *  - Desktop (Tauri): the MovieBox-TUI-resolved stream is launched in the
 *    local player (mpv/VLC) by the adapter/shell; we show the launch status.
 *  - Web / Android (WebView): the same stream URL is handed to the inline
 *    <video> element. Streams that require auth headers / cannot be embedded
 *    show a clear fallback with the exact local-player command.
 */
export default function PlayerModal({ title, open, loading, source, launched, player, error, onClose, onRetry }: PlayerModalProps) {
  const [videoFailed, setVideoFailed] = useState(false);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    setVideoFailed(false);
    setCopied(false);
  }, [open, source?.url]);

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

  const copyCmd = async () => {
    try {
      await navigator.clipboard.writeText(buildMpvCommand(source?.url ?? "", source?.headers ?? []));
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1500);
    } catch {
      /* clipboard unavailable */
    }
  };

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-[120] flex items-center justify-center bg-black/95"
    >
      <div className="relative w-full max-w-5xl h-full md:h-[85vh] md:rounded-2xl overflow-hidden flex flex-col">
        {/* header */}
        <div className="flex items-center justify-between border-b border-zinc-800/60 bg-zinc-950/80 px-5 py-3 backdrop-blur">
          <div className="min-w-0">
            <h3 className="truncate font-bold text-white">{title.title}</h3>
            {source && (
              <p className="truncate text-xs text-zinc-500">
                {[source.quality, source.codec, source.label].filter(Boolean).join(" • ")}
              </p>
            )}
          </div>
          <button
            onClick={onClose}
            className="flex h-9 w-9 items-center justify-center rounded-full text-zinc-400 hover:bg-white/10 hover:text-white transition-colors"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* body */}
        <div className="flex-1 flex items-center justify-center p-4">
          {loading ? (
            <div className="flex flex-col items-center gap-4 text-center">
              <Loader2 className="h-10 w-10 animate-spin text-red-500" />
              <p className="text-sm text-zinc-300">Resolving stream through MovieBox-TUI providers…</p>
              <p className="text-xs text-zinc-500">This queries the backend's provider/source resolution.</p>
            </div>
          ) : error ? (
            <div className="flex flex-col items-center gap-4 text-center max-w-md">
              <AlertTriangle className="h-10 w-10 text-red-500" />
              <p className="text-sm text-zinc-200">{error}</p>
              <div className="flex gap-3">
                <button
                  onClick={onRetry}
                  className="rounded-full bg-white px-5 py-2 text-sm font-bold text-black hover:bg-zinc-200 transition-colors"
                >
                  Retry
                </button>
                <button
                  onClick={onClose}
                  className="rounded-full bg-zinc-800 px-5 py-2 text-sm font-bold text-white hover:bg-zinc-700 transition-colors"
                >
                  Close
                </button>
              </div>
            </div>
          ) : launched ? (
            <div className="flex flex-col items-center gap-4 text-center max-w-md">
              <div className="flex h-16 w-16 items-center justify-center rounded-full bg-green-500/15">
                <CheckCircle2 className="h-9 w-9 text-green-400" />
              </div>
              <h4 className="text-xl font-bold">Playing in {player || "your local player"}</h4>
              <p className="text-sm text-zinc-400">
                The MovieBox-TUI backend resolved the stream and launched it with your local player.
                {source?.quality ? ` Quality: ${source.quality}.` : ""}
              </p>
              <button
                onClick={onClose}
                className="rounded-full bg-white px-6 py-2.5 text-sm font-bold text-black hover:bg-zinc-200 transition-colors"
              >
                Close
              </button>
            </div>
          ) : source ? (
            videoFailed ? (
              <div className="flex flex-col items-center gap-4 text-center max-w-2xl">
                <MonitorPlay className="h-10 w-10 text-zinc-400" />
                <h4 className="text-lg font-bold">This stream needs a local player</h4>
                <p className="text-sm text-zinc-400">
                  The provider stream cannot be embedded in the browser{source.headers.length ? " (authentication headers required)" : ""}.
                  Run this command on a machine with mpv installed:
                </p>
                <pre className="w-full overflow-x-auto rounded-xl bg-zinc-900 border border-zinc-800 p-4 text-left text-xs text-zinc-300">
                  {buildMpvCommand(source.url, source.headers)}
                </pre>
                <div className="flex gap-3">
                  <button
                    onClick={copyCmd}
                    className="flex items-center gap-2 rounded-full bg-white px-5 py-2 text-sm font-bold text-black hover:bg-zinc-200 transition-colors"
                  >
                    {copied ? <CheckCircle2 className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
                    {copied ? "Copied" : "Copy command"}
                  </button>
                  <button
                    onClick={onClose}
                    className="rounded-full bg-zinc-800 px-5 py-2 text-sm font-bold text-white hover:bg-zinc-700 transition-colors"
                  >
                    Close
                  </button>
                </div>
              </div>
            ) : (
              <div className="relative w-full">
                <video
                  key={source.url}
                  controls
                  autoPlay
                  playsInline
                  src={source.url}
                  onError={() => setVideoFailed(true)}
                  className="h-full w-full rounded-lg bg-black"
                />
                {title.heroImage && (
                  <RemoteImage
                    src={title.heroImage}
                    alt={title.title}
                    className="absolute -bottom-1 left-0 h-14 w-10 rounded object-cover opacity-80 hidden md:block"
                  />
                )}
              </div>
            )
          ) : (
            <BackendState state="error" error="No stream source available." onRetry={onRetry} />
          )}
        </div>
      </div>
    </motion.div>
  );
}
