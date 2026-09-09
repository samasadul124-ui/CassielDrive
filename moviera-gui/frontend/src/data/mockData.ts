/**
 * LEGACY MOCK DATA — kept only as reference / type examples.
 *
 * The production UI is fed exclusively by the MovieBox-TUI backend through
 * src/api (see src/api/client.ts, src/api/types.ts). The Title interface for
 * the running app lives in src/api/types.ts; the catalog arrays below
 * (HERO_TITLES, TRENDING, MOVIES, SERIES, ANIME, LIVE_TV, ADDONS, DOWNLOADS)
 * are NOT used by any production screen anymore. LANGUAGES remains in use for
 * the UI language preference only.
 */

export interface Title {
  id: string;
  title: string;
  tagline: string;
  description: string;
  type: "movie" | "series" | "anime" | "live";
  rating: number;
  year: number;
  duration?: string;
  seasons?: number;
  episodes?: number;
  genres: string[];
  language: string;
  languages: string[];
  providers: string[];
  heroImage: string;
  posterGradient: string;
  maturity: string;
  match: number;
  isLive?: boolean;
  channel?: string;
  nextAiring?: string;
  cast?: string[];
  director?: string;
}

export const HERO_TITLES: Title[] = [
  {
    id: "hero-1",
    title: "Neon Nights",
    tagline: "The future never sleeps.",
    description: "In a sprawling megacity where corporations rule and neon is the only light, a renegade hacker uncovers a conspiracy that could rewrite human consciousness.",
    type: "series",
    rating: 8.7,
    year: 2025,
    seasons: 2,
    episodes: 16,
    genres: ["Sci-Fi", "Cyberpunk", "Thriller"],
    language: "English",
    languages: ["English", "Español", "Français", "日本語", "العربية"],
    providers: ["MovieBox", "4KHDHub"],
    heroImage: "/images/hero-neon-nights.jpg",
    posterGradient: "from-violet-900 via-fuchsia-900 to-black",
    maturity: "18+",
    match: 98,
    cast: ["Maya Chen", "Jonas Reeves", "Lena Ortega"],
    director: "Ridley Villeneuve",
  },
  {
    id: "hero-2",
    title: "The Silent Frontier",
    tagline: "Beyond the edge of known space, something is listening.",
    description: "A deep-space salvage crew discovers an abandoned vessel orbiting a black hole—and wakes a force older than the stars.",
    type: "movie",
    rating: 8.4,
    year: 2025,
    duration: "2h 14m",
    genres: ["Sci-Fi", "Horror", "Mystery"],
    language: "English",
    languages: ["English", "Español", "Deutsch", "Italiano"],
    providers: ["MovieBox", "4KHDHub"],
    heroImage: "/images/hero-space-odyssey.jpg",
    posterGradient: "from-slate-900 via-blue-950 to-black",
    maturity: "16+",
    match: 95,
    cast: ["Amara Okafor", "Leo Park", "Sofia Bergström"],
    director: "Denis Nolan",
  },
  {
    id: "hero-3",
    title: "Iron Crown",
    tagline: "Kingdoms fall. Legends rise.",
    description: "When a usurper seizes the throne, a disgraced knight gathers an unlikely band of outcasts to reclaim a kingdom from darkness.",
    type: "series",
    rating: 8.9,
    year: 2024,
    seasons: 1,
    episodes: 10,
    genres: ["Fantasy", "Action", "Drama"],
    language: "English",
    languages: ["English", "Español", "Français", "हिन्दी"],
    providers: ["MovieBox"],
    heroImage: "/images/hero-medieval-epic.jpg",
    posterGradient: "from-amber-950 via-emerald-950 to-black",
    maturity: "16+",
    match: 97,
    cast: ["Henry Cavendish", "Yuki Tanaka", "Adebayo Jones"],
    director: "Peter Jackson-Wei",
  },
  {
    id: "hero-4",
    title: "Moonlit Blade",
    tagline: "Every soul has its shadow.",
    description: "A cursed swordsman wanders a land of spirits and warlords, seeking redemption while hunted by the very clan he once served.",
    type: "anime",
    rating: 9.1,
    year: 2025,
    seasons: 1,
    episodes: 24,
    genres: ["Anime", "Action", "Supernatural"],
    language: "Japanese",
    languages: ["Japanese", "English", "Español", "Português"],
    providers: ["MovieBox", "Addon"],
    heroImage: "/images/hero-anime-hero.jpg",
    posterGradient: "from-indigo-950 via-purple-950 to-black",
    maturity: "16+",
    match: 99,
    cast: ["Kenji Sato (CV)", "Hanae Natsuki", "Miyuki Sawashiro"],
    director: "Makoto Shinkai-Tanaka",
  },
  {
    id: "hero-5",
    title: "Crimson Rain",
    tagline: "Some storms never pass.",
    description: "A detective haunted by an unsolved case returns to her rain-soaked hometown when the killer resurfaces after twenty years.",
    type: "series",
    rating: 8.5,
    year: 2025,
    seasons: 1,
    episodes: 8,
    genres: ["Crime", "Thriller", "Noir"],
    language: "English",
    languages: ["English", "Español", "Français", "한국어"],
    providers: ["MovieBox", "4KHDHub"],
    heroImage: "/images/hero-crime-thriller.jpg",
    posterGradient: "from-red-950 via-zinc-900 to-black",
    maturity: "18+",
    match: 94,
    cast: ["Clara Dufresne", "Marcus Lee", "Ingrid Bergman Jr."],
    director: "David Fincher-Lee",
  },
  {
    id: "hero-6",
    title: "The Last Whisperwood",
    tagline: "Magic grows where courage dares.",
    description: "Three siblings discover a hidden grove where forgotten magic still lives—and must protect it from those who would harvest its power.",
    type: "movie",
    rating: 8.2,
    year: 2025,
    duration: "1h 58m",
    genres: ["Family", "Fantasy", "Adventure"],
    language: "English",
    languages: ["English", "Español", "Français", "中文"],
    providers: ["MovieBox"],
    heroImage: "/images/hero-family-adventure.jpg",
    posterGradient: "from-emerald-950 via-lime-950 to-black",
    maturity: "7+",
    match: 91,
    cast: ["Nora Bright", "Samuel Cole", "Aria Kim"],
    director: "Guillermo del Toro-Chen",
  },
];

