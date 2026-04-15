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

  log('Exporting layouts...')
  const layouts = await storage.listLayouts(gameId)
  for (const tpl of layouts) {
    zip.file(`layouts/${tpl.id}.json`, JSON.stringify(tpl, null, 2))
  }

  log('Exporting fonts...')
  const fonts = await storage.listFonts(gameId)
  zip.file('fonts/fonts.json', JSON.stringify(fonts, null, 2))
  for (const slot of Object.values(fonts) as any[]) {
    if (!slot.file) continue
    try {
      const resp = await fetch(`/api/games/${gameId}/fonts/${slot.file}`)
      if (resp.ok) zip.file(`fonts/${slot.file}`, await resp.arrayBuffer())
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
  // Also scan layout default values
  const scanItems = (section: any) => {
    for (const item of section.items ?? []) {
      const val = item.defaultValue ?? ''
      const match = String(val).match(/\/api\/games\/[^/]+\/images\/([^"]+)/)
      if (match) imageFiles.add(match[1])
    }
    for (const child of section.children ?? []) scanItems(child)
  }
  for (const tpl of layouts) scanItems(tpl.root)
  // Also scan collection back images
  for (const col of collections) {
    if (col.back) {
      const match = col.back.match(/\/api\/games\/[^/]+\/images\/([^"]+)/)
      if (match) imageFiles.add(match[1])
    }
  }

  for (const file of imageFiles) {
    try {
      const resp = await fetch(`/api/games/${gameId}/images/${file}`)
      if (resp.ok) zip.file(`images/${file}`, await resp.arrayBuffer())
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

  // Delete the default layout and collection that createGame made
  const defaultLayouts = await storage.listLayouts(newGameId)
  const defaultCollections = await storage.listCollections(newGameId)
  for (const col of defaultCollections) await storage.deleteCollection(newGameId, col.id).catch(() => {})
  for (const tpl of defaultLayouts) await storage.deleteLayout(newGameId, tpl.id).catch(() => {})

  const oldGameId = gameMeta.id ?? ''
  const rewriteUrls = (str: string): string =>
    oldGameId ? str.replaceAll(`/api/games/${oldGameId}/`, `/api/games/${newGameId}/`) : str

  log('Importing fonts...')
  const fontsManifest = await readJson('fonts/fonts.json')
  if (fontsManifest) {
    for (const [slot, entry] of Object.entries(fontsManifest) as [string, any][]) {
      if (!entry.file) continue
      const fontFile = zip.file(`fonts/${entry.file}`)
      if (!fontFile) continue
      const blob = await fontFile.async('blob')
      // Use original filename so uploadFont hashes to same name, but set display name from manifest
      const ext = entry.file.match(/\.[^.]+$/)?.[0] ?? ''
      const file = new File([blob], `${entry.name}${ext}`, { type: 'application/octet-stream' })
      await storage.uploadFont(newGameId, file, slot)
    }
  }

  log('Importing images...')
  const imageRenames: Record<string, string> = {}
  const imageEntries = zip.file(/^images\//)
  for (const f of imageEntries) {
    const fileName = f.name.replace('images/', '')
    if (!fileName) continue // skip directory entry
    const blob = await f.async('blob')
    const ext = fileName.match(/\.[^.]+$/)?.[0] ?? '.png'
    const mimeTypes: Record<string, string> = { '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.webp': 'image/webp', '.gif': 'image/gif', '.svg': 'image/svg+xml' }
    const file = new File([blob], fileName, { type: mimeTypes[ext] ?? 'application/octet-stream' })
    const newPath = await storage.uploadImage(newGameId, file)
    // Track renames: if storage hashed the filename, we need to rewrite URLs
    const oldPath = `/api/games/${newGameId}/images/${fileName}`
    if (newPath && newPath !== oldPath) {
      imageRenames[oldPath] = newPath
    }
  }

  const rewriteAll = (str: string): string => {
    let result = rewriteUrls(str)
    for (const [oldPath, newPath] of Object.entries(imageRenames)) {
      result = result.replaceAll(oldPath, newPath)
    }
    // Also rewrite paths using old game ID that were already rewritten
    if (oldGameId) {
      for (const [oldPath, newPath] of Object.entries(imageRenames)) {
        const origPath = oldPath.replace(`/api/games/${newGameId}/`, `/api/games/${oldGameId}/`)
        result = result.replaceAll(origPath, newPath)
      }
    }
    return result
  }

  log('Importing layouts...')
  const layoutFiles = zip.file(/^layouts\/.*\.json$/)
  log(`Found ${layoutFiles.length} layout(s)`)
  for (const f of layoutFiles) {
    const tpl = JSON.parse(rewriteAll(await f.async('text')))
    log(`Saving layout: ${tpl.id} (${tpl.name})`)
    await storage.saveLayout(newGameId, tpl.id, tpl)
  }

  log('Importing collections and cards...')
  const collectionFiles = zip.file(/^collections\/[^/]+\/collection\.json$/)
  log(`Found ${collectionFiles.length} collection(s)`)
  for (const f of collectionFiles) {
    const col = JSON.parse(await f.async('text'))
    log(`Creating collection: ${col.id} (${col.name}) → layout: ${col.layoutId}`)
    const newCol = await storage.createCollection(newGameId, col.name, col.layoutId)
    const newColId = newCol.id
    // Preserve extra collection fields (back, backFit, etc.)
    const extraFields: Record<string, unknown> = {}
    if (col.back) extraFields.back = rewriteAll(col.back)
    if (col.backFit) extraFields.backFit = col.backFit
    if (Object.keys(extraFields).length > 0) {
      await storage.updateCollection(newGameId, newColId, extraFields)
    }

    const colDir = f.name.replace('/collection.json', '')
    const cardFiles = zip.file(new RegExp(`^${colDir}/cards/.*\\.json$`))
    for (const cf of cardFiles) {
      const card = JSON.parse(rewriteAll(await cf.async('text')))
      await storage.saveCard(newGameId, newColId, card.id, card)
    }
  }

  log('Done.')
  return newGameId
}
