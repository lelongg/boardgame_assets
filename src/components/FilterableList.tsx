import { useState, useRef, useEffect, useCallback, useMemo, type ReactNode } from 'react'
import { Minus, Plus, Eye, List, LayoutGrid, GalleryHorizontalEnd, ChevronLeft, ChevronRight, TextCursorInput, Check, X, Tags, ArrowUpNarrowWide, ArrowDownWideNarrow, ListFilter } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import useFuzzyFilter from '@/hooks/useFuzzyFilter'
import CollapsibleHeader, { useCollapsible } from '@/components/ui/CollapsibleHeader'
import ZoomablePreview from '@/components/ZoomablePreview'
import CardThumbnail from '@/components/CardThumbnail'

export type ViewMode = 'compact' | 'detailed' | 'gallery' | 'preview'

export type SortBy = 'name' | 'tag' | 'created' | 'updated'
type SortState = { by: SortBy; dir: 'asc' | 'desc' }
// Names/tags read naturally A→Z; dates read naturally newest-first.
const DEFAULT_DIR: Record<SortBy, 'asc' | 'desc'> = { name: 'asc', tag: 'asc', created: 'desc', updated: 'desc' }
const naturalCompare = new Intl.Collator(undefined, { numeric: true, sensitivity: 'base' }).compare

/** Small pill badges for an item's tags — drop into any renderItem. */
export function TagBadges({ tags }: { tags?: string[] }) {
  if (!tags?.length) return null
  return (
    <span className="inline-flex flex-wrap items-center gap-1">
      {tags.map(t => (
        <span key={t} className="rounded-full bg-primary/10 px-1.5 py-0.5 text-[10px] leading-none text-primary whitespace-nowrap">{t}</span>
      ))}
    </span>
  )
}

