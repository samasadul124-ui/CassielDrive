/**
 * Strongly typed frontend models.
 *
 * Backend-facing types (CatalogItem, MediaDetails, Release, ...) mirror the
 * JSON produced by the moviera-adapter, which serializes the native
 * `moviebox_tui` (MovieBox-TUI) structs — so these are the real backend
 * shapes, not invented GUI models.
 *
 * `Title` is the GUI's application-level title model (same shape the
 * MOVIE-RAJA components always used), populated exclusively from backend data.
 */

export type ProviderKey =
  | "moviebox"
  | "fourkhdhub"
  | "bdix_circleftp"
  | "bdix_dhakaflix"
  | "addons";

export const PROVIDER_KEYS: ProviderKey[] = [
  "moviebox",
  "fourkhdhub",
  "bdix_circleftp",
  "bdix_dhakaflix",
];

export const PROVIDER_LABELS: Record<ProviderKey, string> = {
  moviebox: "MovieBox",
  fourkhdhub: "4KHDHub",
  bdix_circleftp: "CircleFTP (BDIX)",
  bdix_dhakaflix: "DhakaFlix (BDIX)",
  addons: "Addons",
};

// ----- raw backend models (as serialized by the adapter) -------------------

export interface ProviderMediaId {
  provider: string;
  value: string;
}

export interface CatalogItem {
  id: ProviderMediaId;
  title: string;
  media_type: "movie" | "series";
  year: string | null;
  poster_url: string | null;
  season_count: number | null;
}

export interface Episode {
  season: number;
  number: number;
  title: string | null;
}

export interface Season {
  number: number;
  episodes: Episode[];
}

export interface AudioTrackOption {
  subject_id: string;
  language: string;
  label: string;
}

export interface MediaDetails {
  id: ProviderMediaId;
  title: string;
  media_type: "movie" | "series";
  year: string | null;
  description: string | null;
  tagline: string | null;
  imdb_rating: string | null;
  director: string | null;
  stars: string | null;
  prints: string | null;
  audios: string | null;
  poster_url: string | null;
  duration: string | null;
  genres: string[];
  seasons: Season[];
  dubs: AudioTrackOption[];
}

export interface SourceMirror {
  label: string;
  resolver_url: string;
  headers: [string, string][];
  direct_file: boolean;
}

export interface Release {
  provider: string;
  filename: string;
  quality: string | null;
  codec: string | null;
  language: string | null;
  size_bytes: number | null;
  season: number | null;
  episode: number | null;
  mirrors: SourceMirror[];
  resource_id: string | null;
}

export interface SubtitleOption {
  name: string;
  url: string;
}

export interface PlaybackSource {
  provider: string;
  url: string;
  headers: [string, string][];
  label: string;
  quality: string | null;
  codec: string | null;
  size_bytes: number | null;
  resource_id: string | null;
}

export interface HomeSection {
  tab: string;
  page: number;
  items: CatalogItem[];
  metrics: Record<string, unknown>;
}

export interface SearchResult {
  provider: string;
  items: CatalogItem[];
  failures?: string[];
}

export interface PlayResponse {
  source: PlaybackSource;
  releases: Release[];
  launched: boolean;
  player: string;
  launch_note: string | null;
}

export interface LiveChannel {
  id: string;
  name: string;
  logo: string;
  group: string;
  stream_url: string;
}

export interface InstalledAddon {
  manifest_url: string;
  name: string;
  version: string | null;
  description: string | null;
  enabled: boolean;
  provides_catalog: boolean;
  provides_meta: boolean;
  provides_stream: boolean;
  id_prefixes: string[];
  types: string[];
}

export interface AddonMetaItem {
  id: string;
  type?: string;
  name: string;
  poster?: string | null;
  cover?: string | null;
  description?: string | null;
  overview?: string | null;
}

export type DownloadState =
  | "downloading"
  | "completed"
  | "failed"
  | "canceled";

export interface DownloadTask {
  id: string;
  title: string;
  provider: string;
  subject_id: string;
  season: number;
  episode: number;
  filename: string;
  url: string;
  destination: string;
  state: DownloadState;
  downloaded: number;
  total: number | null;
  bytes_per_second: number;
  error: string | null;
  started_at: number;
}

export interface BackendConfig {
  auto_update: boolean;
  last_update_check: number;
  active_mode: string;
  active_provider: string;
  active_theme: string;
  bdix_enabled: boolean;
  streaming_enabled: boolean;
  tv_enabled: boolean;
  addons_enabled: boolean;
  default_player: string | null;
  download_dir: string | null;
}

