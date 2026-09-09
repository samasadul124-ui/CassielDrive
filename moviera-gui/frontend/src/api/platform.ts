/**
 * Platform abstraction between the shared React UI and the platform host.
 *
 *  - Desktop (Tauri/Linux): the Tauri shell spawns the moviera-adapter
 *    (MovieBox-TUI core) and can launch the local player (mpv/VLC).
 *  - Web (browser dev): the Vite dev proxy forwards /api to the adapter at
 *    127.0.0.1:8787, which you start separately (`cargo run -p moviera-adapter`).
 *  - Android (Tauri Android / WebView): no local mpv — playback happens in the
 *    WebView (HTML5 video) using the same resolved stream URL.
 */

declare global {
  interface Window {
    __TAURI_INTERNALS__?: unknown;
    __TAURI__?: {
      core?: {
        invoke: <T = unknown>(cmd: string, args?: Record<string, unknown>) => Promise<T>;
      };
    };
  }
}

export function isTauri(): boolean {
  return typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;
}

export function isAndroid(): boolean {
  return typeof navigator !== "undefined" && /Android/i.test(navigator.userAgent);
}

/** Desktop = Tauri host that can spawn a native player. */
export function canLaunchNativePlayer(): boolean {
  return isTauri() && !isAndroid();
}

/**
 * Resolve the adapter base URL.
 *  - VITE_API_BASE env var wins (explicit override).
 *  - Tauri: ask the shell for the URL of the adapter it spawned.
 *  - Web: relative "" → same origin (Vite dev proxy → 127.0.0.1:8787).
 */
export async function getApiBase(): Promise<string> {
  const envBase = (import.meta.env.VITE_API_BASE as string | undefined) ?? "";
  if (envBase.trim()) return envBase.trim().replace(/\/+$/, "");
  if (isTauri()) {
    try {
      const invoke = window.__TAURI__?.core?.invoke;
      if (invoke) {
        const url = await invoke<string>("adapter_url");
        if (url) return url.replace(/\/+$/, "");
      }
    } catch {
      /* fall through to default */
    }
    return "http://127.0.0.1:8787";
  }
  return "";
}

/**
 * Launch the stream in the platform-appropriate player.
 * Desktop (Tauri): asks the shell to spawn the detected local player with the
 * exact MovieBox-TUI command line (mpv with auth headers).
 * Web/Android: returns "webview" — the UI plays inline via <video> when the
 * stream allows it, otherwise shows the command to run locally.
 */
export async function playExternal(
  url: string,
  headers: [string, string][],
  subtitle?: string | null,
): Promise<string> {
  if (canLaunchNativePlayer()) {
    try {
      const invoke = window.__TAURI__?.core?.invoke;
      if (!invoke) throw new Error("Tauri API unavailable");
      const label = await invoke<string>("play_external", {
        url,
        headers,
        subtitle: subtitle ?? null,
      });
      return label || "local player";
    } catch (e) {
      throw new Error(`failed to launch local player: ${String(e)}`);
    }
  }
  return "webview";
}
