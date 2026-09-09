import { motion, AnimatePresence } from "framer-motion";
import {
  Search,
  Bell,
  Download,
  Settings,
  Tv,
  Film,
  Clapperboard,
  Home,
  Menu,
  X,
  Globe,
  User,
  ChevronDown,
} from "lucide-react";
import { useState } from "react";
import { LANGUAGES } from "../data/mockData";
import { useScrollDirection } from "../hooks/useScrollDirection";

interface NavbarProps {
  activeTab: string;
  setActiveTab: (tab: string) => void;
  searchOpen: boolean;
  setSearchOpen: (open: boolean) => void;
  onOpenSettings: () => void;
  onOpenDownloads: () => void;
  language: string;
  setLanguage: (lang: string) => void;
  /** MovieBox-TUI adapter connectivity: true online, false offline, null checking */
  backendOnline?: boolean | null;
}

const TABS = [
  { id: "home", label: "Home", icon: Home },
  { id: "movies", label: "Movies", icon: Film },
  { id: "series", label: "Series", icon: Clapperboard },
  { id: "anime", label: "Anime", icon: Clapperboard },
  { id: "live", label: "Live TV", icon: Tv },
  { id: "addons", label: "Addons", icon: Globe },
];

export default function Navbar({
  activeTab,
  setActiveTab,
  searchOpen,
  setSearchOpen,
  onOpenSettings,
  onOpenDownloads,
  language,
  setLanguage,
  backendOnline,
}: NavbarProps) {
  const { scrollY } = useScrollDirection();
  const [mobileOpen, setMobileOpen] = useState(false);
  const [langOpen, setLangOpen] = useState(false);

  const activeLang = LANGUAGES.find((l) => l.code === language) || LANGUAGES[0];

  return (
    <>
      <motion.nav
        initial={{ y: -100 }}
        animate={{ y: 0 }}
        transition={{ duration: 0.5, ease: "easeOut" }}
        className={`fixed top-0 inset-x-0 z-50 transition-all duration-500 ${
          scrollY > 40 ? "bg-black/85 backdrop-blur-xl shadow-2xl shadow-black/40" : "bg-gradient-to-b from-black/80 to-transparent"
        }`}
      >
        <div className="mx-auto flex h-16 md:h-20 max-w-[1920px] items-center justify-between px-4 md:px-8">
          {/* Logo + Desktop Tabs */}
          <div className="flex items-center gap-6 md:gap-10">
            <button
              onClick={() => setActiveTab("home")}
              className="flex items-center gap-2 group"
            >
              <div className="h-9 w-9 md:h-10 md:w-10 rounded-lg bg-gradient-to-br from-red-600 to-red-800 flex items-center justify-center shadow-lg shadow-red-900/30 group-hover:shadow-red-600/40 transition-shadow">
                <Film className="h-5 w-5 md:h-6 md:w-6 text-white" />
              </div>
              <span className="text-xl md:text-2xl font-black tracking-tighter text-white">
                MovieBox
              </span>
              <span
                title={
                  backendOnline === null
                    ? "Checking MovieBox-TUI backend…"
                    : backendOnline
                      ? "MovieBox-TUI backend connected"
                      : "MovieBox-TUI backend offline"
                }
                className={`ml-1 h-2 w-2 rounded-full ${
                  backendOnline === null ? "bg-zinc-500" : backendOnline ? "bg-green-500" : "bg-red-500 animate-pulse"
                }`}
              />
            </button>

            <div className="hidden lg:flex items-center gap-1">
              {TABS.map((tab) => {
                const Icon = tab.icon;
                return (
                  <button
                    key={tab.id}
                    onClick={() => setActiveTab(tab.id)}
                    className={`relative flex items-center gap-2 px-4 py-2 text-sm font-medium transition-colors rounded-full ${
                      activeTab === tab.id ? "text-white" : "text-zinc-400 hover:text-white"
                    }`}
                  >
                    {activeTab === tab.id && (
                      <motion.div
                        layoutId="nav-pill"
                        className="absolute inset-0 bg-white/10 rounded-full"
                        transition={{ type: "spring", stiffness: 300, damping: 30 }}
                      />
                    )}
                    <span className="relative flex items-center gap-2">
                      <Icon className="h-4 w-4" />
                      {tab.label}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Actions */}
          <div className="flex items-center gap-1 md:gap-2">
            <button
              onClick={() => setSearchOpen(!searchOpen)}
              className={`p-2.5 rounded-full transition-colors ${searchOpen ? "bg-white/10 text-white" : "text-zinc-300 hover:text-white hover:bg-white/10"}`}
            >
              <Search className="h-5 w-5" />
            </button>

            <button
              onClick={onOpenDownloads}
              className="hidden sm:flex p-2.5 rounded-full text-zinc-300 hover:text-white hover:bg-white/10 transition-colors relative"
            >
              <Download className="h-5 w-5" />
              <span className="absolute top-1.5 right-1.5 h-2 w-2 rounded-full bg-red-500 animate-pulse" />
            </button>

            <button
              onClick={onOpenSettings}
              className="hidden sm:flex p-2.5 rounded-full text-zinc-300 hover:text-white hover:bg-white/10 transition-colors"
            >
              <Settings className="h-5 w-5" />
            </button>

            <button className="hidden sm:flex p-2.5 rounded-full text-zinc-300 hover:text-white hover:bg-white/10 transition-colors">
              <Bell className="h-5 w-5" />
            </button>

            {/* Language selector */}
            <div className="relative hidden md:block">
              <button
                onClick={() => setLangOpen(!langOpen)}
                className="flex items-center gap-2 px-3 py-1.5 rounded-full text-sm text-zinc-300 hover:text-white hover:bg-white/10 transition-colors"
              >
                <Globe className="h-4 w-4" />
                <span>{activeLang.flag}</span>
                <ChevronDown className={`h-3 w-3 transition-transform ${langOpen ? "rotate-180" : ""}`} />
              </button>
              <AnimatePresence>
                {langOpen && (
                  <motion.div
                    initial={{ opacity: 0, y: 8 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: 8 }}
                    className="absolute right-0 mt-2 w-48 glass rounded-xl overflow-hidden shadow-2xl"
                  >
                    {LANGUAGES.map((l) => (
                      <button
                        key={l.code}
                        onClick={() => {
                          setLanguage(l.code);
                          setLangOpen(false);
                        }}
                        className={`w-full flex items-center gap-3 px-4 py-2.5 text-left text-sm transition-colors ${
                          language === l.code ? "bg-red-600/20 text-white" : "text-zinc-300 hover:bg-white/10 hover:text-white"
                        }`}
                      >
                        <span>{l.flag}</span>
                        {l.name}
                      </button>
                    ))}
                  </motion.div>
                )}
              </AnimatePresence>
            </div>

            <button className="hidden md:flex items-center gap-2 pl-2 pr-3 py-1.5 rounded-full bg-zinc-800/60 hover:bg-zinc-700/60 transition-colors">
              <div className="h-7 w-7 rounded-full bg-gradient-to-br from-zinc-600 to-zinc-800 flex items-center justify-center">
                <User className="h-4 w-4 text-zinc-300" />
              </div>
              <span className="text-sm font-medium text-zinc-200">Guest</span>
            </button>

            <button
              onClick={() => setMobileOpen(!mobileOpen)}
              className="lg:hidden p-2.5 rounded-full text-zinc-300 hover:text-white hover:bg-white/10"
            >
              {mobileOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
            </button>
          </div>
        </div>
      </motion.nav>

      {/* Mobile menu */}
      <AnimatePresence>
        {mobileOpen && (
          <motion.div
            initial={{ opacity: 0, y: -20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -20 }}
            className="fixed inset-x-0 top-16 z-40 glass border-t border-white/5 lg:hidden"
          >
            <div className="p-4 grid grid-cols-2 gap-2">
              {TABS.map((tab) => {
                const Icon = tab.icon;
                return (
                  <button
                    key={tab.id}
                    onClick={() => {
                      setActiveTab(tab.id);
                      setMobileOpen(false);
                    }}
                    className={`flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-medium transition-colors ${
                      activeTab === tab.id ? "bg-red-600/20 text-white" : "text-zinc-400 hover:bg-white/5 hover:text-white"
                    }`}
                  >
                    <Icon className="h-4 w-4" />
                    {tab.label}
                  </button>
                );
              })}
              <button
                onClick={() => {
                  onOpenDownloads();
                  setMobileOpen(false);
                }}
                className="flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-medium text-zinc-400 hover:bg-white/5 hover:text-white"
              >
                <Download className="h-4 w-4" />
                Downloads
              </button>
              <button
                onClick={() => {
                  onOpenSettings();
                  setMobileOpen(false);
                }}
                className="flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-medium text-zinc-400 hover:bg-white/5 hover:text-white"
              >
                <Settings className="h-4 w-4" />
                Settings
              </button>
            </div>
            <div className="border-t border-white/5 p-4">
              <p className="text-xs text-zinc-500 mb-2 uppercase tracking-wider">Language</p>
              <div className="flex flex-wrap gap-2">
                {LANGUAGES.map((l) => (
                  <button
                    key={l.code}
                    onClick={() => setLanguage(l.code)}
                    className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                      language === l.code ? "bg-red-600 text-white" : "bg-white/5 text-zinc-400 hover:bg-white/10"
                    }`}
                  >
                    {l.flag} {l.name}
                  </button>
                ))}
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Click outside to close language dropdown */}
      {langOpen && (
        <div
          className="fixed inset-0 z-40"
          onClick={() => setLangOpen(false)}
        />
      )}
    </>
  );
}
