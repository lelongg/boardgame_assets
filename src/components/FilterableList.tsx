import { useState, useRef, useEffect, useCallback, type ReactNode } from 'react'
import { Minus, Plus, Eye, List, LayoutGrid, GalleryHorizontalEnd, ChevronLeft, ChevronRight } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import useFuzzyFilter from '@/hooks/useFuzzyFilter'
import CollapsibleHeader, { useCollapsible } from '@/components/ui/CollapsibleHeader'
import ZoomablePreview from '@/components/ZoomablePreview'
import CardThumbnail from '@/components/CardThumbnail'

export type ViewMode = 'compact' | 'detailed' | 'gallery' | 'preview'

type FilterableListProps<T> = {
  title: string
  items: T[]
  getKey: (item: T) => string
  getName: (item: T) => string
  getPreviewSrc?: (item: T) => string
  getGroup?: (item: T) => string | undefined
  selectedKey?: string | null
  onSelect?: (key: string | null) => void
  selectedKeys?: Set<string>
  onSelectedKeysChange?: (keys: Set<string>) => void
  renderItem: (item: T, viewMode: ViewMode, selected: boolean, index: number) => ReactNode
  toolbar?: ReactNode
  actions?: ReactNode
  drawer?: ReactNode
  subheader?: ReactNode
  empty?: ReactNode
  maxHeight?: string
  grid?: { colsKey: string; defaultCols?: number }
  viewMode?: { key: string; default?: ViewMode }
}

const COL_WIDTH = 120

