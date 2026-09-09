import { Loader2, AlertTriangle, RefreshCw, Inbox } from "lucide-react";

interface BackendStateProps {
  state: "loading" | "error" | "empty";
  error?: string | null;
  onRetry?: () => void;
  message?: string;
  className?: string;
}

/** Shared loading / error / empty UI for every backend-driven screen. */
export default function BackendState({ state, error, onRetry, message, className = "" }: BackendStateProps) {
  if (state === "loading") {
    return (
      <div className={`flex flex-col items-center justify-center gap-3 text-zinc-400 ${className}`}>
        <Loader2 className="h-8 w-8 animate-spin text-red-500" />
        <p className="text-sm">{message ?? "Loading from MovieBox-TUI backend…"}</p>
      </div>
    );
  }
  if (state === "error") {
    return (
      <div className={`flex flex-col items-center justify-center gap-3 text-center ${className}`}>
        <AlertTriangle className="h-8 w-8 text-red-500" />
        <p className="max-w-md text-sm text-zinc-300">{error ?? "The backend request failed."}</p>
        <p className="max-w-md text-xs text-zinc-500">
          Make sure the MovieBox-TUI adapter is running and you are online.
        </p>
        {onRetry && (
          <button
            onClick={onRetry}
            className="mt-1 flex items-center gap-2 rounded-full bg-white/10 px-4 py-2 text-sm font-semibold text-white hover:bg-white/20 transition-colors"
          >
            <RefreshCw className="h-4 w-4" /> Retry
          </button>
        )}
      </div>
    );
  }
  return (
    <div className={`flex flex-col items-center justify-center gap-3 text-zinc-500 ${className}`}>
      <Inbox className="h-8 w-8 opacity-60" />
      <p className="text-sm">{message ?? "Nothing here from the backend yet."}</p>
    </div>
  );
}
