import JSZip from 'jszip'

/**
 * Export a game as a zip file containing all JSON data and binary assets.
 * Works with any storage backend.
 */
export const exportGameZip = async (
  storage: any,
  gameId: string,
  onProgress?: (msg: string) => void
): Promise<Blob> => {
  const zip = new JSZip()
  const log = onProgress ?? (() => {})

  log('Exporting game metadata...')
  const game = await storage.getGame(gameId)
  zip.file('game.json', JSON.stringify(game, null, 2))

  log('Exporting templates...')
  const templates = await storage.listTemplates(gameId)
  for (const tpl of templates) {
    zip.file(`templates/${tpl.id}.json`, JSON.stringify(tpl, null, 2))
  }

  log('Exporting fonts...')
  const fonts = await storage.listFonts(gameId)
  zip.file('fonts/fonts.json', JSON.stringify(fonts, null, 2))
  for (const slot of Object.values(fonts) as any[]) {
    if (!slot.file) continue
    try {
      const resp = await fetch(`/api/games/${gameId}/fonts/${slot.file}`)
      if (resp.ok) zip.file(`fonts/${slot.file}`, await resp.blob())
    } catch { /* skip */ }
  }

  log('Exporting collections and cards...')
  const collections = await storage.listCollections(gameId)
  for (const col of collections) {
    zip.file(`collections/${col.id}/collection.json`, JSON.stringify(col, null, 2))
    const cards = await storage.listCards(gameId, col.id)
    for (const card of cards) {
      zip.file(`collections/${col.id}/cards/${card.id}.json`, JSON.stringify(card, null, 2))
    }
  }

  log('Exporting images...')
  // Scan card fields for image URLs and include them
  const imageFiles = new Set<string>()
  for (const col of collections) {
    const cards = await storage.listCards(gameId, col.id)
    for (const card of cards) {
      for (const val of Object.values(card.fields ?? {})) {
        const match = String(val).match(/\/api\/games\/[^/]+\/images\/([^"]+)/)
        if (match) imageFiles.add(match[1])
      }
    }
  }
  // Also scan template default values
  const scanItems = (section: any) => {
    for (const item of section.items ?? []) {
      const val = item.defaultValue ?? ''
      const match = String(val).match(/\/api\/games\/[^/]+\/images\/([^"]+)/)
      if (match) imageFiles.add(match[1])
    }
    for (const child of section.children ?? []) scanItems(child)
  }
  for (const tpl of templates) scanItems(tpl.root)

  for (const file of imageFiles) {
    try {
      const resp = await fetch(`/api/games/${gameId}/images/${file}`)
      if (resp.ok) zip.file(`images/${file}`, await resp.blob())
    } catch { /* skip */ }
  }

  log('Compressing...')
  return zip.generateAsync({ type: 'blob' })
}

/**
 * Import a game from a zip file. Creates a new game in the target storage.
 * Returns the new game ID.
 */
export const importGameZip = async (
  storage: any,
  zipBlob: Blob,
  onProgress?: (msg: string) => void
): Promise<string> => {
  const log = onProgress ?? (() => {})

  log('Reading zip...')
  const zip = await JSZip.loadAsync(zipBlob)

  const readJson = async (path: string) => {
    const file = zip.file(path)
    if (!file) return null
    return JSON.parse(await file.async('text'))
  }

  log('Importing game...')
  const gameMeta = await readJson('game.json')
  if (!gameMeta?.name) throw new Error('Invalid zip: missing game.json')
  const newGame = await storage.createGame(gameMeta.name)
  const newGameId = newGame.id

  // Delete the default template and collection that createGame made
  const defaultTemplates = await storage.listTemplates(newGameId)
  const defaultCollections = await storage.listCollections(newGameId)
  for (const col of defaultCollections) await storage.deleteCollection(newGameId, col.id).catch(() => {})
  for (const tpl of defaultTemplates) await storage.deleteTemplate(newGameId, tpl.id).catch(() => {})

  log('Importing templates...')
  const templateFiles = zip.file(/^templates\/.*\.json$/)
  for (const f of templateFiles) {
    const tpl = JSON.parse(await f.async('text'))
    await storage.saveTemplate(newGameId, tpl.id, tpl)
  }

  log('Importing fonts...')
  const fontsManifest = await readJson('fonts/fonts.json')
  if (fontsManifest) {
    for (const [slot, entry] of Object.entries(fontsManifest) as [string, any][]) {
      if (!entry.file) continue
      const fontFile = zip.file(`fonts/${entry.file}`)
      if (!fontFile) continue
      const blob = await fontFile.async('blob')
      const file = new File([blob], entry.file, { type: 'application/octet-stream' })
      await storage.uploadFont(newGameId, file, slot)
    }
  }

  // Import images first so URLs are available when cards reference them
  log('Importing images...')
  const imageEntries = zip.file(/^images\//)
  const oldGameId = gameMeta.id ?? ''
  for (const f of imageEntries) {
    const blob = await f.async('blob')
    const fileName = f.name.replace('images/', '')
    const ext = fileName.match(/\.[^.]+$/)?.[0] ?? '.png'
    const mimeTypes: Record<string, string> = { '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.webp': 'image/webp', '.gif': 'image/gif', '.svg': 'image/svg+xml' }
    const file = new File([blob], fileName, { type: mimeTypes[ext] ?? 'application/octet-stream' })
    await storage.uploadImage(newGameId, file)
  }

  log('Importing collections and cards...')
  const collectionFiles = zip.file(/^collections\/[^/]+\/collection\.json$/)
  for (const f of collectionFiles) {
    const col = JSON.parse(await f.async('text'))
    const newCol = await storage.createCollection(newGameId, col.name, col.templateId)
    const newColId = newCol.id

    const colDir = f.name.replace('/collection.json', '')
    const cardFiles = zip.file(new RegExp(`^${colDir}/cards/.*\\.json$`))
    for (const cf of cardFiles) {
      const card = JSON.parse(await cf.async('text'))
      // Rewrite image URLs to point to new game ID
      if (card.fields && oldGameId) {
        for (const [key, val] of Object.entries(card.fields)) {
          if (typeof val === 'string' && val.includes(`/api/games/${oldGameId}/`)) {
            card.fields[key] = (val as string).replace(`/api/games/${oldGameId}/`, `/api/games/${newGameId}/`)
          }
        }
      }
      await storage.saveCard(newGameId, newColId, card.id, card)
    }
  }

  log('Done.')
  return newGameId
}