export default function FilterableList<T>({ title, items, getKey, getName, getPreviewSrc, getGroup, selectedKey, onSelect, selectedKeys, onSelectedKeysChange, renderItem, toolbar, actions, drawer, subheader, empty, maxHeight = '60vh', grid: gridProp, viewMode: viewModeProp }: FilterableListProps<T>) {
  const multiSelect = !!(selectedKeys && onSelectedKeysChange)
  const [hoverThumb, setHoverThumb] = useState<{ src: string; x: number; y: number } | null>(null)
  const [collapsedGroups, setCollapsedGroups] = useState<Set<string>>(new Set())
  const [filtered, filterInput] = useFuzzyFilter(items, getName)
  const { collapsed, toggle } = useCollapsible()
  const containerRef = useRef<HTMLDivElement>(null)
  const itemRefs = useRef<Map<string, HTMLElement>>(new Map())
  const carouselRefs = useRef<Map<string, HTMLElement>>(new Map())
  const needsInit = useRef(false)
  const carouselScrollRef = useRef<HTMLDivElement>(null)
  const [canScrollLeft, setCanScrollLeft] = useState(false)
  const [canScrollRight, setCanScrollRight] = useState(false)
  const updateCarouselScroll = useCallback(() => {
    const el = carouselScrollRef.current
    if (!el) return
    setCanScrollLeft(el.scrollLeft > 1)
    setCanScrollRight(el.scrollLeft + el.clientWidth < el.scrollWidth - 1)
  }, [])

  const [mode, setMode] = useState<ViewMode>(() => {
    if (!viewModeProp) return gridProp ? 'gallery' : 'compact'
    try {
      const saved = localStorage.getItem(viewModeProp.key)
      if (saved === 'compact' || saved === 'detailed' || saved === 'gallery' || saved === 'preview') return saved
    } catch {}
    return viewModeProp.default ?? 'compact'
  })

  useEffect(() => {
    if (!selectedKey) return
    if (mode === 'preview') {
      carouselRefs.current.get(selectedKey)?.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'center' })
      setTimeout(updateCarouselScroll, 100)
    }
    itemRefs.current.get(selectedKey)?.scrollIntoView({ behavior: 'smooth', block: 'nearest' })
  }, [selectedKey, mode])

  useEffect(() => {
    if (mode === 'preview') setTimeout(updateCarouselScroll, 50)
  }, [mode])

  const hasPreviewMode = !!(gridProp && getPreviewSrc)
  const cycleMode = viewModeProp ? () => setMode(m => {
    const next: ViewMode = m === 'compact' ? 'detailed'
      : m === 'detailed' ? 'gallery'
      : m === 'gallery' && hasPreviewMode ? 'preview'
      : 'compact'
    if (next === 'preview' && !selectedKey && items.length > 0) onSelect?.(getKey(items[0]))
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

  const isItemSelected = (item: T) => multiSelect ? selectedKeys!.has(getKey(item)) : getKey(item) === selectedKey
  const handleItemClick = (item: T) => {
    const k = getKey(item)
    if (multiSelect) {
      const next = new Set(selectedKeys!)
      next.has(k) ? next.delete(k) : next.add(k)
      onSelectedKeysChange!(next)
    } else {
      onSelect?.(k)
    }
  }
  const allFilteredSelected = multiSelect && filtered.length > 0 && filtered.every(i => selectedKeys!.has(getKey(i)))
  const selectAllFiltered = (checked: boolean) => {
    if (!multiSelect) return
    const next = new Set(selectedKeys!)
    for (const item of filtered) {
      const k = getKey(item)
      if (checked) next.add(k); else next.delete(k)
    }
    onSelectedKeysChange!(next)
  }

  const hasSubheader = true
  const selectedItem = selectedKey ? items.find(i => getKey(i) === selectedKey) : null
  const selectedIdx = selectedItem ? items.indexOf(selectedItem) : -1
  const previewSrc = selectedItem && getPreviewSrc ? getPreviewSrc(selectedItem) : ''
  const showBigPreview = mode === 'preview' && getPreviewSrc && selectedItem

  return (<>
    {hoverThumb && (
      <div className="pointer-events-none fixed z-50" style={{ left: hoverThumb.x + 16, top: hoverThumb.y - 80, width: 120 }}>
        <CardThumbnail src={hoverThumb.src} name="" />
      </div>
    )}
    <div ref={containerRef} className="rounded-lg border bg-card flex flex-col" style={{ [showBigPreview ? 'height' : 'maxHeight']: collapsed ? undefined : maxHeight }}>
      <CollapsibleHeader collapsed={collapsed} onToggle={toggle}>
        <span className="text-sm font-semibold">{title}</span>
        <div className="ml-auto flex items-center gap-1" onClick={(e) => e.stopPropagation()}>
          {filterInput}
          {cycleMode && (
            <Button size="sm" variant="ghost" onClick={cycleMode} title={mode === 'compact' ? 'Detailed view' : mode === 'detailed' ? 'Gallery view' : mode === 'gallery' ? (hasPreviewMode ? 'Preview' : 'Compact view') : 'Compact view'}>
              {mode === 'compact' ? <GalleryHorizontalEnd className="h-4 w-4" /> : mode === 'detailed' ? <LayoutGrid className="h-4 w-4" /> : mode === 'gallery' ? (hasPreviewMode ? <Eye className="h-4 w-4" /> : <List className="h-4 w-4" />) : <List className="h-4 w-4" />}
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
              {multiSelect && (
                <label className="flex items-center gap-2 text-sm text-muted-foreground cursor-pointer select-none shrink-0">
                  <Checkbox checked={allFilteredSelected} onCheckedChange={(checked) => selectAllFiltered(!!checked)} />
                  <span className="text-xs">{items.filter(i => selectedKeys!.has(getKey(i))).length}/{items.length}</span>
                </label>
              )}
              {subheader && <div className="flex items-center gap-1 ml-2">{subheader}</div>}
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
                    selected={isItemSelected(item)}
                    onClick={() => handleItemClick(item)}
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
                {filtered.map((item, idx) => {
                  const k = getKey(item)
                  return <div key={k} ref={(el) => { if (el) itemRefs.current.set(k, el); else itemRefs.current.delete(k) }} onClick={() => handleItemClick(item)}>{renderItem(item, mode, isItemSelected(item), idx)}</div>
                })}
              </div>
            ) : (() => {
              const renderListItem = (item: T, idx: number) => {
                const k = getKey(item)
                const previewSrc = getPreviewSrc?.(item)
                return <div key={k}
                  ref={(el) => { if (el) itemRefs.current.set(k, el); else itemRefs.current.delete(k) }}
                  onClick={() => handleItemClick(item)}
                  onMouseEnter={(e) => { if (previewSrc?.length) setHoverThumb({ src: previewSrc, x: e.clientX, y: e.clientY }) }}
                  onMouseMove={(e) => { if (previewSrc?.length) setHoverThumb(prev => prev ? { ...prev, x: e.clientX, y: e.clientY } : null) }}
                  onMouseLeave={() => setHoverThumb(null)}
                >{renderItem(item, mode, isItemSelected(item), idx)}</div>
              }

              const groupNames = getGroup ? [...new Set(filtered.map(getGroup).filter(Boolean))] as string[] : []
              const hasGroups = groupNames.length > 1

              if (!hasGroups) return <div className="p-1">{filtered.map(renderListItem)}</div>

              let globalIdx = 0
              return <div className="p-1">{groupNames.map(groupName => {
                const groupItems = filtered.filter(i => getGroup!(i) === groupName)
                if (groupItems.length === 0) return null
                const isGroupCollapsed = collapsedGroups.has(groupName)
                const groupAllSelected = multiSelect && groupItems.every(i => selectedKeys!.has(getKey(i)))
                const toggleGroup = () => {
                  if (!multiSelect) return
                  const next = new Set(selectedKeys!)
                  if (groupAllSelected) groupItems.forEach(i => next.delete(getKey(i)))
                  else groupItems.forEach(i => next.add(getKey(i)))
                  onSelectedKeysChange!(next)
                }
                const toggleCollapse = () => setCollapsedGroups(prev => {
                  const next = new Set(prev)
                  next.has(groupName) ? next.delete(groupName) : next.add(groupName)
                  return next
                })
                const startIdx = globalIdx
                globalIdx += groupItems.length
                return <div key={groupName}>
                  <div className="flex items-center gap-2 text-xs font-semibold uppercase text-muted-foreground pt-2 pb-1 border-b mb-1 select-none px-1">
                    {multiSelect && <Checkbox checked={groupAllSelected} onCheckedChange={toggleGroup} className="cursor-pointer" />}
                    <span className="cursor-pointer flex-1" onClick={toggleCollapse}>
                      {groupName} <span className="text-[0.65rem] font-normal text-muted-foreground ml-1">
                        {multiSelect ? `${groupItems.filter(i => selectedKeys!.has(getKey(i))).length}/` : ''}{groupItems.length}
                      </span>
                    </span>
                    <button onClick={toggleCollapse} className="text-muted-foreground hover:text-foreground transition-colors">
                      {isGroupCollapsed ? '▸' : '▾'}
                    </button>
                  </div>
                  {!isGroupCollapsed && groupItems.map((item, i) => renderListItem(item, startIdx + i))}
                </div>
              })}</div>
            })()}
          </div>
        )}
      </>}
    </div>
  </>)
}
