import { cn } from "@/lib/utils";

/**
 * The CineDAG logo tile. Renders the generated SVG from /public (single source
 * of truth — edit the .svg to change the mark, no code change), rather than
 * inlining markup here. The SVG already includes its gradient tile + rounded
 * corners, so it's shown as a self-contained image.
 */
export function CineDagTile({
  size = 36,
  className,
  src = "/icon.svg",
}: {
  size?: number;
  className?: string;
  /** Which brand SVG to render (defaults to the canonical logo). */
  src?: string;
}) {
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={src}
      alt="CineDAG"
      width={size}
      height={size}
      style={{ width: size, height: size }}
      className={cn("block shrink-0", className)}
    />
  );
}
