# AGENTS.md

## Cursor Cloud specific instructions

### What this repo is
A single static website (`src/index.html`, `src/styles.css`, `src/scripts.js`) that is hosted on Cloudflare R2 in production. There is no build system, package manager, bundler, backend, automated tests, or lint configuration — it is plain HTML/CSS/vanilla JS.

### Running it in development
Serve the `src/` directory with any static file server; there are no dependencies to install. The simplest option (Python 3 is preinstalled):

```
cd src && python3 -m http.server 8000
```

Then open `http://localhost:8000/`. The page fades in on load and has small vanilla-JS interactions (CTA button click animation, sticky-header scroll listener, smooth-scroll anchors, and a responsive nav toggle that only appears at viewport widths <= 768px).

### Notes / gotchas
- The nav links use `href="#"` with no matching section IDs, so the smooth-scroll handlers fire but the page does not jump to a section. This is expected, not a bug.
- Editing any file under `src/` is picked up on a plain browser refresh — the static server serves files directly, so no restart is needed.
- There is nothing to "build". Production is just these static files uploaded to an R2 bucket.