export const TRENDING: Title[] = [
  HERO_TITLES[0],
  HERO_TITLES[3],
  {
    id: "t-1",
    title: "Velvet City",
    tagline: "Sin is just another transaction.",
    description: "In a city built on secrets, a casino hostess becomes the linchpin of a war between crime families.",
    type: "series",
    rating: 8.3,
    year: 2025,
    seasons: 1,
    episodes: 12,
    genres: ["Crime", "Drama"],
    language: "English",
    languages: ["English", "Español"],
    providers: ["MovieBox"],
    heroImage: "/images/hero-crime-thriller.jpg",
    posterGradient: "from-rose-950 via-purple-950 to-black",
    maturity: "18+",
    match: 89,
  },
  {
    id: "t-2",
    title: "Echoes of Mars",
    tagline: "The red planet keeps its dead.",
    description: "A colony on Mars goes dark. The rescue team finds the colony intact—but the colonists are no longer human.",
    type: "movie",
    rating: 7.9,
    year: 2025,
    duration: "2h 05m",
    genres: ["Sci-Fi", "Horror"],
    language: "English",
    languages: ["English", "Español", "Deutsch"],
    providers: ["4KHDHub"],
    heroImage: "/images/hero-space-odyssey.jpg",
    posterGradient: "from-orange-950 via-red-950 to-black",
    maturity: "16+",
    match: 86,
  },
  {
    id: "t-3",
    title: "King's Gambit",
    tagline: "Every throne is a trap.",
    description: "Political intrigue and poisoned chalices in a court where loyalty is the most dangerous currency.",
    type: "series",
    rating: 8.6,
    year: 2024,
    seasons: 2,
    episodes: 18,
    genres: ["Drama", "History"],
    language: "English",
    languages: ["English", "Français", "Español"],
    providers: ["MovieBox"],
    heroImage: "/images/hero-medieval-epic.jpg",
    posterGradient: "from-yellow-950 via-amber-950 to-black",
    maturity: "16+",
    match: 93,
  },
];

