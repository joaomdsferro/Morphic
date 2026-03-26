# GitHub Copilot Instructions for Morphic

## Project Context
- Morphic is a privacy-first, local-first media toolkit.
- All processing must happen on-device. Do not introduce server-side processing or external upload APIs.
- This repository is a pnpm monorepo.
- Primary app: `apps/web` (Next.js 16, React 19, TypeScript, Tailwind CSS 4).
- Shared packages: `packages/core-wasm`, `packages/ui`, `packages/typescript-config`.

## Product and Architecture Rules
- Keep image workflows fully client-side (Canvas/OffscreenCanvas in web app).
- `core-wasm` is available but not yet wired as the primary path in UI; do not break existing browser-based processing.
- Respect static export constraints (`output: "export"` in Next config).
- Preserve existing routes and route intent:
  - `/convert/images`, `/compress/images`, `/upscale/images`
  - `/convert/videos`, `/compress/videos` are stubs unless explicitly implemented.

## Coding Rules
- Prefer editing existing files over introducing new files.
- Use TypeScript and keep strong typings.
- Follow current code style and naming conventions in touched files.
- Keep changes minimal and focused; avoid unrelated refactors.
- Add brief comments only when logic is non-obvious.

## UI and Styling Rules
- Tailwind CSS only (no inline styles except dynamic values where required).
- Every button must include `hover:cursor-pointer`.
- Reuse shared components from `packages/ui` when practical.
- Preserve theme behavior using `data-theme="dark"|"light"` and current dark/light variable model.

## Safety and Performance Rules
- No external API calls for media processing.
- Avoid adding heavy dependencies unless clearly justified.
- Favor browser-native APIs and efficient client-side operations.
- Keep user data local and ephemeral unless persistence is already part of the flow.

## Validation Checklist
Before finalizing changes:
1. Ensure build and type checks for touched packages pass.
2. Confirm UI behavior on the affected route(s).
3. Verify no server-side processing path was introduced.
4. Verify all touched buttons include `hover:cursor-pointer`.
