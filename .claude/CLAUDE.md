# Morphic — Claude Instructions

## Project Overview

Morphic is a **privacy-first, local-first media toolkit**. All processing happens on the user's device — no uploads, no external API calls. It is a pnpm monorepo combining a Next.js web app with a Tauri desktop app, sharing Rust image-processing backends.

Current version: `0.0.1` (early stage — expect bugs, breaking changes, and missing features).

---

## Monorepo Structure

```
apps/
  web/          Next.js 16 web app (primary UI)
  desktop/      Tauri 2 desktop wrapper around the web app

packages/
  core-native/  Rust image processing for Tauri (native targets)
  core-wasm/    Rust image processing compiled to WebAssembly
  ui/           Shared React components (DropZone, FormatBadge, ProgressBar)
  typescript-config/  Shared tsconfig presets
```

---

## Tech Stack

| Layer | Technology |
|---|---|
| Web UI | Next.js 16, React 19, TypeScript 5.8, Tailwind CSS 4 |
| Desktop shell | Tauri 2 (Rust) |
| Image processing | Rust `image` 0.25, `ravif`, `jxl-oxide`, `rayon` |
| WASM bridge | `wasm-bindgen` |
| Monorepo tooling | pnpm 10, Turbo 2 |

---

## Architecture

### Dual Processing Paths
- **Web app**: Converts images via the browser's `OffscreenCanvas` / Canvas API — 100% client-side.
- **Desktop app**: Invokes the native Rust core via Tauri IPC for better performance.
- **WASM core** (`core-wasm`): Compiled and available but not yet wired into the active UI.

### Theme System
- Theme is applied via `data-theme="dark"|"light"` on `<html>`.
- Dark/light overrides live in `apps/web/src/app/globals.css`.
- Default theme is dark.

### Routing (web app)
```
/                     Home — action picker
/convert/images       Image conversion
/convert/videos       Video conversion (stub)
/compress/images      Image compression
/compress/videos      Video compression (stub)
/upscale/images       Image upscaling
```
All image routes share the `ImageActionStudio` component, driven by a `mode` prop.

### Static Export
Next.js is configured with `output: "export"` so Tauri can bundle the pre-built static files. During development, Tauri points to `localhost:3000`.

---

## Supported Formats

| Direction | Formats |
|---|---|
| Input | JPEG, PNG, WebP, AVIF, GIF, TIFF, BMP, JPEG XL, SVG |
| Output | JPEG, PNG, WebP, AVIF, ICO, SVG |

---

## Feature Status

| Feature | Status |
|---|---|
| Image convert | ✅ Ready |
| Image compress | ✅ Ready |
| Image upscale (2×, 4×) | ✅ Ready |
| Video convert | 🚧 Route exists, not implemented |
| Video compress | 🚧 Route exists, not implemented |
| Desktop (Tauri) | 🚧 Shell ready, native commands partial |

---

## Key Files

| File | Purpose |
|---|---|
| `apps/web/src/app/components/ImageActionStudio.tsx` | Core image processing UI (convert / compress / upscale) |
| `apps/web/src/app/components/ThemeToggle.tsx` | Dark/light theme toggle; persists to localStorage |
| `apps/web/src/app/globals.css` | Tailwind base + all theme overrides |
| `apps/web/src/app/layout.tsx` | Root layout, nav, footer |
| `packages/core-native/src/image.rs` | Native Rust image conversion logic |
| `packages/core-wasm/src/lib.rs` | WASM image conversion + format lists |
| `apps/desktop/src-tauri/src/lib.rs` | Tauri command handlers |

---

## Development

```bash
# Install dependencies
pnpm install

# Run web app dev server
pnpm --filter @morphic/web dev

# Run desktop app (Tauri)
pnpm --filter @morphic/desktop tauri dev

# Build everything
pnpm build
```

---

## Conventions & Rules

- **All buttons must have `hover:cursor-pointer`** — enforced by the `ui-ux-best-practices` skill.
- Tailwind CSS only — no inline styles except for dynamic values.
- No server-side processing — every operation must work fully offline.
- Client components (`"use client"`) only when state or browser APIs are needed.
- Prefer editing existing files over creating new ones.
