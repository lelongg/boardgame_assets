import { useState, useEffect } from 'react'
import { Download, Printer } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import PortalDropdown from './ui/PortalDropdown'
import FilterableList from './FilterableList'
import { cardsToCSV } from '../cardsCsv'
import { renderCardSvg, embedImagesInSvg, buildFontCss } from '../render'
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
  cards, layout, gameFonts,
  back, backFit,
  onStatusChange,
}: FilesPanelProps) {
  const navigate = useNavigate()
  const [selection, setSelection] = useState<Set<string>>(() => new Set(cards.map(c => c.id)))
  const [exporting, setExporting] = useState(false)
  const [thumbnails, setThumbnails] = useState<Record<string, string>>({})

  const setStatus = (msg: string) => onStatusChange?.(msg)

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
  }, [cards, layout, gameFonts])

  useEffect(() => {
    setSelection(prev => {
      const valid = new Set(cards.map(c => c.id))
      if (prev.size === 0 && valid.size > 0) return valid
      const next = new Set([...prev].filter(id => valid.has(id)))
      return next.size === prev.size ? prev : next
    })
  }, [cards])

  const selectedCount = cards.filter(c => selection.has(c.id)).length
  const cardParams = selection.size < cards.length ? `?cards=${[...selection].join(',')}` : ''
  const printUrl = collectionId
    ? `/game/${gameId}/collection/${collectionId}/print${cardParams}`
    : `/game/${gameId}/print${cardParams}`

  const exportName = collectionName
    ? `${gameName || gameId} - ${collectionName}`
    : gameName || gameId

  const exportCsv = () => {
    try {
      const selected = cards.filter(c => selection.has(c.id))
      const csv = cardsToCSV(selected)
      const blob = new Blob([csv], { type: 'text/csv' })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `${exportName}.csv`
      a.click()
      URL.revokeObjectURL(url)
    } catch { setStatus('Error exporting CSV.') }
  }

  const exportTts = async () => {
    if (!layout || !gameId) return
    setExporting(true)
    try {
      const selected = cards.filter(c => selection.has(c.id))
      const baseUrl = `${window.location.origin}/api/games/${gameId}/tts`

      const uploadPng = async (canvas: HTMLCanvasElement, fileName: string) => {
        const blob = await new Promise<Blob>((resolve, reject) => {
          canvas.toBlob(b => b ? resolve(b) : reject(new Error(`toBlob failed for ${fileName}`)), 'image/png')
        })
        const resp = await fetch(`${baseUrl}/upload`, { method: 'POST', body: blob, headers: { 'Content-Disposition': `attachment; filename="${fileName}"` } })
        if (!resp.ok) throw new Error(`Upload failed: ${resp.status}`)
      }

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

      setStatus('Loading fonts...')
      const fontCss = await buildFontCss(gameId, gameFonts ?? {})

      for (const group of groups) {
        const slug = toSlug(group.name)
        const cardCount = Math.min(group.cards.length, TTS_MAX_CARDS - 1)
        const numWidth = Math.min(10, cardCount + 1)
        const numHeight = Math.ceil((cardCount + 1) / numWidth)
        const cardW = Math.floor(MAX_ATLAS_SIZE / numWidth)
        const cardH = Math.floor(cardW * cardAspect)

        const faceCanvas = document.createElement('canvas')
        faceCanvas.width = cardW * numWidth
        faceCanvas.height = cardH * numHeight
        const faceCtx = faceCanvas.getContext('2d')!
        faceCtx.fillStyle = '#ffffff'
        faceCtx.fillRect(0, 0, faceCanvas.width, faceCanvas.height)

        for (let i = 0; i < cardCount; i++) {
          setStatus(`Rendering ${group.name} ${i + 1}/${cardCount}...`)
          let svg = renderCardSvg(group.cards[i], layout, { fonts: gameFonts })
          if (fontCss) svg = svg.replace(/(<svg[^>]*>)/, `$1<defs><style>${fontCss}</style></defs>`)
          svg = await embedImagesInSvg(svg)
          const img = await svgToImage(svg)
          faceCtx.drawImage(img, (i % numWidth) * cardW, Math.floor(i / numWidth) * cardH, cardW, cardH)
        }

        const hCol = cardCount % numWidth
        const hRow = Math.floor(cardCount / numWidth)
        faceCtx.fillStyle = '#1b1a17'
        faceCtx.fillRect(hCol * cardW, hRow * cardH, cardW, cardH)
        faceCtx.fillStyle = '#ffffff'
        faceCtx.font = `${Math.floor(cardW * 0.15)}px sans-serif`
        faceCtx.textAlign = 'center'
        faceCtx.textBaseline = 'middle'
        faceCtx.fillText('?', hCol * cardW + cardW / 2, hRow * cardH + cardH / 2)

        setStatus(`Uploading ${group.name} face atlas...`)
        await uploadPng(faceCanvas, `${slug}_face.png`)

        setStatus(`Rendering ${group.name} back...`)
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
            } else {
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

        setStatus(`Uploading ${group.name} back...`)
        await uploadPng(backCanvas, `${slug}_back.png`)

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
          CustomDeck: { [String(deckId)]: { FaceURL: `${baseUrl}/${slug}_face.png`, BackURL: `${baseUrl}/${slug}_back.png`, NumWidth: numWidth, NumHeight: numHeight, BackIsHidden: true, UniqueBack: false } },
          ContainedObjects: contained,
        })
      }

      const ttsJson = JSON.stringify({ ObjectStates: objectStates }, null, 2)
      const a = document.createElement('a')
      a.href = URL.createObjectURL(new Blob([ttsJson], { type: 'application/json' }))
      a.download = `${exportName} - TTS.json`
      a.click()
      URL.revokeObjectURL(a.href)

      setStatus(`TTS export complete: ${selected.length} cards in ${groups.length} deck${groups.length > 1 ? 's' : ''}.`)
    } catch (err) {
      setStatus('Error exporting TTS.')
      console.error(err)
    } finally {
      setExporting(false)
    }
  }

  return (
    <FilterableList<FileCard>
      title="Export"
      items={cards}
      getKey={(c) => c.id}
      getName={(c) => c.name}
      getPreviewSrc={(c) => thumbnails[c.id] || ''}
      selectedKeys={selection}
      onSelectedKeysChange={setSelection}
      renderItem={(card, _vm, selected, idx) => (
        <div className={`flex items-center gap-2 text-sm cursor-pointer select-none rounded px-2 py-0.5 ${selected ? (idx % 2 === 0 ? 'bg-primary/10' : 'bg-primary/5') : idx % 2 === 0 ? 'bg-muted/30' : ''} hover:bg-accent/40`}>
          <Checkbox checked={selected} className="pointer-events-none shrink-0" tabIndex={-1} />
          <span className="truncate flex-1">{card.name}</span>
        </div>
      )}
      toolbar={<><PortalDropdown
        trigger={({ ref, onClick }) => (
          <Button ref={ref} size="sm" variant="ghost" onClick={onClick} disabled={selectedCount === 0} title="Export">
            <Download className="h-4 w-4" />
          </Button>
        )}
      >
        {(close) => (
          <div className="min-w-[140px] space-y-0.5">
            <button className="w-full text-left text-sm px-3 py-1.5 rounded hover:bg-accent/50 transition-colors" onClick={() => { exportCsv(); close() }}>
              Export CSV
            </button>
            <button className="w-full text-left text-sm px-3 py-1.5 rounded hover:bg-accent/50 transition-colors disabled:opacity-40" disabled={exporting || !layout} onClick={() => { exportTts(); close() }}>
              {exporting ? 'Exporting...' : 'Export TTS'}
            </button>
          </div>
        )}
      </PortalDropdown>
      <Button size="sm" variant="ghost" disabled={selectedCount === 0} onClick={() => navigate(printUrl)} title="Print">
        <Printer className="h-4 w-4" />
      </Button></>}
      empty={<p className="text-sm text-muted-foreground">No cards.</p>}
    />
  )
}