type FilterableListProps<T> = {
  title: string
  items: T[]
  getKey: (item: T) => string
  getName: (item: T) => string
  getPreviewSrc?: (item: T) => string
  /** Rendered back of the item — enables the flip button (and the 3D back face) in the big preview. */
  getBackSrc?: (item: T) => string | undefined
  getGroup?: (item: T) => string | undefined
  // Custom tags: when provided, tags join the fuzzy filter, enable tag
  // sorting, and (with onTagsChange) an editor for the selected item.
  getTags?: (item: T) => string[] | undefined
  onTagsChange?: (key: string, tags: string[]) => void | Promise<void>
  // ISO timestamps enabling created/modified sorting
  getCreatedAt?: (item: T) => string | undefined
  getUpdatedAt?: (item: T) => string | undefined
  // Enables the sort control; the key persists the choice in localStorage
  sort?: { key: string }
  selectedKey?: string | null
  onSelect?: (key: string | null) => void
  onRename?: (key: string, newName: string) => void | Promise<void>
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

export default function FilterableList<T>({ title, items, getKey, getName, getPreviewSrc, getBackSrc, getGroup, getTags, onTagsChange, getCreatedAt, getUpdatedAt, sort: sortProp, selectedKey, onSelect, onRename, selectedKeys, onSelectedKeysChange, renderItem, toolbar, actions, drawer, subheader, empty, maxHeight = '60vh', grid: gridProp, viewMode: viewModeProp }: FilterableListProps<T>) {
  const multiSelect = !!(selectedKeys && onSelectedKeysChange)
  const [hoverThumb, setHoverThumb] = useState<{ src: string; x: number; y: number } | null>(null)
  const [collapsedGroups, setCollapsedGroups] = useState<Set<string>>(new Set())
  // Tags take part in fuzzy filtering, so typing a tag narrows the list.
  const [matched, filterInput] = useFuzzyFilter(items, getTags ? (i: T) => `${getName(i)} ${(getTags(i) ?? []).join(' ')}` : getName)

  // ── Sorting ─────────────────────────────────────────────────────
  const sortOptions = useMemo(() => {
    const opts: { value: SortBy; label: string }[] = [{ value: 'name', label: 'Name' }]
    if (getTags) opts.push({ value: 'tag', label: 'Tag' })
    if (getCreatedAt) opts.push({ value: 'created', label: 'Created' })
    if (getUpdatedAt) opts.push({ value: 'updated', label: 'Modified' })
    return opts
  }, [!!getTags, !!getCreatedAt, !!getUpdatedAt])
  const [sort, setSort] = useState<SortState>(() => {
    if (sortProp) {
      try {
        const saved = JSON.parse(localStorage.getItem(sortProp.key) ?? 'null')
        if (saved && ['name', 'tag', 'created', 'updated'].includes(saved.by) && ['asc', 'desc'].includes(saved.dir)) return saved
      } catch {}
    }
    return { by: 'name', dir: 'asc' }
  })
  const setSortPersist = (s: SortState) => {
    setSort(s)
    if (sortProp) try { localStorage.setItem(sortProp.key, JSON.stringify(s)) } catch {}
  }
  // A persisted choice may reference accessors this list no longer provides.
  const sortBy: SortBy = sortOptions.some(o => o.value === sort.by) ? sort.by : 'name'

  // ── Tag filter (select tags to narrow the list) ─────────────────
  const [tagFilter, setTagFilter] = useState<Set<string>>(new Set())
  const [tagFilterOpen, setTagFilterOpen] = useState(false)
  const allTags = useMemo(
    () => getTags ? [...new Set(items.flatMap(i => getTags(i) ?? []))].sort(naturalCompare) : [],
    [items, getTags]
  )
  // Drop filter entries whose tag no longer exists anywhere (e.g. removed
  // from its last item) so the list can't get stuck empty.
  useEffect(() => {
    setTagFilter(prev => {
      if (![...prev].some(t => !allTags.includes(t))) return prev
      return new Set([...prev].filter(t => allTags.includes(t)))
    })
  }, [allTags])

  const filtered = useMemo(() => {
    const dirMul = sort.dir === 'desc' ? -1 : 1
    const byName = (a: T, b: T) => naturalCompare(getName(a), getName(b))
    // Selected filter tags narrow progressively: an item must carry them all.
    const arr = tagFilter.size > 0
      ? matched.filter(i => { const ts = getTags?.(i) ?? []; return [...tagFilter].every(t => ts.includes(t)) })
      : [...matched]
    if (sortBy === 'name') return arr.sort((a, b) => dirMul * byName(a, b))
    const sortValue = (item: T): string | undefined => {
      if (sortBy === 'tag') {
        const tags = getTags?.(item) ?? []
        return tags.length ? [...tags].sort(naturalCompare)[0] : undefined
      }
      return (sortBy === 'created' ? getCreatedAt?.(item) : getUpdatedAt?.(item)) || undefined
    }
    return arr.sort((a, b) => {
      const va = sortValue(a), vb = sortValue(b)
      // Items without a tag/date always sort last, whatever the direction.
      if (va === undefined && vb === undefined) return byName(a, b)
      if (va === undefined) return 1
      if (vb === undefined) return -1
      const cmp = sortBy === 'tag' ? naturalCompare(va, vb) : (va < vb ? -1 : va > vb ? 1 : 0)
      return dirMul * cmp || byName(a, b)
    })
  }, [matched, tagFilter, sortBy, sort.dir, getName, getTags, getCreatedAt, getUpdatedAt])

  // ── Tag editing (selected item) ─────────────────────────────────
  const [editingTags, setEditingTags] = useState(false)
  const [tagDraft, setTagDraft] = useState('')
  // Custom suggestions dropdown — a native <datalist> renders nothing in
  // several browsers, so existing tags get a real, clickable list instead.
  const [tagSuggestionsOpen, setTagSuggestionsOpen] = useState(false)
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
  const [renaming, setRenaming] = useState(false)
  const [renameDraft, setRenameDraft] = useState('')
  useEffect(() => { setRenaming(false); setTagDraft('') }, [selectedKey])
  const startRename = () => {
    if (!selectedItem) return
    setRenameDraft(getName(selectedItem))
    setRenaming(true)
  }
  const commitRename = () => {
    setRenaming(false)
    if (!selectedItem) return
    const name = renameDraft.trim()
    if (!name || name === getName(selectedItem)) return
    onRename?.(getKey(selectedItem), name)
  }
  const renameButton = onRename && selectedItem ? (
    <button className="rounded p-1 text-muted-foreground hover:text-foreground transition-colors" title="Rename"
      onClick={startRename}>
      <TextCursorInput className="h-4 w-4" />
    </button>
  ) : null
  const tagsButton = onTagsChange && getTags && selectedItem ? (
    <button className={`rounded p-1 transition-colors ${editingTags ? 'text-primary' : 'text-muted-foreground hover:text-foreground'}`} title="Edit tags"
      onClick={() => setEditingTags(v => !v)}>
      <Tags className="h-4 w-4" />
    </button>
  ) : null
  const selectedTags = selectedItem && getTags ? (getTags(selectedItem) ?? []) : []
  const addTag = () => {
    if (!selectedItem || !onTagsChange) return
    const tag = tagDraft.trim()
    setTagDraft('')
    if (!tag || selectedTags.includes(tag)) return
    onTagsChange(getKey(selectedItem), [...selectedTags, tag])
  }
  const toggleFilterTag = (tag: string) => {
    setTagFilter(prev => {
      const next = new Set(prev)
      next.has(tag) ? next.delete(tag) : next.add(tag)
      return next
    })
  }
  const tagFilterControl = getTags && allTags.length > 0 ? (
    <div className="relative" onClick={(e) => e.stopPropagation()}>
      <button
        className={`flex items-center gap-0.5 rounded p-1 transition-colors ${tagFilter.size > 0 || tagFilterOpen ? 'text-primary' : 'text-muted-foreground hover:text-foreground'}`}
        title="Filter by tags"
        onClick={() => setTagFilterOpen(v => !v)}>
        <ListFilter className="h-3.5 w-3.5" />
        {tagFilter.size > 0 && <span className="text-[10px] leading-none">{tagFilter.size}</span>}
      </button>
      {tagFilterOpen && <>
        <div className="fixed inset-0 z-10" onClick={() => setTagFilterOpen(false)} />
        <div className="absolute left-0 top-full z-20 mt-1 max-h-48 w-44 overflow-y-auto rounded-md border bg-card py-1 shadow-md">
          {allTags.map(tag => {
            const active = tagFilter.has(tag)
            return (
              <button key={tag} type="button"
                className="flex w-full items-center gap-2 px-2 py-1 text-left text-xs hover:bg-muted transition-colors"
                onClick={() => toggleFilterTag(tag)}>
                <Check className={`h-3 w-3 shrink-0 ${active ? 'text-primary' : 'text-transparent'}`} />
                <span className={`truncate ${active ? 'text-primary font-medium' : ''}`}>{tag}</span>
              </button>
            )
          })}
          {tagFilter.size > 0 && (
            <button type="button"
              className="mt-1 flex w-full items-center gap-2 border-t px-2 py-1 pt-1.5 text-left text-xs text-muted-foreground hover:text-foreground transition-colors"
              onClick={() => setTagFilter(new Set())}>
              <X className="h-3 w-3 shrink-0" />
              Clear filter
            </button>
          )}
        </div>
      </>}
    </div>
  ) : null
  const sortControl = sortProp ? (
    <div className="flex items-center" onClick={(e) => e.stopPropagation()}>
      <select
        value={sortBy}
        onChange={(e) => { const by = e.target.value as SortBy; setSortPersist({ by, dir: DEFAULT_DIR[by] }) }}
        className="h-6 rounded border bg-background pl-1.5 pr-4 text-xs text-muted-foreground"
        title="Sort by"
      >
        {sortOptions.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
      </select>
      <button className="rounded p-1 text-muted-foreground hover:text-foreground transition-colors"
        onClick={() => setSortPersist({ by: sortBy, dir: sort.dir === 'asc' ? 'desc' : 'asc' })}
        title={sort.dir === 'asc' ? 'Ascending (click for descending)' : 'Descending (click for ascending)'}>
        {sort.dir === 'asc' ? <ArrowUpNarrowWide className="h-3.5 w-3.5" /> : <ArrowDownWideNarrow className="h-3.5 w-3.5" />}
      </button>
    </div>
  ) : null
  // Explicit confirm/cancel: Enter or ✓ commits, Escape or ✗ cancels.
  const renameForm = (
    <form className="flex flex-1 items-center gap-1 min-w-0"
      onClick={(e) => e.stopPropagation()}
      onSubmit={(e) => { e.preventDefault(); commitRename() }}>
      <input
        autoFocus
        value={renameDraft}
        onChange={(e) => setRenameDraft(e.target.value)}
        onFocus={(e) => e.target.select()}
        onKeyDown={(e) => { if (e.key === 'Escape') setRenaming(false) }}
        className="flex-1 min-w-0 h-7 rounded border bg-background px-2 text-sm outline-none focus:ring-1 focus:ring-primary"
      />
      <button type="submit" className="rounded p-1 text-green-600 hover:bg-green-600/10 transition-colors" title="Confirm rename">
        <Check className="h-4 w-4" />
      </button>
      <button type="button" className="rounded p-1 text-muted-foreground hover:text-foreground transition-colors" title="Cancel"
        onClick={() => setRenaming(false)}>
        <X className="h-4 w-4" />
      </button>
    </form>
  )
  const selectedIdx = selectedItem ? filtered.indexOf(selectedItem) : -1
  const previewSrc = selectedItem && getPreviewSrc ? getPreviewSrc(selectedItem) : ''
  const showBigPreview = mode === 'preview' && getPreviewSrc && selectedItem
  // The form replaces the selected row in list modes; grid/preview modes (and a
  // selected item hidden by the filter) fall back to the subheader.
  const renameInSubheader = renaming && !!selectedItem && (!!isGrid || !!showBigPreview || selectedIdx < 0)

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
            {renameInSubheader ? (
              renameForm
            ) : showBigPreview ? (<>
              <span className="text-xs font-medium truncate">{getName(selectedItem!)}</span>
              <div className="flex items-center gap-1 ml-auto">
                <button className="rounded p-1 text-muted-foreground hover:text-foreground disabled:opacity-30 transition-colors"
                  disabled={selectedIdx <= 0}
                  onClick={() => { if (selectedIdx > 0) onSelect?.(getKey(filtered[selectedIdx - 1])) }}
                  title="Previous"><ChevronLeft className="h-3.5 w-3.5" /></button>
                <span className="text-xs text-muted-foreground">{selectedIdx + 1}/{filtered.length}</span>
                <button className="rounded p-1 text-muted-foreground hover:text-foreground disabled:opacity-30 transition-colors"
                  disabled={selectedIdx >= filtered.length - 1}
                  onClick={() => { if (selectedIdx < filtered.length - 1) onSelect?.(getKey(filtered[selectedIdx + 1])) }}
                  title="Next"><ChevronRight className="h-3.5 w-3.5" /></button>
                {renameButton}
                {actions}
              </div>
            </>) : (<>
              {multiSelect && (
                <label className="flex items-center gap-2 text-sm text-muted-foreground cursor-pointer select-none shrink-0">
                  <Checkbox checked={allFilteredSelected} onCheckedChange={(checked) => selectAllFiltered(!!checked)} />
                  <span className="text-xs">{items.filter(i => selectedKeys!.has(getKey(i))).length}/{items.length}</span>
                </label>
              )}
              {sortControl}
              {tagFilterControl}
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
                {tagsButton}
                {renameButton}
                {actions}
              </div>
            </>)}
          </div>
        )}
        {editingTags && !showBigPreview && selectedItem && onTagsChange && getTags && (
          <div className="flex flex-wrap items-center gap-1 border-b px-2 py-1.5 shrink-0">
            <Tags className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
            {selectedTags.map(tag => (
              <span key={tag} className="flex items-center gap-0.5 rounded-full bg-primary/10 pl-2 pr-0.5 py-0.5 text-xs text-primary">
                {tag}
                <button className="rounded-full p-0.5 hover:bg-primary/20 transition-colors" title="Remove tag"
                  onClick={() => onTagsChange(getKey(selectedItem), selectedTags.filter(t => t !== tag))}>
                  <X className="h-3 w-3" />
                </button>
              </span>
            ))}
            <form className="relative flex flex-1 items-center gap-1 min-w-[8rem]" onSubmit={(e) => { e.preventDefault(); addTag() }}>
              <input
                value={tagDraft}
                onChange={(e) => setTagDraft(e.target.value)}
                onFocus={() => setTagSuggestionsOpen(true)}
                onBlur={() => setTagSuggestionsOpen(false)}
                placeholder="Add tag..."
                className="flex-1 min-w-0 h-6 rounded border bg-background px-2 text-xs outline-none focus:ring-1 focus:ring-primary"
              />
              {/* Explicit confirm, mirroring the rename form (Enter also works). */}
              <button type="submit" disabled={!tagDraft.trim()}
                className="rounded p-1 text-green-600 hover:bg-green-600/10 disabled:opacity-30 transition-colors" title="Add tag">
                <Check className="h-4 w-4" />
              </button>
              {(() => {
                if (!tagSuggestionsOpen) return null
                const query = tagDraft.trim().toLowerCase()
                const suggestions = allTags.filter(t => !selectedTags.includes(t) && (!query || t.toLowerCase().includes(query)))
                if (suggestions.length === 0) return null
                return (
                  <div className="absolute left-0 right-0 top-full z-20 mt-1 max-h-40 overflow-y-auto rounded-md border bg-card py-1 shadow-md">
                    {suggestions.map(t => (
                      <button key={t} type="button"
                        className="block w-full px-2 py-1 text-left text-xs hover:bg-muted transition-colors"
                        // preventDefault keeps the input focused so the click lands before blur
                        onMouseDown={(e) => e.preventDefault()}
                        onClick={() => { onTagsChange(getKey(selectedItem), [...selectedTags, t]); setTagDraft('') }}>
                        {t}
                      </button>
                    ))}
                  </div>
                )
              })()}
            </form>
          </div>
        )}
        {showBigPreview ? (<>
          <div className="overflow-hidden [&>*]:h-full [&>*]:border-0 [&>*]:rounded-none" style={{ height: 'calc(100% - 6.5rem)' }}>
            <ZoomablePreview src={previewSrc} alt={getName(selectedItem!)} maxImgHeight="100%" backImage={selectedItem ? getBackSrc?.(selectedItem) : undefined} backFit="fill" />
          </div>
          <div className="relative h-[6.5rem] shrink-0 border-t bg-card">
            <div
              ref={carouselScrollRef}
              className="h-full flex gap-2 overflow-x-scroll overflow-y-hidden p-2 min-w-0 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
              onScroll={updateCarouselScroll}
              onWheel={(e) => { e.currentTarget.scrollLeft += e.deltaY; e.preventDefault() }}>
              {filtered.map(item => (
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
                // Editing the selected row in place keeps the input right where
                // the user is looking (the subheader variant is used for grid
                // and preview modes, where there is no row to replace).
                if (renaming && !renameInSubheader && !multiSelect && k === selectedKey) {
                  return <div key={k}
                    ref={(el) => { if (el) itemRefs.current.set(k, el); else itemRefs.current.delete(k) }}
                    className="rounded-lg border bg-card ring-2 ring-inset ring-primary px-3 py-1.5"
                  >{renameForm}</div>
                }
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
