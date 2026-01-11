# Boardgame Asset Editor - Copilot Instructions

## Project Overview

This is a web-based boardgame asset editor that allows users to create and manage multiple games and card assets with SVG previews and print sheets. The editor can run as a static site with Google Drive storage (no backend required) or as a local development server with file-based storage.

## Tech Stack

- **Language**: TypeScript (strict mode enabled)
- **Runtime**: Node.js 20
- **Build Tool**: tsx (TypeScript Execute)
- **Testing**: Node.js built-in test runner
- **Module System**: ES2022 modules
- **Frontend**: Vanilla JavaScript/HTML (no framework)
- **SVG Rendering**: Custom SVG generation for card assets
- **Storage Options**: 
  - Local file system (development)
  - Google Drive API (hosted editor)

## Project Structure

- `src/` - Source code
  - `src/build.ts` - Legacy SVG batch renderer
  - `src/buildPages.ts` - Static site generator for GitHub Pages
  - `src/server.ts` - Local development server
  - `src/render/` - SVG rendering logic for cards
  - `src/web/` - Web editor UI and storage providers
  - `src/types.ts` - TypeScript type definitions
  - `src/theme.ts` - Theme configuration
- `games/` - Game data storage (local development)
  - `games/<game-id>/game.json` - Game metadata
  - `games/<game-id>/cards/<card-id>.json` - Card data
- `test/` - Tests using Node.js test runner
- `docs/` - Generated GitHub Pages output
- `output/` - Generated SVG output (legacy build)

## Coding Conventions

### TypeScript
- Always use strict TypeScript mode
- Define types explicitly for all public APIs
- Use `type` for type aliases (e.g., `type CardData = {...}`)
- Use discriminated unions for different entity types when appropriate
- Prefer `Record<string, string>` for string key-value maps

### Code Style
- Use ES2022 module syntax (`import`/`export`)
- Use arrow functions for callbacks and functional patterns
- Prefer `const` over `let`, avoid `var`
- Use template literals for string interpolation
- Keep functions focused and modular

### File Organization
- Place type definitions in `src/types.ts` or colocated with their usage
- Keep web UI code separate in `src/web/`
- Keep rendering logic in `src/render/`

## Build and Development Commands

### Setup
```bash
npm install
```

### Development
```bash
npm run serve           # Start local development server (http://127.0.0.1:5173/)
npm run serve:watch     # Start server with auto-reload
npm run watch           # Watch mode for legacy build
```

### Building
```bash
npm run build           # Legacy SVG batch renderer (outputs to output/)
npm run build:pages     # Build static site for GitHub Pages (outputs to docs/)
```

### Testing
```bash
npm test                # Run all tests using Node.js test runner
```

### Cleaning
```bash
npm run clean           # Clean generated files
```

## Key Features and Workflows

### Local Development
- Games and cards are stored as JSON files in `games/<game-id>/`
- The development server (`npm run serve`) provides a web UI at `http://127.0.0.1:5173/`
- Changes are saved to the local file system

### GitHub Pages Deployment
- Static site is built with `npm run build:pages`
- Outputs to `docs/` directory
- Includes both a gallery view and a copy of the editor at `docs/editor/`
- Automatically deployed via GitHub Actions on push to `main` branch
- Editor in hosted mode uses Google Drive for storage

### Google Drive Integration
- The hosted editor can save data to Google Drive without a backend
- Requires OAuth client ID set via `GOOGLE_CLIENT_ID` environment variable
- OAuth client ID is injected during `build:pages`
- Storage provider is in `src/web/storage/googleDrive.js`
- Optional folder ID can be configured in `src/web/config.js`
- To swap storage providers, replace the storage module and update `src/web/storage.js`

### Card Rendering
- Cards are rendered as SVG using custom rendering logic
- Templates define layout sections, items, and text fields
- Supports multiple layout types: row, column, stack
- Includes print sheet generation for physical card printing

## Testing Guidelines

- Use Node.js built-in test runner (`node --test`)
- Tests are in the `test/` directory
- Import tsx for TypeScript support: `node --test --import tsx test`
- Write focused unit tests for rendering and data transformation logic
- Test files follow the pattern `*.test.js` (JavaScript files that can import TypeScript modules via tsx)

## CI/CD

### Workflows
- `.github/workflows/ci.yml` - Runs tests and builds on PRs and main branch
- `.github/workflows/pages.yml` - Deploys to GitHub Pages on main branch pushes

### CI Requirements
- All tests must pass (`npm test`)
- Build must succeed (`npm run build`)
- Node.js 20 is used in CI

## Important Notes

### Storage Flexibility
The architecture supports multiple storage backends. When adding or modifying storage features:
- Keep storage logic isolated in `src/web/storage/`
- Maintain a consistent interface that can be swapped out
- Don't hardcode assumptions about storage location or mechanism

### SVG Generation
When working with card rendering:
- SVG is generated programmatically, not from templates
- Be mindful of coordinate systems and anchor points
- Test rendering with various card configurations
- Consider print requirements (bleed, radius, sizing)

### Static Site Generation
The project generates a static site that can run without a server:
- All editor functionality must work client-side only
- External dependencies must be loaded via CDN or bundled
- Configuration (like OAuth client ID) is injected at build time

## Common Tasks

### Adding a New Card Field Type
1. Update `CardTemplateItem` type in `src/types.ts`
2. Add rendering logic in `src/render/cardSvg.ts`
3. Update web UI in `src/web/` to support the new field
4. Add tests for the new field type

### Adding a New Storage Provider
1. Create new provider in `src/web/storage/`
2. Implement the same interface as existing providers
3. Update `src/web/storage.js` to include new option
4. Document configuration requirements

### Modifying the Build Process
1. Update relevant script in `src/build.ts`, `src/buildPages.ts`, or `src/server.ts`
2. Test both local and pages builds
3. Verify CI workflows still work
4. Update documentation if commands change
