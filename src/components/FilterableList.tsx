import { useState, useRef, useEffect, useCallback, type ReactNode } from 'react'
import { Minus, Plus, Eye, List, LayoutGrid, GalleryHorizontalEnd, ChevronLeft, ChevronRight, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import useFuzzyFilter from '@/hooks/useFuzzyFilter'
import CollapsibleHeader, { useCollapsible } from '@/components/ui/CollapsibleHeader'
import ZoomablePreview from '@/components/ZoomablePreview'
import CardThumbnail from '@/components/CardThumbnail'

export type ViewMode = 'compact' | 'detailed' | 'gallery'

type FilterableListProps<T> = {
  title: string
  items: T[]
  getKey: (item: T) => string
  getName: (item: T) => string
  getPreviewSrc?: (item: T) => string
  selectedKey?: string | null
  onSelect?: (key: string | null) => void
  renderItem: (item: T, viewMode: ViewMode) => ReactNode
  toolbar?: ReactNode
  actions?: ReactNode
  drawer?: ReactNode
  empty?: ReactNode
  maxHeight?: string
  grid?: { colsKey: string; defaultCols?: number }
  viewMode?: { key: string; default?: ViewMode }
}

const COL_WIDTH = 120

export default function FilterableList<T>({ title, items, getKey, getName, getPreviewSrc, selectedKey, onSelect, renderItem, toolbar, actions, drawer, empty, maxHeight = '60vh', grid: gridProp, viewMode: viewModeProp }: FilterableListProps<T>) {
  const [filtered, filterInput] = useFuzzyFilter(items, getName)
  const { collapsed, toggle } = useCollapsible()
  const containerRef = useRef<HTMLDivElement>(null)
  const itemRefs = useRef<Map<string, HTMLElement>>(new Map())
  const carouselRefs = useRef<Map<string, HTMLElement>>(new Map())
  const needsInit = useRef(false)
  const bigPreviewKey = viewModeProp ? `${viewModeProp.key}:bigPreview` : null
  const [bigPreview, setBigPreview_] = useState(() => {
    if (!bigPreviewKey) return false
    try { return localStorage.getItem(bigPreviewKey) === '1' } catch { return false }
  })
  const setBigPreview = (v: boolean) => {
    setBigPreview_(v)
    if (bigPreviewKey) { try { if (v) localStorage.setItem(bigPreviewKey, '1'); else localStorage.removeItem(bigPreviewKey) } catch {} }
  }
  const carouselScrollRef = useRef<HTMLDivElement>(null)
  const [canScrollLeft, setCanScrollLeft] = useState(false)
  const [canScrollRight, setCanScrollRight] = useState(false)
  const updateCarouselScroll = useCallback(() => {
    const el = carouselScrollRef.current
    if (!el) return
    setCanScrollLeft(el.scrollLeft > 1)
    setCanScrollRight(el.scrollLeft + el.clientWidth < el.scrollWidth - 1)
  }, [])

  useEffect(() => {
    if (!selectedKey) return
    if (bigPreview) {
      carouselRefs.current.get(selectedKey)?.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'center' })
      setTimeout(updateCarouselScroll, 100)
    }
    itemRefs.current.get(selectedKey)?.scrollIntoView({ behavior: 'smooth', block: 'nearest' })
  }, [selectedKey, bigPreview])

  useEffect(() => {
    if (bigPreview) setTimeout(updateCarouselScroll, 50)
  }, [bigPreview])

  const [mode, setMode] = useState<ViewMode>(() => {
    if (!viewModeProp) return gridProp ? 'gallery' : 'compact'
    try {
      const saved = localStorage.getItem(viewModeProp.key)
      if (saved === 'compact' || saved === 'detailed' || saved === 'gallery') return saved
    } catch {}
    return viewModeProp.default ?? 'compact'
  })

  const cycleMode = viewModeProp ? () => setMode(m => {
    const next: ViewMode = m === 'compact' ? 'detailed' : m === 'detailed' ? 'gallery' : 'compact'
    localStorage.setItem(viewModeProp.key, next)
    return next
  }) : undefined

  const isGrid = mode === 'gallery' && gridProp

  const [cols, setCols] = useState(() => {
    if (!gridProp) return 0
    try {
      const saved = localStorage.getItem(gridProp.colsKey)
      if (saved) return Number(saved) || gridProp.defaultCols || 4
    } catch {}
    needsInit.current = true
    return gridProp.defaultCols || 4
  })

  useEffect(() => {
    if (!gridProp || !needsInit.current) return
    const el = containerRef.current
    if (!el) return
    const w = el.clientWidth
    if (w > 0) {
      const v = Math.max(1, Math.min(8, Math.floor(w / COL_WIDTH)))
      setCols(v)
      localStorage.setItem(gridProp.colsKey, String(v))
    }
    needsInit.current = false
  }, [!!gridProp])

  const setColsUser = (fn: (c: number) => number) => {
    setCols(c => {
      const v = fn(c)
      if (gridProp) localStorage.setItem(gridProp.colsKey, String(v))
      return v
    })
  }

  const hasSubheader = isGrid || actions
  const selectedItem = selectedKey ? items.find(i => getKey(i) === selectedKey) : null
  const selectedIdx = selectedItem ? items.indexOf(selectedItem) : -1
  const previewSrc = selectedItem && getPreviewSrc ? getPreviewSrc(selectedItem) : ''
  const showBigPreview = bigPreview && isGrid && getPreviewSrc && selectedItem

  return (
    <div ref={containerRef} className="rounded-lg border bg-card flex flex-col" style={{ [showBigPreview ? 'height' : 'maxHeight']: collapsed ? undefined : maxHeight }}>
      <CollapsibleHeader collapsed={collapsed} onToggle={toggle}>
        <span className="text-sm font-semibold">{title}</span>
        <div className="ml-auto flex items-center gap-1" onClick={(e) => e.stopPropagation()}>
          {filterInput}
          {cycleMode && (
            <Button size="sm" variant="ghost" onClick={cycleMode} title={mode === 'compact' ? 'Detailed view' : mode === 'detailed' ? 'Gallery view' : 'Compact view'}>
              {mode === 'compact' ? <LayoutGrid className="h-4 w-4" /> : mode === 'detailed' ? <GalleryHorizontalEnd className="h-4 w-4" /> : <List className="h-4 w-4" />}
            </Button>
          )}
          {toolbar}
        </div>
      </CollapsibleHeader>
      {!collapsed && <>
        {drawer && <div className="shrink-0">{drawer}</div>}
        {hasSubheader && (
          <div className="flex items-center gap-1 px-2 py-1 border-b shrink-0">
            {showBigPreview ? (<>
              <button className="rounded p-1 text-muted-foreground hover:text-foreground transition-colors" title="Close"
                onClick={() => setBigPreview(false)}>
                <X className="h-3.5 w-3.5" />
              </button>
              <span className="text-xs font-medium truncate">{getName(selectedItem!)}</span>
              <div className="flex items-center gap-1 ml-auto">
                <button className="rounded p-1 text-muted-foreground hover:text-foreground disabled:opacity-30 transition-colors"
                  disabled={selectedIdx <= 0}
                  onClick={() => { if (selectedIdx > 0) onSelect?.(getKey(items[selectedIdx - 1])) }}
                  title="Previous"><ChevronLeft className="h-3.5 w-3.5" /></button>
                <span className="text-xs text-muted-foreground">{selectedIdx + 1}/{items.length}</span>
                <button className="rounded p-1 text-muted-foreground hover:text-foreground disabled:opacity-30 transition-colors"
                  disabled={selectedIdx >= items.length - 1}
                  onClick={() => { if (selectedIdx < items.length - 1) onSelect?.(getKey(items[selectedIdx + 1])) }}
                  title="Next"><ChevronRight className="h-3.5 w-3.5" /></button>
                {actions}
              </div>
            </>) : (<>
              {isGrid && <>
                <button className="rounded p-1 text-muted-foreground hover:text-foreground disabled:opacity-30" disabled={cols <= 1}
                  onClick={() => setColsUser(c => Math.max(1, c - 1))} title="Larger">
                  <Minus className="h-3.5 w-3.5" />
                </button>
                <span className="text-xs text-muted-foreground w-6 text-center">{cols}</span>
                <button className="rounded p-1 text-muted-foreground hover:text-foreground disabled:opacity-30" disabled={cols >= 8}
                  onClick={() => setColsUser(c => Math.min(8, c + 1))} title="Smaller">
                  <Plus className="h-3.5 w-3.5" />
                </button>
              </>}
              <div className="flex items-center gap-1 ml-auto">
                {isGrid && getPreviewSrc && (
                  <button
                    className="rounded p-1 text-muted-foreground hover:text-foreground transition-colors"
                    title="Preview"
                    onClick={() => {
                      if (!selectedKey && items.length > 0) onSelect?.(getKey(items[0]))
                      setBigPreview(true)
                    }}
                  >
                    <Eye className="h-3.5 w-3.5" />
                  </button>
                )}
                {actions}
              </div>
            </>)}
          </div>
        )}
        {showBigPreview ? (<>
          <div className="overflow-hidden [&>*]:h-full [&>*]:border-0 [&>*]:rounded-none" style={{ height: 'calc(100% - 6.5rem)' }}>
            <ZoomablePreview src={previewSrc} alt={getName(selectedItem!)} maxImgHeight="100%" />
          </div>
          <div className="relative h-[6.5rem] shrink-0 border-t bg-card">
            <div
              ref={carouselScrollRef}
              className="h-full flex gap-2 overflow-x-scroll overflow-y-hidden p-2 min-w-0 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
              onScroll={updateCarouselScroll}
              onWheel={(e) => { e.currentTarget.scrollLeft += e.deltaY; e.preventDefault() }}>
              {items.map(item => (
                <div key={getKey(item)} className="flex-shrink-0 w-16"
                  ref={(el) => { const k = getKey(item); if (el) carouselRefs.current.set(k, el); else carouselRefs.current.delete(k) }}>
                  <CardThumbnail
                    src={getPreviewSrc!(item)}
                    name={getName(item)}
                    aspectRatio="1"
                    selected={getKey(item) === selectedKey}
                    onClick={() => onSelect?.(getKey(item))}
                  />
                </div>
              ))}
            </div>
            {canScrollLeft && <div className="pointer-events-none absolute left-0 inset-y-0 w-8 bg-gradient-to-r from-muted-foreground/25 to-transparent" />}
            {canScrollRight && <div className="pointer-events-none absolute right-0 inset-y-0 w-8 bg-gradient-to-l from-muted-foreground/25 to-transparent" />}
          </div>
        </>) : items.length === 0 ? (
          <div className="flex-1 flex items-center justify-center p-8">
            {empty || <p className="text-sm text-muted-foreground">No items.</p>}
          </div>
        ) : (
          <div className="overflow-y-scroll min-h-0">
            {isGrid ? (
              <div className="grid gap-3 p-4" style={{ gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))` }}>
                {filtered.map(item => {
                  const k = getKey(item)
                  return <div key={k} ref={(el) => { if (el) itemRefs.current.set(k, el); else itemRefs.current.delete(k) }}>{renderItem(item, mode)}</div>
                })}
              </div>
            ) : (
              <div className="space-y-2 p-2">
                {filtered.map(item => {
                  const k = getKey(item)
                  return <div key={k} ref={(el) => { if (el) itemRefs.current.set(k, el); else itemRefs.current.delete(k) }}>{renderItem(item, mode)}</div>
                })}
              </div>
            )}
          </div>
        )}
      </>}
    </div>
  )
}
