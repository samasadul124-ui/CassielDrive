import { useEffect, useState, type ReactNode } from "react";
import { Film } from "lucide-react";

interface RemoteImageProps {
  src?: string | null;
  alt: string;
  className?: string;
  /** classes for the fallback container (gradient / solid color) */
  fallbackClassName?: string;
  children?: ReactNode;
  eager?: boolean;
}

/**
 * Dynamic artwork renderer. Shows the real remote poster/backdrop returned by
 * the MovieBox-TUI backend; if the URL is missing or the image fails to load,
 * falls back to a local placeholder (gradient + icon) — never a fake movie.
 */
export default function RemoteImage({
  src,
  alt,
  className = "",
  fallbackClassName = "bg-zinc-800",
  children,
  eager = false,
}: RemoteImageProps) {
  const [failed, setFailed] = useState(false);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    setFailed(false);
    setLoaded(false);
  }, [src]);

  if (!src || failed) {
    return (
      <div
        className={`flex items-center justify-center overflow-hidden ${fallbackClassName} ${className}`}
        aria-label={alt ? `poster for ${alt}` : "poster placeholder"}
      >
        {children ?? <Film className="h-10 w-10 text-zinc-600" />}
      </div>
    );
  }

  return (
    <img
      src={src}
      alt={alt}
      loading={eager ? "eager" : "lazy"}
      referrerPolicy="no-referrer"
      onLoad={() => setLoaded(true)}
      onError={() => setFailed(true)}
      className={`${className} transition-opacity duration-500 ${loaded ? "opacity-100" : "opacity-0"}`}
    />
  );
}
