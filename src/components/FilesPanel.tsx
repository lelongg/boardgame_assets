import { useState, useEffect } from 'react'
import { Download, Upload, Printer, List, LayoutGrid } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import CardThumbnail from './CardThumbnail'
import { cardsToCSV, csvToCards } from '../cardsCsv'
import { renderCardSvg, embedFontsInSvg, embedImagesInSvg } from '../render'
import type { CardData, CardLayout } from '../types'

const MAX_ATLAS_SIZE = 4096
const TTS_MAX_CARDS = 69

const svgToImage = (svg: string): Promise<HTMLImageElement> =>
  new Promise((resolve, reject) => {
    const img = new Image()
    img.onload = () => resolve(img)
    img.onerror = reject
    img.src = `data:image/svg+xml,${encodeURIComponent(svg)}`
  })

export type FileCard = CardData & { collectionId?: string; collectionName?: string; collectionBack?: string; collectionBackFit?: string }

type FilesPanelProps = {
  gameId: string
  collectionId?: string
  gameName?: string
  collectionName?: string
  cards: FileCard[]
  layout?: CardLayout
  gameFonts?: Record<string, { name: string; file: string }>
  storage: any
  back?: string
  backFit?: "cover" | "contain" | "fill"
  onStatusChange?: (msg: string) => void
  onCardsChange?: () => void
}

