import JSZip from 'jszip'

// Pure Tabletop Simulator export logic. Kept free of React, the DOM-only
// render helpers and storage backends so it can be unit tested in node; the
// canvas rendering stays in FilesPanel.

export const MAX_ATLAS_SIZE = 4096
export const TTS_MAX_CARDS = 69

export type TtsCard = {
  name: string
  collectionName?: string
  collectionBackLayoutId?: string
}

export type DeckGroup<C extends TtsCard = TtsCard> = { name: string; cards: C[]; backLayoutId?: string }

export type AtlasGrid = { cardCount: number; numWidth: number; numHeight: number; cardW: number; cardH: number }

export const toSlug = (s: string) =>
  s.toLowerCase().trim().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '') || 'deck'

/** One deck for a collection view; grouped by collection name for a game view. */
export const groupCardsIntoDecks = <C extends TtsCard>(
  selected: C[],
  { collectionId, collectionName, backLayoutId }: { collectionId?: string; collectionName?: string; backLayoutId?: string },
): DeckGroup<C>[] => {
  if (collectionId) return [{ name: collectionName || 'deck', cards: selected, backLayoutId }]
  const byCol = new Map<string, DeckGroup<C>>()
  for (const card of selected) {
    const key = card.collectionName || 'deck'
    if (!byCol.has(key)) byCol.set(key, { name: key, cards: [], backLayoutId: card.collectionBackLayoutId })
    byCol.get(key)!.cards.push(card)
  }
  return [...byCol.values()]
}

/** Atlas layout: up to 10 columns, one extra slot for the hidden-card face. */
export const computeAtlasGrid = (
  cardCount: number, layoutW: number, layoutH: number,
  maxAtlas = MAX_ATLAS_SIZE, maxCards = TTS_MAX_CARDS,
): AtlasGrid => {
  const count = Math.min(cardCount, maxCards - 1)
  const numWidth = Math.min(10, count + 1)
  const numHeight = Math.ceil((count + 1) / numWidth)
  const cardW = Math.floor(maxAtlas / numWidth)
  const cardH = Math.floor(cardW * (layoutH / layoutW))
  return { cardCount: count, numWidth, numHeight, cardW, cardH }
}

export const buildDeckObjectState = (
  deckId: number, group: DeckGroup, cardCount: number,
  grid: Pick<AtlasGrid, 'numWidth' | 'numHeight'>, faceUrl: string, backUrl: string,
) => {
  const contained = group.cards.slice(0, cardCount).map((c, i) => ({
    GUID: `c${String(deckId * 100 + i).padStart(4, '0')}`,
    Name: 'Card', Nickname: c.name, CardID: deckId * 100 + i,
    Transform: { posX: 0, posY: 0, posZ: 0, rotX: 0, rotY: 180, rotZ: 180, scaleX: 1, scaleY: 1, scaleZ: 1 },
  }))
  return {
    GUID: `deck${String(deckId).padStart(2, '0')}`,
    Name: 'DeckCustom', Nickname: group.name,
    Transform: { posX: (deckId - 1) * 3, posY: 1, posZ: 0, rotX: 0, rotY: 180, rotZ: 180, scaleX: 1, scaleY: 1, scaleZ: 1 },
    DeckIDs: contained.map(o => o.CardID),
    CustomDeck: { [String(deckId)]: { FaceURL: faceUrl, BackURL: backUrl, NumWidth: grid.numWidth, NumHeight: grid.numHeight, BackIsHidden: true, UniqueBack: false } },
    ContainedObjects: contained,
  }
}

export const buildTtsJson = (objectStates: unknown[]) => JSON.stringify({ ObjectStates: objectStates }, null, 2)

/** Destination for the rendered atlases and the final TTS save file. */
export interface TtsAssetSink {
  /** Stores a PNG and returns the URL/path to reference from the TTS JSON. */
  put(fileName: string, png: Blob): Promise<string>
  finish(ttsJson: string, exportName: string): Promise<void>
}

export type DownloadFn = (blob: Blob, fileName: string) => void

export const downloadBlob: DownloadFn = (blob, fileName) => {
  const a = document.createElement('a')
  a.href = URL.createObjectURL(blob)
  a.download = fileName
  a.click()
  URL.revokeObjectURL(a.href)
}

/** Uploads to the localFile dev server, which serves the atlases at public URLs. */
export const createServerTtsSink = (
  gameId: string,
  fetchImpl: typeof fetch = (...args) => fetch(...args),
  origin: string = window.location.origin,
  download: DownloadFn = downloadBlob,
): TtsAssetSink => {
  const baseUrl = `${origin}/api/games/${gameId}/tts`
  return {
    async put(fileName, png) {
      const resp = await fetchImpl(`${baseUrl}/upload`, { method: 'POST', body: png, headers: { 'Content-Disposition': `attachment; filename="${fileName}"` } })
      if (!resp.ok) throw new Error(`Upload of ${fileName} failed: HTTP ${resp.status}`)
      return `${baseUrl}/${fileName}`
    },
    async finish(ttsJson, exportName) {
      download(new Blob([ttsJson], { type: 'application/json' }), `${exportName} - TTS.json`)
    },
  }
}

export const TTS_ZIP_README = `Tabletop Simulator export

Tabletop Simulator loads deck images from URLs. The FaceURL/BackURL entries in
the TTS JSON currently point at the PNG files bundled in this zip.

To use this deck:
1. Host the PNGs somewhere public (e.g. Steam Cloud, an image host) and replace
   FaceURL/BackURL in the JSON with their public URLs, or
2. Replace FaceURL/BackURL with absolute local file paths to the PNGs
   (e.g. file:///C:/path/to/deck_face.png); this only works on your machine.

Then copy the JSON into your Tabletop Simulator Saves/Saved Objects folder.
`

/** Bundles atlases, the TTS JSON and a README into a zip for backends without public URLs. */
export const createZipTtsSink = (download: DownloadFn = downloadBlob): TtsAssetSink => {
  const zip = new JSZip()
  return {
    async put(fileName, png) {
      // ArrayBuffer rather than Blob: JSZip reads Blobs via FileReader, absent in node.
      zip.file(fileName, await png.arrayBuffer())
      return fileName
    },
    async finish(ttsJson, exportName) {
      zip.file(`${exportName} - TTS.json`, ttsJson)
      zip.file('README.txt', TTS_ZIP_README)
      const blob = await zip.generateAsync({ type: 'blob' })
      download(blob, `${exportName} - TTS.zip`)
    },
  }
}
