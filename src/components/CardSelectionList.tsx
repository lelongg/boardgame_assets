import { useState, useEffect } from 'react'
import { List, LayoutGrid, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import CardThumbnail from './CardThumbnail'
import type { CardData, CardLayout } from '../types'

export type SelectableCard = CardData & { collectionId?: string; collectionName?: string }

type ImportStaged = { name: string; fields: Record<string, string> }

type PanelItem =
  | { kind: 'existing'; id: string; name: string; importIdx?: number; status?: 'replace' | 'missing' }
  | { kind: 'new'; importIdx: number; name: string }

type CardSelectionListProps = {
  cards: SelectableCard[]
  layout?: CardLayout
  gameFonts?: Record<string, { name: string; file: string }>
  collectionId?: string
  selection: Set<string>
  onSelectionChange: (selection: Set<string>) => void
  importStaged?: ImportStaged[]
  importSelection?: Set<number>
  onImportSelectionChange?: (selection: Set<number>) => void
}

export default function CardSelectionList({
  cards, layout, gameFonts, collectionId: _collectionId,
  selection, onSelectionChange,
  importStaged = [], importSelection, onImportSelectionChange,
}: CardSelectionListProps) {
  const [gallery, setGallery] = useState(false)
  const [badgeFilter, setBadgeFilter] = useState<'all' | 'added' | 'updated' | 'deleted'>('all')
  const [nameFilter, setNameFilter] = useState('')
  const [thumbnails, setThumbnails] = useState<Record<string, string>>({})
  const [importThumbnails, setImportThumbnails] = useState<Record<number, string>>({})
  const [collapsedGroups, setCollapsedGroups] = useState<Set<string>>(new Set())
  const [hoverThumb, setHoverThumb] = useState<{ src: string; x: number; y: number } | null>(null)

  const hasImport = importStaged.length > 0
  const existingByName = new Map(cards.map(c => [c.name, c]))
  const stagedNames = hasImport ? new Set(importStaged.map(c => c.name)) : null

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
      const next = new Set(selection)
      next.has(item.id) ? next.delete(item.id) : next.add(item.id)
      onSelectionChange(next)
      if (item.importIdx != null && importSelection && onImportSelectionChange) {
        const n = new Set(importSelection)
        n.has(item.importIdx) ? n.delete(item.importIdx) : n.add(item.importIdx)
        onImportSelectionChange(n)
      }
    } else if (importSelection && onImportSelectionChange) {
      const n = new Set(importSelection)
      n.has(item.importIdx) ? n.delete(item.importIdx) : n.add(item.importIdx)
      onImportSelectionChange(n)
    }
  }
  const isSelected = (item: PanelItem) =>
    item.kind === 'existing' ? selection.has(item.id) : (importSelection?.has(item.importIdx) ?? false)

  const nameQuery = nameFilter.toLowerCase()
  const filteredItems = items.filter(i => {
    if (nameQuery && !i.name.toLowerCase().includes(nameQuery)) return false
    if (badgeFilter === 'all') return true
    if (badgeFilter === 'added') return i.kind === 'new'
    if (badgeFilter === 'updated') return i.kind === 'existing' && i.status === 'replace'
    if (badgeFilter === 'deleted') return i.kind === 'existing' && i.status === 'missing'
    return true
  })

  const allFiltered = filteredItems.length > 0 && filteredItems.every(isSelected)
  const selectAll = (checked: boolean) => {
    const existingIds = filteredItems.filter(i => i.kind === 'existing').map(i => (i as any).id as string)
    const importIdxs = filteredItems.filter(i => i.kind === 'new').map(i => i.importIdx)
    // Also include replace items' import indices
    filteredItems.forEach(i => { if (i.kind === 'existing' && i.importIdx != null) importIdxs.push(i.importIdx!) })

    const nextSel = new Set(selection)
    if (checked) existingIds.forEach(id => nextSel.add(id))
    else existingIds.forEach(id => nextSel.delete(id))
    onSelectionChange(nextSel)

    if (onImportSelectionChange && importSelection) {
      const nextImp = new Set(importSelection)
      if (checked) importIdxs.forEach(i => nextImp.add(i))
      else importIdxs.forEach(i => nextImp.delete(i))
      onImportSelectionChange(nextImp)
    }
  }

  const badge = (item: PanelItem) => {
    if (!hasImport) return null
    if (item.kind === 'new') return <span className="text-xs px-1.5 py-0.5 rounded shrink-0 bg-green-100 text-green-700 w-16 text-center inline-block">added</span>
    if (item.status === 'replace') return <span className="text-xs px-1.5 py-0.5 rounded shrink-0 bg-amber-100 text-amber-700 w-16 text-center inline-block">updated</span>
    if (item.status === 'missing') return <span className="text-xs px-1.5 py-0.5 rounded shrink-0 bg-red-100 text-red-700 w-16 text-center inline-block">deleted</span>
    return null
  }
  const thumb = (item: PanelItem) =>
    item.kind === 'existing' ? thumbnails[item.id] : importThumbnails[item.importIdx]

  const renderItem = (item: PanelItem) => {
    const key = item.kind === 'existing' ? item.id : `import-${item.importIdx}`
    const t = thumb(item)
    if (gallery) return (
      <CardThumbnail key={key} src={t || ''} name={item.name} selected={isSelected(item)} onClick={() => toggleItem(item)} badge={badge(item)} />
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

  const collectionNames = [...new Set(cards.map(c => c.collectionName).filter(Boolean))]
  const hasGroups = collectionNames.length > 1

  const renderGroup = (groupItems: PanelItem[], title?: string) => {
    const groupAllSelected = groupItems.length > 0 && groupItems.every(isSelected)
    const toggleGroup = () => {
      const ids = groupItems.filter(i => i.kind === 'existing').map(i => (i as any).id as string)
      const next = new Set(selection)
      if (groupAllSelected) ids.forEach(id => next.delete(id))
      else ids.forEach(id => next.add(id))
      onSelectionChange(next)
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
    )
  }

  return (
    <>
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
          <div className="flex items-center gap-2 border-b pb-2">
            <label className="flex items-center gap-2 text-sm text-muted-foreground cursor-pointer select-none shrink-0">
              <input type="checkbox" checked={allFiltered} onChange={(e) => selectAll(e.target.checked)} />
              All
            </label>
            <div className="relative flex-1">
              <Input
                value={nameFilter}
                onChange={(e) => setNameFilter(e.target.value)}
                placeholder="Filter..."
                className="h-7 text-xs pr-7"
              />
              {nameFilter && (
                <button type="button" className="absolute right-1 top-1/2 -translate-y-1/2 rounded p-0.5 text-muted-foreground hover:text-foreground transition-colors" onClick={() => setNameFilter('')}>
                  <X className="h-3 w-3" />
                </button>
              )}
            </div>
          </div>
          {hasImport && (
            <div className="flex gap-1 flex-wrap">
              {(['all', 'added', 'updated', 'deleted'] as const).map(f => {
                const count = f === 'all' ? items.length
                  : f === 'added' ? items.filter(i => i.kind === 'new').length
                  : f === 'updated' ? items.filter(i => i.kind === 'existing' && i.status === 'replace').length
                  : items.filter(i => i.kind === 'existing' && i.status === 'missing').length
                const disabled = count === 0 && f !== 'all'
                return (
                  <button
                    key={f}
                    disabled={disabled}
                    onClick={() => setBadgeFilter(f)}
                    className={`rounded-full border px-2 py-0.5 text-xs font-medium transition-colors ${
                      badgeFilter === f
                        ? 'bg-primary text-primary-foreground border-primary'
                        : disabled
                          ? 'bg-background border-input text-muted-foreground/40 cursor-default'
                          : 'bg-background border-input hover:bg-accent/50'
                    }`}
                  >{f} <span className="text-[0.65rem] opacity-60 ml-0.5">{count}</span></button>
                )
              })}
            </div>
          )}
          <div className="overflow-y-auto max-h-[60vh] space-y-2">
            {hasGroups
              ? collectionNames.map(name => {
                  const groupCards = new Set(cards.filter(c => c.collectionName === name).map(c => c.id))
                  const gi = filteredItems.filter(i => i.kind === 'existing' && groupCards.has(i.id))
                  return gi.length > 0 ? renderGroup(gi, name) : null
                })
              : renderGroup(filteredItems)
            }
          </div>
        </CardContent>
      </Card>
    </>
  )
}
