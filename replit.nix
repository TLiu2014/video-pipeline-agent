{ pkgs }: {
  # System deps for the full CineDAG app on Replit. ffmpeg here means the
  # media steps run in-Repl (EXECUTION_MODE=local) — FFmpeg on Replit's platform.
  deps = [
    pkgs.nodejs_20
    pkgs.ffmpeg
    # CJK font so libass can render Chinese (and other CJK) subtitles — the base
    # Nix container has no CJK font, so without this the burn draws tofu boxes.
    # Selected by force_style FontName via SUBTITLE_FONT in .replit.
    pkgs.noto-fonts-cjk-sans
    pkgs.fontconfig
  ];
}
