import { motion, AnimatePresence } from "framer-motion";
import { Search, X, ArrowRight, Clock, TrendingUp, AlertTriangle } from "lucide-react";
import { useEffect, useState } from "react";
import { api, ApiError } from "../api/client";
import { catalogToTitle, PROVIDER_LABELS, type Title } from "../api/types";
import { useDebounce } from "../hooks/useDebounce";
import RemoteImage from "./RemoteImage";
import BackendState from "./BackendState";

interface SearchOverlayProps {
  open: boolean;
  onClose: () => void;
  onSelect: (title: Title) => void;
}

const KEYWORD_HINTS = ["action", "sci-fi", "anime", "thriller", "drama", "horror"];
const RECENT_KEY = "moviera.recent.searches";

function readRecent(): string[] {
  try {
    return JSON.parse(localStorage.getItem(RECENT_KEY) ?? "[]") as string[];
  } catch {
    return [];
  }
}

function pushRecent(q: string) {
  try {
    const next = [q, ...readRecent().filter((s) => s !== q)].slice(0, 8);
    localStorage.setItem(RECENT_KEY, JSON.stringify(next));
  } catch {
    /* ignore */
  }
}

/** Real MovieBox-TUI search: debounced query → adapter → providers → results. */
export default function SearchOverlay({ open, onClose, onSelect }: SearchOverlayProps) {
  const [query, setQuery] = useState("");
  const debounced = useDebounce(query, 350);
  const [recent, setRecent] = useState<string[]>(readRecent());
  const [results, setResults] = useState<Title[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [nonce, setNonce] = useState(0);

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

  useEffect(() => {
    if (open) setQuery("");
  }, [open]);

  useEffect(() => {
    const q = debounced.trim();
    if (!q) {
      setResults(null);
      setLoading(false);
      setError(null);
      return;
    }
    let alive = true;
    setLoading(true);
    setError(null);
    api
      .search(q, "all", 0)
      .then((r) => {
        if (!alive) return;
        const seen = new Set<string>();
        const titles: Title[] = [];
        for (const item of r.items) {
          const id = `${item.id.provider}:${item.id.value}`;
          if (seen.has(id)) continue;
          seen.add(id);
          titles.push(catalogToTitle(item));
        }
        setResults(titles.slice(0, 24));
        setLoading(false);
        pushRecent(q);
        setRecent(readRecent());
      })
      .catch((e: unknown) => {
        if (!alive) return;
        setError(e instanceof ApiError ? e.message : String(e));
        setLoading(false);
      });
    return () => {
      alive = false;
    };
  }, [debounced, open, nonce]);

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-[90] bg-black/95 backdrop-blur-xl"
        >
          <div className="mx-auto max-h-full max-w-4xl overflow-y-auto px-4 py-8 md:py-12 no-scrollbar">
            <div className="flex items-center gap-4 border-b border-zinc-800 pb-4">
              <Search className="h-7 w-7 text-zinc-500" />
              <input
                autoFocus
                type="text"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search movies, series and anime…"
                className="flex-1 bg-transparent text-2xl md:text-4xl font-bold text-white placeholder-zinc-700 focus:outline-none"
              />
              <button
                onClick={onClose}
                className="flex h-10 w-10 items-center justify-center rounded-full text-zinc-500 hover:bg-white/10 hover:text-white transition-colors"
              >
                <X className="h-6 w-6" />
              </button>
            </div>

            {query.trim() === "" ? (
              <div className="mt-8 grid gap-8 md:grid-cols-2">
                {recent.length > 0 && (
                  <div>
                    <h3 className="mb-4 flex items-center gap-2 text-sm font-bold uppercase tracking-wide text-zinc-500">
                      <Clock className="h-4 w-4" /> Recent Searches
                    </h3>
                    <div className="flex flex-wrap gap-2">
                      {recent.map((s) => (
                        <button
                          key={s}
                          onClick={() => setQuery(s)}
                          className="rounded-full bg-zinc-900 px-4 py-2 text-sm text-zinc-300 hover:bg-zinc-800 hover:text-white transition-colors"
                        >
                          {s}
                        </button>
                      ))}
                    </div>
                  </div>
                )}
                <div>
                  <h3 className="mb-4 flex items-center gap-2 text-sm font-bold uppercase tracking-wide text-zinc-500">
                    <TrendingUp className="h-4 w-4" /> Try Searching
                  </h3>
                  <div className="flex flex-wrap gap-2">
                    {KEYWORD_HINTS.map((s) => (
                      <button
                        key={s}
                        onClick={() => setQuery(s)}
                        className="rounded-full bg-zinc-900 px-4 py-2 text-sm text-zinc-300 hover:bg-zinc-800 hover:text-white transition-colors"
                      >
                        {s}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            ) : loading ? (
              <div className="mt-16">
                <BackendState state="loading" message={`Searching MovieBox-TUI providers for “${query}”…`} />
              </div>
            ) : error ? (
              <div className="mt-16">
                <BackendState state="error" error={error} onRetry={() => setNonce((n) => n + 1)} />
              </div>
            ) : results && results.length === 0 ? (
              <div className="mt-16 text-center text-zinc-500">
                <AlertTriangle className="mx-auto mb-3 h-8 w-8 text-zinc-600" />
                <p className="text-lg">No results for “{query}”</p>
                <p className="text-sm mt-2">Try a different keyword or check your spelling.</p>
              </div>
            ) : (
              <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {results?.map((t, idx) => (
                  <motion.button
                    key={t.id}
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: idx * 0.02 }}
                    onClick={() => {
                      onSelect(t);
                      onClose();
                    }}
                    className="flex items-center gap-4 rounded-xl bg-zinc-900/60 p-3 text-left hover:bg-zinc-800 transition-colors group"
                  >
                    <div className={`h-20 w-14 flex-shrink-0 rounded-lg overflow-hidden bg-gradient-to-br ${t.posterGradient}`}>
                      <RemoteImage
                        src={t.heroImage}
                        alt={t.title}
                        fallbackClassName={`bg-gradient-to-br ${t.posterGradient}`}
                        className="h-full w-full object-cover opacity-70 group-hover:opacity-100 transition-opacity"
                      />
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="font-bold text-white truncate">{t.title}</p>
                      <p className="text-xs text-zinc-500">
                        {[t.year, t.type, PROVIDER_LABELS[t.provider as keyof typeof PROVIDER_LABELS] ?? t.provider]
                          .filter(Boolean)
                          .join(" • ")}
                      </p>
                    </div>
                    <ArrowRight className="h-5 w-5 flex-shrink-0 text-zinc-600 group-hover:text-white transition-colors" />
                  </motion.button>
                ))}
              </div>
            )}
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
