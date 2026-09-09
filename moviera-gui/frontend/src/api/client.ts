/**
 * Typed API client for the moviera-adapter (MovieBox-TUI core).
 * All backend interaction in the app goes through this module — React
 * components never talk to the backend directly.
 */
import { getApiBase } from "./platform";
import type {
  AddonMetaItem,
  BackendSettings,
  CatalogItem,
  DownloadTask,
  HealthInfo,
  HomeSection,
  InstalledAddon,
  LiveChannel,
  MediaDetails,
  PlayResponse,
  ProviderKey,
  Release,
  SearchResult,
  SubtitleOption,
} from "./types";

export class ApiError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.name = "ApiError";
    this.status = status;
  }
}

let basePromise: Promise<string> | null = null;

function apiBase(): Promise<string> {
  if (!basePromise) basePromise = getApiBase();
  return basePromise;
}

async function request<T>(path: string, init?: RequestInit, timeoutMs = 45000): Promise<T> {
  const base = await apiBase();
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(base + path, {
      ...init,
      signal: controller.signal,
      headers: {
        "Content-Type": "application/json",
        ...(init?.headers ?? {}),
      },
    });
    const text = await res.text();
    let data: unknown = null;
    if (text) {
      try {
        data = JSON.parse(text);
      } catch {
        data = { error: text.slice(0, 300) };
      }
    }
    if (!res.ok) {
      const msg =
        (data as { error?: string } | null)?.error ??
        (data as { message?: string } | null)?.message ??
        `backend returned HTTP ${res.status}`;
      throw new ApiError(msg, res.status);
    }
    return data as T;
  } catch (e) {
    if (e instanceof ApiError) throw e;
    if (e instanceof DOMException && e.name === "AbortError") {
      throw new ApiError("backend request timed out", 408);
    }
    // Network-level failure → backend unreachable (offline / not started)
    throw new ApiError("MovieBox backend is not reachable (is the adapter running?)", 0);
  } finally {
    clearTimeout(timer);
  }
}

const qs = (params: Record<string, string | number | undefined>) => {
  const u = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) {
    if (v !== undefined && v !== "") u.set(k, String(v));
  }
  const s = u.toString();
  return s ? `?${s}` : "";
};

export const api = {
  // --- system ---------------------------------------------------------------
  health: () =>
    request<HealthInfo>(
      "/api/health",
      undefined,
      4000,
    ).then((h) => h),

  // --- catalog ---------------------------------------------------------------
  home: (tab: string, page = 0) =>
    request<HomeSection>(`/api/home${qs({ tab, page })}`),

  search: (q: string, provider: ProviderKey | "all" = "all", page = 0) =>
    request<SearchResult>(`/api/search${qs({ q, provider, page })}`),

  details: (provider: string, id: string, withSubtitles = false, resourceId?: string) =>
    request<{ details: MediaDetails; subtitles: SubtitleOption[] }>(
      `/api/details/${encodeURIComponent(provider)}/${encodeURIComponent(id)}${qs({
        subtitles: withSubtitles ? "true" : undefined,
        resource_id: resourceId,
      })}`,
    ),

  streams: (
    provider: string,
    id: string,
    season = 0,
    episode = 0,
    resolution?: string,
  ) =>
    request<{ releases: Release[] }>(
      `/api/streams/${encodeURIComponent(provider)}/${encodeURIComponent(id)}${qs({
        season,
        episode,
        resolution,
      })}`,
    ),

  subtitles: (provider: string, id: string, resourceId: string) =>
    request<{ subtitles: SubtitleOption[] }>(
      `/api/subtitles/${encodeURIComponent(provider)}/${encodeURIComponent(id)}${qs({
        resource_id: resourceId,
      })}`,
    ),

  // --- playback ---------------------------------------------------------------
  play: (body: {
    provider?: string;
    id: string;
    title?: string;
    season?: number;
    episode?: number;
    resolution?: string;
    player?: string;
    auto_launch?: boolean;
  }) => request<PlayResponse>("/api/play", { method: "POST", body: JSON.stringify(body) }),

  // --- downloads --------------------------------------------------------------
  downloads: () => request<{ downloads: DownloadTask[] }>("/api/downloads"),

  startDownload: (body: {
    provider?: string;
    id: string;
    title?: string;
    season?: number;
    episode?: number;
    resolution?: string;
  }) =>
    request<{ id: string; destination: string }>(
      "/api/downloads/start",
      { method: "POST", body: JSON.stringify(body) },
      120000,
    ),

  cancelDownload: (id: string) =>
    request<{ id: string; canceled: boolean }>(
      `/api/downloads/cancel${qs({ id })}`,
      { method: "POST" },
    ),

  // --- live TV -----------------------------------------------------------------
  tvChannels: () =>
    request<{ channels: LiveChannel[]; loaded: boolean; file?: string }>(
      "/api/tv/channels",
    ),

  tvLoad: (url: string) =>
    request<{ channels: LiveChannel[]; count: number }>(
      "/api/tv/load",
      { method: "POST", body: JSON.stringify({ url }) },
      120000,
    ),

  // --- addons -------------------------------------------------------------------
  addons: () => request<{ addons: InstalledAddon[] }>("/api/addons"),

  addonInstall: (url: string, enabled = true) =>
    request<{ addons: InstalledAddon[] }>(
      "/api/addons/install",
      { method: "POST", body: JSON.stringify({ url, enabled }) },
      60000,
    ),

  addonRemove: (url: string) =>
    request<{ removed: number; addons: InstalledAddon[] }>(
      `/api/addons/remove${qs({ url })}`,
      { method: "POST" },
    ),

  addonSetEnabled: (url: string, enabled: boolean) =>
    request<{ addons: InstalledAddon[] }>(
      `/api/addons/set-enabled${qs({ url, enabled: String(enabled) })}`,
      { method: "POST" },
    ),

  addonManifest: (url: string) =>
    request<Record<string, unknown>>(`/api/addons/manifest${qs({ url })}`, undefined, 60000),

  addonCatalog: (manifest: string, type = "movie", catalog = "top") =>
    request<{ items: CatalogItem[] }>(
      `/api/addons/catalog${qs({ manifest, type, catalog })}`,
      undefined,
      60000,
    ),

  addonSearch: (manifest: string, q: string, type = "movie", catalog = "top") =>
    request<{ items: AddonMetaItem[] }>(
      `/api/addons/search${qs({ manifest, q, type, catalog })}`,
      undefined,
      60000,
    ),

  // --- settings -------------------------------------------------------------------
  settings: () => request<BackendSettings>("/api/settings"),

  saveSettings: (patch: Record<string, unknown>) =>
    request<{ config: BackendSettings["config"] }>(
      "/api/settings",
      { method: "PUT", body: JSON.stringify(patch) },
    ),
};