export interface BackendSettings {
  config: BackendConfig;
  players: string[];
  download_dir: string;
  capabilities: Record<string, unknown>;
}

export interface HealthInfo {
  ok: boolean;
  service: string;
  adapter_version: string;
  backend: string;
  players: string[];
  active_providers: string[];
  time: number;
}

// ----- GUI application model ------------------------------------------------

export type TitleType = "movie" | "series" | "anime" | "live";

export interface Title {
  /** `${providerKey}:${backendId}` */
  id: string;
  /** provider key, or "live" for Live TV channels */
  provider: string;
  backendId: string;
  title: string;
  type: TitleType;
  year?: string;
  /** 0..10 when the backend provides an IMDB rating */
  rating?: number;
  /** 0..100, derived from rating — 0/undefined means "unknown" (hidden in UI) */
  match?: number;
  description?: string;
  tagline?: string;
  duration?: string;
  seasons?: number;
  episodes?: number;
  genres: string[];
  language?: string;
  languages: string[];
  providers: string[];
  /** remote artwork returned by the backend/provider (poster or backdrop) */
  heroImage?: string;
  /** deterministic fallback gradient used only when remote artwork is missing */
  posterGradient: string;
  maturity?: string;
  isLive?: boolean;
  channel?: string;
  streamUrl?: string;
  cast?: string[];
  director?: string;
  imdb?: string;
  audios?: string;
  prints?: string;
}

const GRADIENTS = [
  "from-violet-900 via-fuchsia-900 to-black",
  "from-slate-900 via-blue-950 to-black",
  "from-amber-950 via-emerald-950 to-black",
  "from-indigo-950 via-purple-950 to-black",
  "from-red-950 via-zinc-900 to-black",
  "from-emerald-950 via-lime-950 to-black",
  "from-cyan-950 via-sky-950 to-black",
  "from-rose-950 via-slate-900 to-black",
];

export function gradientFor(seed: string): string {
  let h = 0;
  for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) >>> 0;
  return GRADIENTS[h % GRADIENTS.length];
}

export function splitTitleId(id: string): { provider: ProviderKey; backendId: string } {
  const idx = id.indexOf(":");
  if (idx <= 0) return { provider: "moviebox", backendId: id };
  const provider = id.slice(0, idx) as ProviderKey;
  return { provider, backendId: id.slice(idx + 1) };
}

export function makeTitleId(provider: string, backendId: string): string {
  return `${provider}:${backendId}`;
}

/** Map a backend catalog item to the GUI title model (no invented data). */
export function catalogToTitle(item: CatalogItem, category?: string): Title {
  const provider = (item.id.provider || "moviebox") as ProviderKey;
  const isSeries = item.media_type === "series";
  const type: TitleType =
    category === "anime" && isSeries ? "anime" : isSeries ? "series" : "movie";
  return {
    id: makeTitleId(provider, item.id.value),
    provider,
    backendId: item.id.value,
    title: item.title,
    type,
    year: item.year || undefined,
    genres: [],
    languages: [],
    providers: [PROVIDER_LABELS[provider] ?? provider],
    heroImage: item.poster_url || undefined,
    posterGradient: gradientFor(item.id.value + item.title),
    seasons: item.season_count ?? undefined,
  };
}

/** Merge full backend details into a title. */
export function detailsToTitle(base: Title, d: MediaDetails): Title {
  const rating = d.imdb_rating ? Math.min(10, Math.max(0, parseFloat(d.imdb_rating))) || undefined : undefined;
  return {
    ...base,
    title: d.title || base.title,
    type: d.media_type === "series" ? (base.type === "anime" ? "anime" : "series") : "movie",
    year: d.year || base.year,
    rating,
    match: rating ? Math.round(rating * 10) : base.match,
    description: d.description || undefined,
    tagline: d.tagline || undefined,
    duration: d.duration || undefined,
    genres: d.genres ?? [],
    imdb: d.imdb_rating || undefined,
    director: d.director || undefined,
    cast: d.stars ? d.stars.split(",").map((s) => s.trim()).filter(Boolean) : undefined,
    audios: d.audios || undefined,
    prints: d.prints || undefined,
    heroImage: d.poster_url || base.heroImage,
    seasons: d.seasons.length || base.seasons,
    languages: d.audios ? d.audios.split(",").map((s) => s.trim()).filter(Boolean) : base.languages,
  };
}
