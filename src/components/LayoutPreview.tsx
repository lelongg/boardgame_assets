import { useState, useEffect, useRef } from 'react'
import { LayoutGrid, Layers, ChevronDown } from 'lucide-react'
import ZoomablePreview from './ZoomablePreview'
import type { CardData, CardLayout } from '../types'

const PX_PER_MM = 300 / 25.4

type PreviewCard = CardData & { collectionName?: string }

type LayoutPreviewProps = {
  layout: CardLayout
  gameId: string
  cards?: PreviewCard[]
  back?: string
  gameFonts?: Record<string, { name: string; file: string }>
  selectedNodeId?: string | null
  onNodeClick?: (id: string) => void
}

function CardPicker({ cards, value, onChange }: { cards: PreviewCard[]; value: string | null; onChange: (id: string | null) => void }) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)
  const selected = value ? cards.find(c => c.id === value) : null

  useEffect(() => {
    if (!open) return
    const close = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false) }
    document.addEventListener('mousedown', close)
    return () => document.removeEventListener('mousedown', close)
  }, [open])

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen(!open)}
        className="flex items-center gap-1 rounded border bg-background px-1.5 py-0.5 text-xs max-w-[140px] hover:bg-accent/50 transition-colors"
      >
        <span className="truncate">{selected?.name ?? 'Layout view'}</span>
        <ChevronDown className="h-3 w-3 shrink-0 opacity-50" />
      </button>
      {open && (
        <div className="absolute top-full right-0 mt-1 z-50 w-max min-w-[12rem] rounded-md border bg-popover shadow-md py-1 max-h-60 overflow-y-auto">
          <button
            className={`w-full text-left px-2 py-1 text-xs hover:bg-accent/50 transition-colors ${!value ? 'bg-accent/30 font-medium' : ''}`}
            onClick={() => { onChange(null); setOpen(false) }}
          >Layout view</button>
          {cards.map(c => (
            <button
              key={c.id}
              className={`w-full flex items-center justify-between gap-2 px-2 py-1 text-xs hover:bg-accent/50 transition-colors ${value === c.id ? 'bg-accent/30 font-medium' : ''}`}
              onClick={() => { onChange(c.id); setOpen(false) }}
            >
              <span className="truncate">{c.name}</span>
              {c.collectionName && <span className="shrink-0 italic text-muted-foreground">{c.collectionName}</span>}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

export default function LayoutPreview({ layout, gameId, cards = [], back, gameFonts, selectedNodeId, onNodeClick }: LayoutPreviewProps) {
  const [showSections, setShowSections] = useState(true)
  const [showItemWires, setShowItemWires] = useState(true)
  const [previewCardId, setPreviewCardId] = useState<string | null>(null)
  const [previewUrl, setPreviewUrl] = useState('')
  const [hitAreas, setHitAreas] = useState<{ id: string; x: number; y: number; width: number; height: number }[]>([])

  const previewCard = previewCardId ? cards.find(c => c.id === previewCardId) : null

  useEffect(() => {
    if (!layout) { setPreviewUrl(''); return }
    let cancelled = false
    const update = async () => {
      const render = await import('../render')
      let svg = render.renderLayoutSvg(layout, { showSections, showItems: showItemWires, selectedNodeId, card: previewCard ?? undefined, fonts: gameFonts })
      svg = await render.embedFontsInSvg(svg, gameId, gameFonts ?? {})
      svg = await render.embedImagesInSvg(svg)
      if (cancelled) return
      const computed = render.computeLayout(layout)
      setHitAreas([
        ...Array.from(computed.sections.entries()).map(([id, r]: [string, any]) => ({ id, ...r })),
        ...Array.from(computed.items.entries()).map(([id, r]: [string, any]) => ({ id, ...r })),
      ])
      const blob = new Blob([svg], { type: 'image/svg+xml' })
      const url = URL.createObjectURL(blob)
      setPreviewUrl(prev => { if (prev) URL.revokeObjectURL(prev); return url })
    }
    update()
    return () => { cancelled = true }
  }, [layout, gameId, showSections, showItemWires, selectedNodeId, previewCard,back])

  if (!previewUrl) return null

  return (
    <ZoomablePreview
      src={previewUrl}
      alt="Layout preview"
      svgWidth={Math.round(layout.width * PX_PER_MM)}
      svgHeight={Math.round(layout.height * PX_PER_MM)}
      hitAreas={hitAreas}
      selectedHitAreaId={selectedNodeId}
      onHitAreaClick={onNodeClick}
      extraButtons={<>
        {cards.length > 0 && <CardPicker cards={cards} value={previewCardId} onChange={setPreviewCardId} />}
        <button
          onClick={() => setShowSections(s => !s)}
          className={`rounded p-1 transition-colors ${showSections ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:text-foreground'}`}
          title={showSections ? 'Hide sections' : 'Show sections'}
        >
          <LayoutGrid className="h-4 w-4" />
        </button>
        <button
          onClick={() => setShowItemWires(s => !s)}
          className={`rounded p-1 transition-colors ${showItemWires ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:text-foreground'}`}
          title={showItemWires ? 'Hide items' : 'Show items'}
        >
          <Layers className="h-4 w-4" />
        </button>
      </>}
    />
  )
}
