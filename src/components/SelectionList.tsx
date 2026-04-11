import { useState, type ReactNode } from 'react'
import { List, LayoutGrid, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import CardThumbnail from './CardThumbnail'

export type SelectionItem = {
  key: string
  name: string
  group?: string
  thumbnail?: string
  badge?: ReactNode
  filterKey?: string
}

type SelectionListProps = {
  title: string
  items: SelectionItem[]
  selection: Set<string>
  onSelectionChange: (selection: Set<string>) => void
  aspectRatio?: number
  filters?: { key: string; label: string; count: number }[]
}

export default function SelectionList({ title, items, selection, onSelectionChange, aspectRatio, filters }: SelectionListProps) {
  const [gallery, setGallery] = useState(false)
  const [nameFilter, setNameFilter] = useState('')
  const [badgeFilter, setBadgeFilter] = useState('all')
  const [collapsedGroups, setCollapsedGroups] = useState<Set<string>>(new Set())
  const [hoverThumb, setHoverThumb] = useState<{ src: string; x: number; y: number } | null>(null)

  const nameQuery = nameFilter.toLowerCase()
  const filteredItems = items.filter(i => {
    if (nameQuery && !i.name.toLowerCase().includes(nameQuery)) return false
    if (badgeFilter !== 'all') {
      if (i.filterKey !== badgeFilter) return false
    }
    return true
  })

  const allFiltered = filteredItems.length > 0 && filteredItems.every(i => selection.has(i.key))
  const selectAll = (checked: boolean) => {
    const next = new Set(selection)
    for (const item of filteredItems) {
      if (checked) next.add(item.key)
      else next.delete(item.key)
    }
    onSelectionChange(next)
  }

  const toggleItem = (key: string) => {
    const next = new Set(selection)
    next.has(key) ? next.delete(key) : next.add(key)
    onSelectionChange(next)
  }

  const groupNames = [...new Set(items.map(i => i.group).filter(Boolean))] as string[]
  const hasGroups = groupNames.length > 1

  const renderItem = (item: SelectionItem) => {
    if (gallery) return (
      <CardThumbnail
        key={item.key}
        src={item.thumbnail || ''}
        name={item.name}
        selected={selection.has(item.key)}
        onClick={() => toggleItem(item.key)}
        badge={item.badge}
      />
    )
    return (
      <label
        key={item.key}
        className="flex items-center gap-2 text-sm cursor-pointer select-none hover:bg-accent/30 rounded px-1 py-0.5"
        onMouseEnter={(e) => { if (item.thumbnail) setHoverThumb({ src: item.thumbnail, x: e.clientX, y: e.clientY }) }}
        onMouseMove={(e) => { if (item.thumbnail) setHoverThumb({ src: item.thumbnail, x: e.clientX, y: e.clientY }) }}
        onMouseLeave={() => setHoverThumb(null)}
      >
        <input type="checkbox" checked={selection.has(item.key)} onChange={() => toggleItem(item.key)} />
        <span className="truncate flex-1">{item.name}</span>
        {item.badge}
      </label>
    )
  }

  const renderGroup = (groupItems: SelectionItem[], groupTitle?: string) => {
    const groupAllSelected = groupItems.length > 0 && groupItems.every(i => selection.has(i.key))
    const toggleGroup = () => {
      const next = new Set(selection)
      if (groupAllSelected) groupItems.forEach(i => next.delete(i.key))
      else groupItems.forEach(i => next.add(i.key))
      onSelectionChange(next)
    }
    const collapsed = groupTitle ? collapsedGroups.has(groupTitle) : false
    const toggleCollapse = () => {
      if (!groupTitle) return
      setCollapsedGroups(prev => { const n = new Set(prev); n.has(groupTitle) ? n.delete(groupTitle) : n.add(groupTitle); return n })
    }
    return (
      <div key={groupTitle ?? 'all'}>
        {groupTitle && (
          <div className="flex items-center gap-2 text-xs font-semibold uppercase text-muted-foreground pt-2 pb-1 border-b mb-1 select-none">
            <input type="checkbox" checked={groupAllSelected} onChange={toggleGroup} className="cursor-pointer" />
            <span className="cursor-pointer flex-1" onClick={toggleCollapse}>
              {groupTitle} <span className="text-[0.65rem] font-normal text-muted-foreground ml-1">{groupItems.filter(i => selection.has(i.key)).length}/{groupItems.length}</span>
            </span>
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
        <div
          className="pointer-events-none fixed z-50 rounded-md shadow-lg overflow-hidden"
          style={{ left: hoverThumb.x + 16, top: hoverThumb.y - 80, width: 120, backgroundImage: 'repeating-conic-gradient(#e5e5e5 0% 25%, transparent 0% 50%)', backgroundSize: '8px 8px' }}
        >
          <div style={{ padding: '5%', aspectRatio: aspectRatio ? `1 / ${aspectRatio}` : '5 / 7' }}>
            <img src={hoverThumb.src} alt="" className="w-full h-full object-contain drop-shadow" />
          </div>
        </div>
      )}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0">
          <CardTitle className="text-base">
            {title} <span className="text-sm font-normal text-muted-foreground ml-1">{filteredItems.filter(i => selection.has(i.key)).length}/{filteredItems.length}</span>
          </CardTitle>
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
          {filters && filters.length > 0 && (
            <div className="flex gap-1 flex-wrap">
              {[{ key: 'all', label: 'all', count: items.length }, ...filters].map(f => {
                const disabled = f.count === 0 && f.key !== 'all'
                return (
                  <button
                    key={f.key}
                    disabled={disabled}
                    onClick={() => setBadgeFilter(f.key)}
                    className={`rounded-full border px-2 py-0.5 text-xs font-medium transition-colors ${
                      badgeFilter === f.key
                        ? 'bg-primary text-primary-foreground border-primary'
                        : disabled
                          ? 'bg-background border-input text-muted-foreground/40 cursor-default'
                          : 'bg-background border-input hover:bg-accent/50'
                    }`}
                  >{f.label} <span className="text-[0.65rem] opacity-60 ml-0.5">{f.count}</span></button>
                )
              })}
            </div>
          )}
          <div className="overflow-y-auto max-h-[60vh] space-y-2">
            {hasGroups
              ? groupNames.map(name => {
                  const gi = filteredItems.filter(i => i.group === name)
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
