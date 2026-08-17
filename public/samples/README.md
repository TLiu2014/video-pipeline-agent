# Sample video clips

Drop **any** short `.mp4` / `.mov` / `.webm` / `.mkv` clips in this folder and
they show up automatically in the app's **Source video → sample** picker (the
list is read live from this directory — no config needed).

For the **subtitle / transcription demo you want a clip with clear speech.**

### Reliable, free clips with spoken audio

`media.w3.org` (W3C) hotlinks reliably and the Sintel trailer contains dialogue:

```bash
cd public/samples
# Sintel trailer (Blender, CC-BY) — has spoken lines, ~1min (trim if you like)
curl -L -o sintel.mp4 https://media.w3.org/2010/05/sintel/trailer.mp4
```

You can trim to ~10-15s with FFmpeg:

```bash
ffmpeg -i sintel.mp4 -t 15 -c copy sintel-15s.mp4
```

Other good sources for short talking clips (download a file you like, drop it here):

- **Pexels** / **Pixabay** — free stock, search "person talking to camera".
- **NASA video gallery** (images.nasa.gov) — public domain, English narration.
- **Wikimedia Commons** — many public-domain/CC clips with direct download links.
- Or record a 10-second clip of yourself talking.

> Tip: you don't have to use this folder at all — the app also lets you **paste a
> video URL** (fetched server-side) or **upload** a file directly.

These clips are exempt from `.gitignore` (see the `!/public/samples/**` rule), so
you can commit them for a fresh-clone demo or leave them untracked.
