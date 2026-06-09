# Boardgame Asset Editor - Copilot Instructions

## Project Overview

This is a web-based boardgame asset editor that allows users to create and manage multiple games and card assets with SVG previews and print sheets. The editor is a React SPA that talks to one of four interchangeable storage backends; it can run as a static site (browser/cloud storage, no backend required) or against a local development server with file-based storage.

Also read `CLAUDE.md` at the repo root — it documents the round-trip-test and dual-renderer rules that every data-model change must follow.

## Tech Stack

- **Language**: TypeScript (strict mode enabled); the storage backends are plain JS with `.d.ts` declarations
- **Runtime**: Node.js 20
- **Frontend**: React 19 + react-router + @tanstack/react-query, Tailwind CSS, Radix UI
- **Build Tool**: Vite (`npm run build`), tsx for the server and scripts
- **Testing**: Node.js built-in test runner (`node --test --import tsx`)
- **SVG Rendering**: Custom SVG generation for card assets (two deliberate implementations, see below)
- **Storage Options**: localFile (dev server), indexedDB (browser), Google Drive, S3-compatible

## Project Structure

- `src/` - Source code
  - `src/main.tsx`, `src/App.tsx`, `src/pages/`, `src/components/` - React app
  - `src/hooks/useGameData.ts` - react-query layer over the storage backend (query keys, cache invalidation)
  - `src/hooks/useStorage.tsx` - storage singleton + context
  - `src/storage.ts` - backend registry/selection
  - `src/storage/` - the four storage backends; `src/storage/backend.ts` defines the `StorageBackend` interface they all implement
  - `src/render.ts` - SVG renderer used by the app (preview, print, export)
  - `src/render/cardSvg.ts` - SVG renderer used by the server and tests
  - `src/server.ts` - local development API server (Express)
  - `src/normalize.ts` - data normalizer (whitelist-based: new fields MUST be added here or they are silently dropped)
  - `src/gameZip.ts` - game export/import as zip
  - `src/types.ts` - TypeScript type definitions
  - `src/build.ts` / `src/buildPages.ts` - legacy batch renderer / GitHub Pages site generator
- `games/` - Game data storage for the localFile backend (gitignored)
- `test/` - Tests using Node.js test runner
- `docs/` - Generated GitHub Pages output

## Critical Architecture Rules

### Two renderers, kept in sync
`src/render.ts` (app) and `src/render/cardSvg.ts` (server/tests) are intentionally separate implementations of the same feature set. Any rendering change must be applied to BOTH, and `test/rendererParity.test.js` pins the behaviors that previously drifted (defaults, escaping, binding resolution). A merge was attempted and reverted — do not merge them.

### Whitelist normalizer
`src/normalize.ts` rebuilds items/sections from scratch; any field it doesn't copy is silently destroyed on the next save. When adding a field follow the checklist in `CLAUDE.md` (normalizer, gameZip export/import, `test/backendCompat.test.js` round trip, both renderers, ControlPanel/PropertyPanel).

### Storage backends
- All four backends implement `StorageBackend` (`src/storage/backend.ts`) — keep methods, return shapes and error behavior consistent across ALL of them (shared semantics are documented on the interface).
- The Google Drive backend keeps internal content/listing caches (5 min TTL); every new write/delete path there must invalidate them. The other backends are stateless.
- `clearCache()` powers the "reload from storage" button.
- Tests for backends live in `test/storageCaching.test.js` (Drive, with an in-memory Drive mock), `test/backendCompat.test.js` (cross-backend round trips), and `test/serverSecurity.test.js` (spawns the real `src/server.ts`).

## Build and Development Commands

```bash
npm install
npm run dev             # Vite dev server (http://localhost:5180/, proxies /api to :5174)
npm run serve:api       # Local API server for the localFile backend (port 5174)
npm run build           # tsc + vite build
npm run build:pages     # Build static site for GitHub Pages (outputs to docs/)
npm test                # Run all tests
```

## Coding Conventions

- Strict TypeScript; define types explicitly for public APIs; `type` aliases over interfaces for data shapes
- ES2022 modules, arrow functions, `const` over `let`, template literals
- React: function components, hooks for data access (never call storage directly from components when a `useGameData` hook exists)

## Testing Guidelines

- Node.js built-in test runner; test files are `test/*.test.js` importing TS modules via tsx
- New backend behavior needs coverage in `test/storageCaching.test.js` or `test/backendCompat.test.js`
- New rendering behavior needs coverage in `test/rendering.test.js` / `test/itemTypes.test.js`, and `test/rendererParity.test.js` if both renderers are involved
- Server endpoints: `test/serverSecurity.test.js` shows how to spawn and exercise the real server

## CI/CD

- `.github/workflows/ci.yml` - tests + build on PRs and main
- `.github/workflows/pages.yml` - GitHub Pages deploy on main (uses `npm run build:pages`; `GOOGLE_CLIENT_ID` is injected at build time)

## Common Tasks

### Adding a new item/section property
Follow the CLAUDE.md checklist: `src/types.ts` → `src/normalize.ts` → `getFieldMeta`/`getEditorType` in `ControlPanel.tsx` → `PropertyPanel.tsx` property list → BOTH renderers → `test/backendCompat.test.js` round trip.

### Adding a new storage provider
1. Create the provider in `src/storage/` implementing `StorageBackend` (`src/storage/backend.ts`)
2. Register it in `src/storage.ts` (`providers` map + `BACKENDS` list)
3. Add it to the cross-backend round-trip matrix in `test/backendCompat.test.js`