export default function FilesPanel({
  gameId, collectionId, gameName, collectionName,
  cards, layout, gameFonts, storage,
  back, backFit,
  onStatusChange, onCardsChange,
}: FilesPanelProps) {
  const navigate = useNavigate()
  const [cardSelection, setCardSelection] = useState<Set<string>>(() => new Set(cards.map(c => c.id)))
  const [importStaged, setImportStaged] = useState<{ name: string; fields: Record<string, string> }[]>([])
  const [importSelection, setImportSelection] = useState<Set<number>>(new Set())
  const [deleteMissing, setDeleteMissing] = useState(false)
  const [gallery, setGallery] = useState(false)
  const [thumbnails, setThumbnails] = useState<Record<string, string>>({})
  const [importThumbnails, setImportThumbnails] = useState<Record<number, string>>({})
  const [collapsedGroups, setCollapsedGroups] = useState<Set<string>>(new Set())
  const [hoverThumb, setHoverThumb] = useState<{ src: string; x: number; y: number } | null>(null)
  const [exporting, setExporting] = useState(false)

  const setStatus = (msg: string) => onStatusChange?.(msg)

  // Sync selection when cards change — select all by default
  useEffect(() => {
    setCardSelection(prev => {
      const valid = new Set(cards.map(c => c.id))
      if (prev.size === 0 && valid.size > 0) return valid
      const next = new Set([...prev].filter(id => valid.has(id)))
      return next.size === prev.size ? prev : next
    })
  }, [cards])

  // Thumbnails
  useEffect(() => {
    if (!layout || cards.length === 0) { setThumbnails({}); return }
    let cancelled = false
    ;(async () => {
      const { renderCardSvg } = await import('../render')
      const t: Record<string, string> = {}
      for (const card of cards) {
        if (cancelled) return
        try {
          const svg = renderCardSvg(card, layout, { fonts: gameFonts })
          t[card.id] = `data:image/svg+xml,${encodeURIComponent(svg)}`
        } catch { /* skip */ }
      }
      if (!cancelled) setThumbnails(t)
    })()
    return () => { cancelled = true }
  }, [gallery, cards, layout, gameFonts])

  useEffect(() => {
    if (!layout || importStaged.length === 0) { setImportThumbnails({}); return }
    let cancelled = false
    ;(async () => {
      const { renderCardSvg } = await import('../render')
      const t: Record<number, string> = {}
      for (let i = 0; i < importStaged.length; i++) {
        if (cancelled) return
        try {
          const svg = renderCardSvg({ id: `import-${i}`, ...importStaged[i] } as any, layout, { fonts: gameFonts })
          t[i] = `data:image/svg+xml,${encodeURIComponent(svg)}`
        } catch { /* skip */ }
      }
      if (!cancelled) setImportThumbnails(t)
    })()
    return () => { cancelled = true }
  }, [gallery, importStaged, layout, gameFonts])

  const hasImport = importStaged.length > 0
  const existingByName = new Map(cards.map(c => [c.name, c]))
  const stagedNames = hasImport ? new Set(importStaged.map(c => c.name)) : null

  type PanelItem =
    | { kind: 'existing'; id: string; name: string; importIdx?: number; status?: 'replace' | 'missing' }
    | { kind: 'new'; importIdx: number; name: string }

  const items: PanelItem[] = cards.map(c => {
    const importIdx = hasImport ? importStaged.findIndex(s => s.name === c.name) : -1
    const status = hasImport ? (importIdx >= 0 ? 'replace' as const : (stagedNames && !stagedNames.has(c.name) ? 'missing' as const : undefined)) : undefined
    return { kind: 'existing' as const, id: c.id, name: c.name, importIdx: importIdx >= 0 ? importIdx : undefined, status }
  })
  if (hasImport) {
    importStaged.forEach((s, i) => {
      if (!existingByName.has(s.name)) items.push({ kind: 'new', importIdx: i, name: s.name })
    })
  }

  const totalItems = items.length
  const toggleItem = (item: PanelItem) => {
    if (item.kind === 'existing') {
      setCardSelection(prev => { const n = new Set(prev); n.has(item.id) ? n.delete(item.id) : n.add(item.id); return n })
      if (item.importIdx != null) {
        setImportSelection(prev => { const n = new Set(prev); n.has(item.importIdx!) ? n.delete(item.importIdx!) : n.add(item.importIdx!); return n })
      }
    } else {
      setImportSelection(prev => { const n = new Set(prev); n.has(item.importIdx) ? n.delete(item.importIdx) : n.add(item.importIdx); return n })
    }
  }
  const isSelected = (item: PanelItem) =>
    item.kind === 'existing' ? cardSelection.has(item.id) : importSelection.has(item.importIdx)
  const allSelected = totalItems > 0 && items.every(isSelected)
  const selectAll = (checked: boolean) => {
    if (checked) {
      setCardSelection(new Set(cards.map(c => c.id)))
      if (hasImport) setImportSelection(new Set(importStaged.map((_, i) => i)))
    } else {
      setCardSelection(new Set())
      if (hasImport) setImportSelection(new Set())
    }
  }
  const selectedExisting = cards.filter(c => cardSelection.has(c.id)).length
  const selectedImport = hasImport ? importStaged.filter((_, i) => importSelection.has(i)).length : 0
  const missingCards = hasImport ? cards.filter(c => !stagedNames!.has(c.name)) : []

  const badge = (item: PanelItem) => {
    if (!hasImport) return null
    if (item.kind === 'new') return <span className="text-xs px-1.5 py-0.5 rounded shrink-0 bg-green-100 text-green-700">new</span>
    if (item.status === 'replace') return <span className="text-xs px-1.5 py-0.5 rounded shrink-0 bg-amber-100 text-amber-700">replace</span>
    if (item.status === 'missing') return <span className="text-xs px-1.5 py-0.5 rounded shrink-0 bg-red-100 text-red-700">missing</span>
    return null
  }
  const thumb = (item: PanelItem) =>
    item.kind === 'existing' ? thumbnails[item.id] : importThumbnails[item.importIdx]

  const cardParams = cardSelection.size < cards.length ? `?cards=${[...cardSelection].join(',')}` : ''
  const printUrl = collectionId
    ? `/game/${gameId}/collection/${collectionId}/print${cardParams}`
    : `/game/${gameId}/print${cardParams}`

  const exportName = collectionName
    ? `${gameName || gameId} - ${collectionName}`
    : gameName || gameId

  return (
    <div className="grid grid-cols-1 md:grid-cols-[1fr_auto] gap-4">
      {hoverThumb && (
        <div className="pointer-events-none fixed z-50 rounded-md shadow-lg overflow-hidden"
          style={{ left: hoverThumb.x + 16, top: hoverThumb.y - 80, width: 120, backgroundImage: 'repeating-conic-gradient(#e5e5e5 0% 25%, transparent 0% 50%)', backgroundSize: '8px 8px' }}>
          <div style={{ padding: '5%', aspectRatio: `${layout?.width ?? 63.5} / ${layout?.height ?? 88.9}` }}>
            <img src={hoverThumb.src} alt="" className="w-full h-full object-contain drop-shadow" />
          </div>
        </div>
      )}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0">
          <CardTitle className="text-base">Cards <span className="text-sm font-normal text-muted-foreground ml-1">{items.filter(isSelected).length}/{totalItems}</span></CardTitle>
          <Button size="sm" variant="ghost" onClick={() => setGallery(!gallery)} title={gallery ? 'List view' : 'Gallery view'}>
            {gallery ? <List className="h-4 w-4" /> : <LayoutGrid className="h-4 w-4" />}
          </Button>
        </CardHeader>
        <CardContent className="space-y-2">
          <label className="flex items-center gap-2 text-sm text-muted-foreground border-b pb-2 cursor-pointer select-none">
            <input type="checkbox" checked={allSelected} onChange={(e) => selectAll(e.target.checked)} />
            Select all
          </label>
          {(() => {
            // Group items by collection when showing game-level (no collectionId)
            const collectionNames = !collectionId ? [...new Set(cards.map(c => c.collectionName).filter(Boolean))] : []
            const hasGroups = collectionNames.length > 1

            const renderItem = (item: PanelItem) => {
              const key = item.kind === 'existing' ? item.id : `import-${item.importIdx}`
              const t = thumb(item)
              if (gallery) return (
                <CardThumbnail
                  key={key}
                  src={t || ''}
                  name={item.name}
                  selected={isSelected(item)}
                  onClick={() => toggleItem(item)}
                  badge={badge(item)}
                />
              )
              return (
                <label key={key}
                  className="flex items-center gap-2 text-sm cursor-pointer select-none hover:bg-accent/30 rounded px-1 py-0.5"
                  onMouseEnter={(e) => { if (t) setHoverThumb({ src: t, x: e.clientX, y: e.clientY }) }}
                  onMouseMove={(e) => { if (t) setHoverThumb({ src: t, x: e.clientX, y: e.clientY }) }}
                  onMouseLeave={() => setHoverThumb(null)}
                >
                  <input type="checkbox" checked={isSelected(item)} onChange={() => toggleItem(item)} />
                  <span className="truncate flex-1">{item.name}</span>
                  {badge(item)}
                </label>
              )
            }

            const renderGroup = (groupItems: PanelItem[], title?: string) => {
              const groupAllSelected = groupItems.length > 0 && groupItems.every(isSelected)
              const toggleGroup = () => {
                const ids = groupItems.filter(i => i.kind === 'existing').map(i => (i as any).id as string)
                setCardSelection(prev => {
                  const next = new Set(prev)
                  if (groupAllSelected) ids.forEach(id => next.delete(id))
                  else ids.forEach(id => next.add(id))
                  return next
                })
              }
              const collapsed = title ? collapsedGroups.has(title) : false
              const toggleCollapse = () => {
                if (!title) return
                setCollapsedGroups(prev => { const next = new Set(prev); next.has(title) ? next.delete(title) : next.add(title); return next })
              }
              return (
              <div key={title ?? 'all'}>
                {title && (
                  <div className="flex items-center gap-2 text-xs font-semibold uppercase text-muted-foreground pt-2 pb-1 border-b mb-1 select-none">
                    <input type="checkbox" checked={groupAllSelected} onChange={toggleGroup} className="cursor-pointer" />
                    <span className="cursor-pointer flex-1" onClick={toggleCollapse}>{title} <span className="text-[0.65rem] font-normal text-muted-foreground ml-1">{groupItems.filter(isSelected).length}/{groupItems.length}</span></span>
                    <button onClick={toggleCollapse} className="text-muted-foreground hover:text-foreground transition-colors">
                      {collapsed ? '▸' : '▾'}
                    </button>
                  </div>
                )}
                {!collapsed && (gallery ? (
                  <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 gap-2 p-0.5">
                    {groupItems.map(renderItem)}
                  </div>
                ) : (
                  <div className="space-y-1">
                    {groupItems.map(renderItem)}
                  </div>
                ))}
              </div>
            )}

            return (
              <div className="overflow-y-auto max-h-[60vh] space-y-2">
                {hasGroups
                  ? collectionNames.map(name => {
                      const groupCards = new Set(cards.filter(c => c.collectionName === name).map(c => c.id))
                      const groupItems = items.filter(i => i.kind === 'existing' && groupCards.has(i.id))
                      return groupItems.length > 0 ? renderGroup(groupItems, name) : null
                    })
                  : renderGroup(items)
                }
              </div>
            )
          })()}
        </CardContent>
      </Card>

      <div className="space-y-4 md:w-64">
        <Card>
          <CardContent className="pt-6 space-y-3">
            <Button className="w-full" variant="outline" disabled={selectedExisting === 0} onClick={async () => {
              try {
                const selected = cards.filter(c => cardSelection.has(c.id))
                const csv = cardsToCSV(selected)
                const blob = new Blob([csv], { type: 'text/csv' })
                const url = URL.createObjectURL(blob)
                const a = document.createElement('a')
                a.href = url
                a.download = `${exportName}.csv`
                a.click()
                URL.revokeObjectURL(url)
              } catch { setStatus('Error exporting CSV.') }
            }}>
              <Download className="h-4 w-4 mr-2" />
              Export CSV
            </Button>
            <Button className="w-full" variant="outline" disabled={selectedExisting === 0 || exporting || !layout} onClick={async () => {
              if (!layout || !gameId) return
              setExporting(true)
              try {
                const JSZip = (await import('jszip')).default
                const zip = new JSZip()
                const selected = cards.filter(c => cardSelection.has(c.id))

                // Group cards by collection (multi-collection) or single group
                type DeckGroup = { name: string; cards: FileCard[]; back?: string; backFit?: string }
                let groups: DeckGroup[]
                if (collectionId) {
                  groups = [{ name: collectionName || 'deck', cards: selected, back, backFit }]
                } else {
                  const byCol = new Map<string, DeckGroup>()
                  for (const card of selected) {
                    const key = card.collectionName || 'deck'
                    if (!byCol.has(key)) byCol.set(key, { name: key, cards: [], back: card.collectionBack, backFit: card.collectionBackFit })
                    byCol.get(key)!.cards.push(card)
                  }
                  groups = [...byCol.values()]
                }

                const toSlug = (s: string) => s.toLowerCase().trim().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '') || 'deck'
                const objectStates: any[] = []
                let deckIdCounter = 1
                const cardAspect = layout.height / layout.width

                for (const group of groups) {
                  const slug = toSlug(group.name)
                  const cardCount = Math.min(group.cards.length, TTS_MAX_CARDS - 1)
                  const numWidth = Math.min(10, cardCount + 1)
                  const numHeight = Math.ceil((cardCount + 1) / numWidth)
                  const cardW = Math.floor(MAX_ATLAS_SIZE / numWidth)
                  const cardH = Math.floor(cardW * cardAspect)

                  // --- Face atlas ---
                  const faceCanvas = document.createElement('canvas')
                  faceCanvas.width = cardW * numWidth
                  faceCanvas.height = cardH * numHeight
                  const faceCtx = faceCanvas.getContext('2d')!
                  faceCtx.fillStyle = '#ffffff'
                  faceCtx.fillRect(0, 0, faceCanvas.width, faceCanvas.height)

                  for (let i = 0; i < cardCount; i++) {
                    setStatus(`Rendering ${group.name} ${i + 1}/${cardCount}...`)
                    let svg = renderCardSvg(group.cards[i], layout, { fonts: gameFonts })
                    svg = await embedFontsInSvg(svg, gameId, gameFonts ?? {})
                    svg = await embedImagesInSvg(svg)
                    const img = await svgToImage(svg)
                    faceCtx.drawImage(img, (i % numWidth) * cardW, Math.floor(i / numWidth) * cardH, cardW, cardH)
                  }

                  // Hidden card slot (last position)
                  const hCol = cardCount % numWidth
                  const hRow = Math.floor(cardCount / numWidth)
                  faceCtx.fillStyle = '#1b1a17'
                  faceCtx.fillRect(hCol * cardW, hRow * cardH, cardW, cardH)
                  faceCtx.fillStyle = '#ffffff'
                  faceCtx.font = `${Math.floor(cardW * 0.15)}px sans-serif`
                  faceCtx.textAlign = 'center'
                  faceCtx.textBaseline = 'middle'
                  faceCtx.fillText('?', hCol * cardW + cardW / 2, hRow * cardH + cardH / 2)

                  zip.file(`${slug}_face.png`, await new Promise<Blob>(r => faceCanvas.toBlob(b => r(b!), 'image/png')))

                  // --- Back image ---
                  const backCanvas = document.createElement('canvas')
                  backCanvas.width = cardW
                  backCanvas.height = cardH
                  const backCtx = backCanvas.getContext('2d')!

                  if (group.back) {
                    try {
                      const resp = await fetch(group.back)
                      const backImg = await createImageBitmap(await resp.blob())
                      const fit = group.backFit || 'cover'
                      if (fit === 'fill') {
                        backCtx.drawImage(backImg, 0, 0, cardW, cardH)
                      } else if (fit === 'contain') {
                        backCtx.fillStyle = '#ffffff'
                        backCtx.fillRect(0, 0, cardW, cardH)
                        const s = Math.min(cardW / backImg.width, cardH / backImg.height)
                        const w = backImg.width * s, h = backImg.height * s
                        backCtx.drawImage(backImg, (cardW - w) / 2, (cardH - h) / 2, w, h)
                      } else { // cover
                        const s = Math.max(cardW / backImg.width, cardH / backImg.height)
                        const w = backImg.width * s, h = backImg.height * s
                        backCtx.drawImage(backImg, (cardW - w) / 2, (cardH - h) / 2, w, h)
                      }
                    } catch {
                      backCtx.fillStyle = '#1b1a17'
                      backCtx.fillRect(0, 0, cardW, cardH)
                    }
                  } else {
                    backCtx.fillStyle = '#1b1a17'
                    backCtx.fillRect(0, 0, cardW, cardH)
                    backCtx.fillStyle = '#ffffff'
                    backCtx.font = `${Math.floor(cardW * 0.15)}px sans-serif`
                    backCtx.textAlign = 'center'
                    backCtx.textBaseline = 'middle'
                    backCtx.fillText('?', cardW / 2, cardH / 2)
                  }

                  zip.file(`${slug}_back.png`, await new Promise<Blob>(r => backCanvas.toBlob(b => r(b!), 'image/png')))

                  // --- TTS deck entry ---
                  const deckId = deckIdCounter++
                  const contained = group.cards.slice(0, cardCount).map((c, i) => ({
                    GUID: `c${String(deckId * 100 + i).padStart(4, '0')}`,
                    Name: 'Card', Nickname: c.name, CardID: deckId * 100 + i,
                    Transform: { posX: 0, posY: 0, posZ: 0, rotX: 0, rotY: 180, rotZ: 180, scaleX: 1, scaleY: 1, scaleZ: 1 },
                  }))
                  objectStates.push({
                    GUID: `deck${String(deckId).padStart(2, '0')}`,
                    Name: 'DeckCustom', Nickname: group.name,
                    Transform: { posX: (deckId - 1) * 3, posY: 1, posZ: 0, rotX: 0, rotY: 180, rotZ: 180, scaleX: 1, scaleY: 1, scaleZ: 1 },
                    DeckIDs: contained.map(o => o.CardID),
                    CustomDeck: { [String(deckId)]: { FaceURL: `./${slug}_face.png`, BackURL: `./${slug}_back.png`, NumWidth: numWidth, NumHeight: numHeight, BackIsHidden: true, UniqueBack: false } },
                    ContainedObjects: contained,
                  })
                }

                zip.file('tts_deck.json', JSON.stringify({ ObjectStates: objectStates }, null, 2))
                const zipBlob = await zip.generateAsync({ type: 'blob' })
                const a = document.createElement('a')
                a.href = URL.createObjectURL(zipBlob)
                a.download = `${exportName} - TTS.zip`
                a.click()
                URL.revokeObjectURL(a.href)

                setStatus(`TTS export complete: ${selected.length} cards in ${groups.length} deck${groups.length > 1 ? 's' : ''}.`)
              } catch (err) {
                setStatus('Error exporting TTS.')
                console.error(err)
              } finally {
                setExporting(false)
              }
            }}>
              <Download className="h-4 w-4 mr-2" />
              {exporting ? 'Exporting...' : 'TTS Export'}
            </Button>
            <Button className="w-full" variant="outline" disabled={selectedExisting === 0} onClick={() => navigate(printUrl)}>
              <Printer className="h-4 w-4 mr-2" />
              Print
            </Button>
          </CardContent>
        </Card>

        {collectionId && (
          <Card>
            <CardContent className="pt-6 space-y-3">
              <Button className="w-full" variant="outline" onClick={() => {
                const input = document.createElement('input')
                input.type = 'file'
                input.accept = '.csv,text/csv'
                input.onchange = async () => {
                  const file = input.files?.[0]
                  if (!file) return
                  try {
                    const text = await file.text()
                    const parsed = csvToCards(text)
                    setImportStaged(parsed)
                    setImportSelection(new Set(parsed.map((_, i) => i)))
                    setDeleteMissing(false)
                  } catch (e: any) { setStatus(`Parse error: ${e.message || e}`) }
                }
                input.click()
              }}>
                Load CSV
              </Button>
              {hasImport && <>
                {missingCards.length > 0 && (
                  <label className="flex items-center gap-2 text-sm cursor-pointer select-none text-red-600">
                    <input type="checkbox" checked={deleteMissing} onChange={(e) => setDeleteMissing(e.target.checked)} />
                    Delete {missingCards.length} missing
                  </label>
                )}
                <Button className="w-full" variant="outline" disabled={selectedImport === 0} onClick={async () => {
                  try {
                    setStatus('Importing...')
                    const toImport = importStaged.filter((_, i) => importSelection.has(i))
                    for (const card of toImport) {
                      const existing = existingByName.get(card.name)
                      await storage.saveCard(gameId, collectionId, existing?.id ?? null, existing ? { ...existing, fields: card.fields } : card)
                    }
                    if (deleteMissing) {
                      for (const card of missingCards) {
                        await storage.deleteCard(gameId, collectionId, card.id)
                      }
                    }
                    onCardsChange?.()
                    setImportStaged([])
                    setImportSelection(new Set())
                    setDeleteMissing(false)
                    setStatus(`Imported ${toImport.length} card${toImport.length !== 1 ? 's' : ''}.`)
                  } catch (e: any) { setStatus(`Import error: ${e.message || e}`) }
                }}>
                  <Upload className="h-4 w-4 mr-2" />
                  Import {selectedImport} card{selectedImport !== 1 ? 's' : ''}
                </Button>
                <Button className="w-full" size="sm" variant="ghost" onClick={() => { setImportStaged([]); setImportSelection(new Set()); setDeleteMissing(false) }}>
                  Clear CSV
                </Button>
              </>}
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  )
}
