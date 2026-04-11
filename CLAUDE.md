# Agent Instructions

## Round-Trip Tests

When adding or modifying any data model field on types like `CardLayout`, `CardLayoutSection`, `CardLayoutItem` (or subtypes), `Collection`, or `CardData`:

1. **Normalizer**: Ensure the field is preserved in `src/normalize.ts` (items are built from scratch, unlisted fields are silently dropped)
2. **Export/Import**: Ensure `src/gameZip.ts` handles the field in both export and import paths. Collection fields beyond `name`/`layoutId` must be restored via `updateCollection` after `createCollection`
3. **Round-trip test**: Update `test/backendCompat.test.js` to include the new field in `createFullTestGame` and verify it in `verifyFullTestGame`. The test must confirm the field survives: localFile, indexedDB, S3, and cross-backend zip transfers
4. **Both renderers**: This project has TWO render files (`src/render.ts` used by the app, `src/render/cardSvg.ts` used by the server/tests). They are separate implementations and changes must be applied to both. A merge was attempted but reverted due to subtle differences (font handling, layout conversion, foreignObject support).

## Property System

- Every new property on items/sections needs: type definition, normalizer preservation, `getFieldMeta` entry in ControlPanel, `getEditorType` entry, PropertyPanel property list entry, and renderer support in both render files
- Allowed values for bindings are stored at layout level in `bindingMeta`, not per-item
- Binding defaults are also in `bindingMeta`, not on the item's static property