export const MOVIES: Title[] = [
  HERO_TITLES[1],
  HERO_TITLES[5],
  {
    id: "m-1",
    title: "Nightfall Protocol",
    tagline: "Trust is a weapon.",
    description: "An elite spy must betray her own agency to stop a global cyber-attack.",
    type: "movie",
    rating: 7.8,
    year: 2025,
    duration: "2h 01m",
    genres: ["Action", "Thriller"],
    language: "English",
    languages: ["English", "Español", "Français"],
    providers: ["MovieBox", "4KHDHub"],
    heroImage: "/images/hero-neon-nights.jpg",
    posterGradient: "from-cyan-950 via-slate-900 to-black",
    maturity: "16+",
    match: 87,
  },
  {
    id: "m-2",
    title: "The Lighthouse Keeper",
    tagline: "Isolation has teeth.",
    description: "Two keepers on a remote island discover their lighthouse hides an ancient hunger.",
    type: "movie",
    rating: 8.0,
    year: 2024,
    duration: "1h 52m",
    genres: ["Horror", "Mystery"],
    language: "English",
    languages: ["English", "Español"],
    providers: ["MovieBox"],
    heroImage: "/images/hero-space-odyssey.jpg",
    posterGradient: "from-slate-950 via-zinc-900 to-black",
    maturity: "18+",
    match: 88,
  },
  {
    id: "m-3",
    title: "Love in Kyoto",
    tagline: "Some meetings are fated.",
    description: "A heartbroken photographer finds new purpose—and maybe love—during cherry blossom season in Kyoto.",
    type: "movie",
    rating: 7.6,
    year: 2025,
    duration: "1h 45m",
    genres: ["Romance", "Drama"],
    language: "Japanese",
    languages: ["Japanese", "English", "한국어"],
    providers: ["MovieBox"],
    heroImage: "/images/hero-anime-hero.jpg",
    posterGradient: "from-pink-950 via-rose-900 to-black",
    maturity: "13+",
    match: 84,
  },
];

export const SERIES: Title[] = [
  HERO_TITLES[0],
  HERO_TITLES[2],
  HERO_TITLES[4],
  {
    id: "s-1",
    title: "The Boardroom",
    tagline: "Power is the original addiction.",
    description: "A tech empire's founding family tears itself apart over control of a revolutionary AI.",
    type: "series",
    rating: 8.4,
    year: 2025,
    seasons: 1,
    episodes: 10,
    genres: ["Drama", "Thriller"],
    language: "English",
    languages: ["English", "Español", "Français"],
    providers: ["MovieBox"],
    heroImage: "/images/hero-neon-nights.jpg",
    posterGradient: "from-zinc-900 via-neutral-900 to-black",
    maturity: "16+",
    match: 90,
  },
  {
    id: "s-2",
    title: "Campfire Legends",
    tagline: "Every town has its ghost story.",
    description: "Anthology series bringing the most haunting urban legends to life.",
    type: "series",
    rating: 7.7,
    year: 2024,
    seasons: 2,
    episodes: 14,
    genres: ["Horror", "Anthology"],
    language: "English",
    languages: ["English", "Español"],
    providers: ["MovieBox", "Addon"],
    heroImage: "/images/hero-crime-thriller.jpg",
    posterGradient: "from-stone-950 via-red-950 to-black",
    maturity: "18+",
    match: 85,
  },
];

export const ANIME: Title[] = [
  HERO_TITLES[3],
  {
    id: "a-1",
    title: "Starbound Academy",
    tagline: "Dream beyond the sky.",
    description: "Young pilots compete at an elite academy while an interstellar threat awakens.",
    type: "anime",
    rating: 8.0,
    year: 2025,
    seasons: 1,
    episodes: 13,
    genres: ["Anime", "Sci-Fi", "School"],
    language: "Japanese",
    languages: ["Japanese", "English", "Español"],
    providers: ["MovieBox", "Addon"],
    heroImage: "/images/hero-space-odyssey.jpg",
    posterGradient: "from-blue-950 via-indigo-900 to-black",
    maturity: "13+",
    match: 88,
  },
  {
    id: "a-2",
    title: "Culinary Wars",
    tagline: "The kitchen is a battlefield.",
    description: "Rival chefs clash in a tournament where flavor is the only weapon.",
    type: "anime",
    rating: 7.9,
    year: 2024,
    seasons: 3,
    episodes: 36,
    genres: ["Anime", "Comedy", "Competition"],
    language: "Japanese",
    languages: ["Japanese", "English"],
    providers: ["MovieBox"],
    heroImage: "/images/hero-family-adventure.jpg",
    posterGradient: "from-orange-950 via-yellow-900 to-black",
    maturity: "10+",
    match: 86,
  },
];

