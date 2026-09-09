import { Film, ExternalLink, Heart } from "lucide-react";

export default function Footer() {
  return (
    <footer className="mt-12 border-t border-zinc-900 bg-black py-12">
      <div className="mx-auto max-w-[1920px] px-4 md:px-8">
        <div className="flex flex-col items-start justify-between gap-8 md:flex-row">
          <div className="max-w-md">
            <div className="flex items-center gap-2 mb-4">
              <div className="h-8 w-8 rounded-lg bg-gradient-to-br from-red-600 to-red-800 flex items-center justify-center">
                <Film className="h-4 w-4 text-white" />
              </div>
              <span className="text-xl font-black tracking-tighter text-white">MovieBox</span>
            </div>
            <p className="text-sm leading-relaxed text-zinc-500">
              A polished, ad-free streaming frontend for the MovieBox-TUI backend. Browse movies, series, anime, and live TV with multi-language support and batch downloads.
            </p>
          </div>

          <div className="grid grid-cols-2 gap-8 sm:grid-cols-3">
            <div>
              <h4 className="mb-3 text-xs font-bold uppercase tracking-wide text-zinc-400">Browse</h4>
              <ul className="space-y-2 text-sm text-zinc-500">
                <li><button className="hover:text-white transition-colors">Home</button></li>
                <li><button className="hover:text-white transition-colors">Movies</button></li>
                <li><button className="hover:text-white transition-colors">Series</button></li>
                <li><button className="hover:text-white transition-colors">Anime</button></li>
              </ul>
            </div>
            <div>
              <h4 className="mb-3 text-xs font-bold uppercase tracking-wide text-zinc-400">Features</h4>
              <ul className="space-y-2 text-sm text-zinc-500">
                <li><button className="hover:text-white transition-colors">Live TV</button></li>
                <li><button className="hover:text-white transition-colors">Downloads</button></li>
                <li><button className="hover:text-white transition-colors">Addons</button></li>
                <li><button className="hover:text-white transition-colors">Settings</button></li>
              </ul>
            </div>
            <div>
              <h4 className="mb-3 text-xs font-bold uppercase tracking-wide text-zinc-400">Backend</h4>
              <ul className="space-y-2 text-sm text-zinc-500">
                <li>
                  <a href="https://github.com/mesamirh/MovieBox-TUI" target="_blank" rel="noreferrer" className="flex items-center gap-1.5 hover:text-white transition-colors">
                    <ExternalLink className="h-4 w-4" /> MovieBox-TUI
                  </a>
                </li>
                <li><a href="#" className="hover:text-white transition-colors flex items-center gap-1.5"><ExternalLink className="h-4 w-4" /> Updates</a></li>
              </ul>
            </div>
          </div>
        </div>

        <div className="mt-10 flex flex-col items-center justify-between gap-4 border-t border-zinc-900 pt-6 text-xs text-zinc-600 sm:flex-row">
          <p>© {new Date().getFullYear()} MovieBox. All rights reserved.</p>
          <p className="flex items-center gap-1">
            Built with <Heart className="h-3 w-3 text-red-600" /> for ad-free streaming.
          </p>
        </div>
      </div>
    </footer>
  );
}
