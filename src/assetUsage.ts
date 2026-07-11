/**
 * Scans game data for references to uploaded assets, so unused images and
 * fonts can be detected (and safely deleted) and exports can skip dead files.
 *
 * Reference forms differ by asset type:
 * - Images are referenced by full URL (`/api/games/{gameId}/images/{file}`)
 *   in card field values, image item defaultValues, and layout bindingMeta
 *   defaults/values.
 * - Fonts are referenced by manifest slot key (`item.font`, font bindings,
 *   bindingMeta for `font:*`), never by URL.
 *
 * Checkpoint snapshots also keep assets alive: callers should feed each
 * checkpoint's cards and collection snapshot (getCheckpoint) into the
 * collectors alongside the live data, as useAssetUsage does.
 */

// Matches all occurrences in a value (rich text can embed several images)
// and stops at quote/whitespace/markup delimiters so trailing text is not
// captured into the filename.
export const IMAGE_URL_RE = /\/api\/games\/[^/]+\/images\/([^"'\s<>)]+)/g

type SectionLike = { items?: any[]; children?: SectionLike[] }

const walkItems = (section: SectionLike | undefined | null, fn: (item: any) => void) => {
  if (!section) return
  for (const item of section.items ?? []) fn(item)
  for (const child of section.children ?? []) walkItems(child, fn)
}

/** Image file names referenced anywhere in the given layouts and cards. */
export function collectUsedImageFiles(
  layouts: any[],
  allCards: any[],
): Set<string> {
  const files = new Set<string>()
  const collect = (val: unknown) => {
    for (const m of String(val ?? '').matchAll(IMAGE_URL_RE)) files.add(m[1])
  }
  // Card field values: any field can carry an image URL when an image item
  // is bound to it, so every value is scanned.
  for (const card of allCards) {
    for (const val of Object.values(card.fields ?? {})) collect(val)
  }
  for (const tpl of layouts) {
    walkItems(tpl.root, (item) => { collect(item.defaultValue); collect(item.maskUrl) })
    // Binding defaults and allowed values live at layout level in bindingMeta
    for (const meta of Object.values(tpl.bindingMeta ?? {}) as any[]) {
      collect(meta?.default)
      for (const v of meta?.values ?? []) collect(v)
    }
  }
  return files
}

/**
 * Font slot keys referenced by the given layouts and cards.
 *
 * The first manifest slot is always considered used: both renderers fall
 * back to `Object.keys(fonts)[0]` whenever a text/numbers item has no
 * (valid) font. Card field values only count as font references for fields
 * that some item actually binds its `font` property to.
 */
export function collectUsedFontSlots(
  fonts: Record<string, { name: string; file: string }>,
  layouts: any[],
  allCards: any[],
): Set<string> {
  const used = new Set<string>()
  const slots = Object.keys(fonts)
  if (slots.length === 0) return used
  used.add(slots[0])

  const boundFields = new Set<string>()
  for (const tpl of layouts) {
    walkItems(tpl.root, (item) => {
      if (item.font) used.add(String(item.font))
      const field = item.bindings?.font?.field
      if (field) {
        // resolve() checks the scoped key first, then the plain field name
        boundFields.add(`font:${field}`)
        boundFields.add(String(field))
      }
    })
    for (const [key, meta] of Object.entries(tpl.bindingMeta ?? {}) as [string, any][]) {
      if (!key.startsWith('font:')) continue
      if (meta?.default) used.add(String(meta.default))
      for (const v of meta?.values ?? []) if (v) used.add(String(v))
    }
  }
  if (boundFields.size > 0) {
    for (const card of allCards) {
      for (const [field, val] of Object.entries(card.fields ?? {})) {
        if (val && boundFields.has(field)) used.add(String(val))
      }
    }
  }
  return used
}

/**
 * Slot keys that are safe to delete: not used themselves, and not sharing a
 * font file with a used slot (deleteFont removes every slot pointing at the
 * same file, and content-hash naming means slots can share files).
 */
export function findUnusedFontSlots(
  fonts: Record<string, { name: string; file: string }>,
  usedSlots: Set<string>,
): string[] {
  const usedFiles = new Set(
    Object.entries(fonts)
      .filter(([key, entry]) => usedSlots.has(key) && entry.file)
      .map(([, entry]) => entry.file),
  )
  return Object.keys(fonts).filter(
    (key) => !usedSlots.has(key) && !(fonts[key].file && usedFiles.has(fonts[key].file)),
  )
}