export const LIVE_TV = [
  { id: "live-1", name: "MovieBox News", category: "News", viewers: "1.2M", nowPlaying: "Global Headlines", isLive: true, gradient: "from-red-700 to-red-900" },
  { id: "live-2", name: "Sports One", category: "Sports", viewers: "3.8M", nowPlaying: "Champions League Final", isLive: true, gradient: "from-green-700 to-emerald-900" },
  { id: "live-3", name: "Anime Central", category: "Anime", viewers: "890K", nowPlaying: "Moonlit Blade — Episode 12", isLive: true, gradient: "from-purple-700 to-indigo-900" },
  { id: "live-4", name: "Cinema Classics", category: "Movies", viewers: "450K", nowPlaying: "Casablanca (1942)", isLive: true, gradient: "from-amber-700 to-orange-900" },
  { id: "live-5", name: "DocuWorld", category: "Documentary", viewers: "320K", nowPlaying: "Planet Earth: Oceans", isLive: true, gradient: "from-cyan-700 to-blue-900" },
  { id: "live-6", name: "Comedy Hub", category: "Comedy", viewers: "670K", nowPlaying: "Stand-Up Showcase", isLive: true, gradient: "from-pink-700 to-rose-900" },
];

export const ADDONS = [
  { id: "addon-1", name: "AnimeMatrix", description: "Latest anime simulcasts and classics.", rating: 4.8, installed: true },
  { id: "addon-2", name: "DocuStream", description: "Documentaries from around the world.", rating: 4.6, installed: false },
  { id: "addon-3", name: "RetroVault", description: "Classic movies and TV shows.", rating: 4.7, installed: true },
  { id: "addon-4", name: "SportsLive", description: "Live sports channels and replays.", rating: 4.5, installed: false },
  { id: "addon-5", name: "IndieScene", description: "Independent films and festival picks.", rating: 4.4, installed: false },
];

export const LANGUAGES = [
  { code: "en", name: "English", flag: "🇺🇸" },
  { code: "es", name: "Español", flag: "🇪🇸" },
  { code: "fr", name: "Français", flag: "🇫🇷" },
  { code: "de", name: "Deutsch", flag: "🇩🇪" },
  { code: "ja", name: "日本語", flag: "🇯🇵" },
  { code: "ko", name: "한국어", flag: "🇰🇷" },
  { code: "hi", name: "हिन्दी", flag: "🇮🇳" },
  { code: "ar", name: "العربية", flag: "🇸🇦" },
  { code: "pt", name: "Português", flag: "🇧🇷" },
  { code: "zh", name: "中文", flag: "🇨🇳" },
];

export const PROVIDERS = ["MovieBox", "4KHDHub", "BDIX", "Stremio Addons"];

export const SETTINGS = {
  player: "mpv",
  players: ["mpv", "VLC", "IINA"],
  downloadPath: "~/Downloads/MovieBox",
  quality: "1080p",
  qualities: ["4K", "1080p", "720p", "480p"],
  theme: "Dark",
  themes: ["Dark", "Midnight", "Catppuccin", "Nord", "TokyoNight"],
  autoSubtitles: true,
  subtitleLang: "English",
  resumePlayback: true,
  hardwareAcceleration: true,
};

export const DOWNLOADS = [
  { id: "dl-1", title: "Neon Nights S01E01", progress: 100, status: "completed", size: "1.2 GB", speed: "", eta: "" },
  { id: "dl-2", title: "The Silent Frontier", progress: 67, status: "downloading", size: "4.1 GB", speed: "12 MB/s", eta: "3 min" },
  { id: "dl-3", title: "Iron Crown S01", progress: 0, status: "queued", size: "8.4 GB", speed: "", eta: "" },
  { id: "dl-4", title: "Crimson Rain S01E03", progress: 100, status: "completed", size: "980 MB", speed: "", eta: "" },
];
