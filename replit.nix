{ pkgs }: {
  # System deps for the full CineDAG app on Replit. ffmpeg here means the
  # media steps run in-Repl (EXECUTION_MODE=local) — FFmpeg on Replit's platform.
  deps = [
    pkgs.nodejs_20
    pkgs.ffmpeg
  ];
}
