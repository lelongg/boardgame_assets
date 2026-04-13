import { useState, useEffect, useMemo } from 'react'
import { Upload, X, Check } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import FilterableList from './FilterableList'
import { csvToCards } from '../cardsCsv'
import useStorage from '../hooks/useStorage'
import { useInvalidateGame } from '../hooks/useGameData'
import type { CardData, CardLayout } from '../types'

export type SelectableCard = CardData & { collectionId?: string; collectionName?: string }

type MergedItem = {
  id: string
  name: string
  kind: 'existing' | 'new'
  status?: 'replace' | 'missing'
  collectionName?: string
}

type ImportPanelProps = {
  gameId: string
  collectionId?: string
  cards: SelectableCard[]
  layout?: CardLayout
  gameFonts?: Record<string, { name: string; file: string }>
  storage?: any
  onStatusChange?: (msg: string) => void
  onCardsChange?: () => void
  collections?: { id: string; name: string; layoutId: string }[]
}

export default function ImportPanel({
  gameId, collectionId, cards, layout, gameFonts,
  onStatusChange, onCardsChange, collections = [],
}: ImportPanelProps) {
  const { storage } = useStorage()
  const invalidateGame = useInvalidateGame(gameId)
  const storageKey = `import:${gameId}:${collectionId}`

  const [selection, setSelection] = useState<Set<string>>(() => {
    try { const s = localStorage.getItem(`${storageKey}:sel`); return s ? new Set(JSON.parse(s)) : new Set(cards.map(c => c.id)) } catch { return new Set(cards.map(c => c.id)) }
  })
  const [importStaged, setImportStaged] = useState<{ name: string; fields: Record<string, string> }[]>(() => {
    try { const s = localStorage.getItem(`${storageKey}:staged`); return s ? JSON.parse(s) : [] } catch { return [] }
  })
  const [badgeFilter, setBadgeFilter] = useState<'all' | 'added' | 'updated' | 'deleted'>('all')
  const [thumbnails, setThumbnails] = useState<Record<string, string>>({})

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

  useEffect(() => { localStorage.setItem(`${storageKey}:staged`, JSON.stringify(importStaged)) }, [importStaged, storageKey])
  useEffect(() => { localStorage.setItem(`${storageKey}:sel`, JSON.stringify([...selection])) }, [selection, storageKey])

  const setStatus = (msg: string) => onStatusChange?.(msg)

  useEffect(() => {
    setSelection(prev => {
      const valid = new Set(cards.map(c => c.id))
      const next = new Set([...prev].filter(id => valid.has(id)))
      return next.size === prev.size ? prev : next
    })
  }, [cards])

  const hasImport = importStaged.length > 0
  const existingByName = new Map(cards.map(c => [c.name, c]))
  const stagedNames = hasImport ? new Set(importStaged.map(c => c.name)) : null

  const mergedItems: MergedItem[] = useMemo(() => {
    const items: MergedItem[] = cards.map(c => {
      const isReplaced = hasImport && stagedNames?.has(c.name)
      const isMissing = hasImport && !stagedNames?.has(c.name)
      return { id: c.id, name: c.name, kind: 'existing' as const, status: isReplaced ? 'replace' as const : isMissing ? 'missing' as const : undefined, collectionName: c.collectionName }
    })
    if (hasImport) {
      importStaged.forEach((s, i) => {
        if (!existingByName.has(s.name)) items.push({ id: `import-${i}`, name: s.name, kind: 'new', collectionName: (s as any).collectionName })
      })
    }
    return items
  }, [cards, importStaged])

  const filteredItems = !hasImport ? [] : badgeFilter === 'all' ? mergedItems : mergedItems.filter(i => {
    if (badgeFilter === 'added') return i.kind === 'new'
    if (badgeFilter === 'updated') return i.status === 'replace'
    if (badgeFilter === 'deleted') return i.status === 'missing'
    return true
  })

  const selectedCount = mergedItems.filter(i => selection.has(i.id)).length
  const missingCards = hasImport ? cards.filter(c => !stagedNames!.has(c.name)) : []
  const selectedMissing = hasImport ? missingCards.filter(c => selection.has(c.id)) : []

  const loadCsv = () => {
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
        setSelection(new Set([...cards.map(c => c.id), ...parsed.map((_, i) => `import-${i}`)]))
      } catch (e: any) { setStatus(`Parse error: ${e.message || e}`) }
    }
    input.click()
  }

  const handleImport = async () => {
    try {
      setStatus('Importing...')
      const colNameToId = new Map(collections.map(c => [c.name, c.id]))
      const toImport = importStaged.filter((s, i) => {
        const existing = existingByName.get(s.name)
        return existing ? selection.has(existing.id) : selection.has(`import-${i}`)
      })
      for (const card of toImport) {
        const existing = existingByName.get(card.name)
        let colId = collectionId || (existing as any)?.collectionId
        if (!colId && (card as any).collectionName) {
          colId = colNameToId.get((card as any).collectionName)
          if (!colId) {
            const defaultLayout = collections[0]?.layoutId ?? 'default'
            const newCol = await storage.createCollection(gameId, (card as any).collectionName, defaultLayout)
            colId = newCol.id
            colNameToId.set((card as any).collectionName, colId)
          }
        }
        if (!colId) continue
        await storage.saveCard(gameId, colId, existing?.id ?? null, existing ? { ...existing, fields: card.fields } : card)
      }
      for (const card of selectedMissing) {
        const colId = collectionId || (card as any)?.collectionId
        if (!colId) continue
        await storage.deleteCard(gameId, colId, card.id)
      }
      invalidateGame()
      onCardsChange?.()
      setImportStaged([])
      const deleted = selectedMissing.length > 0 ? `, deleted ${selectedMissing.length}` : ''
      setStatus(`Imported ${toImport.length} card${toImport.length !== 1 ? 's' : ''}${deleted}.`)
    } catch (e: any) { setStatus(`Import error: ${e.message || e}`) }
  }

  const badge = (item: MergedItem) => {
    if (!hasImport) return null
    if (item.kind === 'new') return <span className="text-xs px-1.5 py-0.5 rounded shrink-0 bg-green-100 text-green-700 w-16 text-center inline-block">added</span>
    if (item.status === 'replace') return <span className="text-xs px-1.5 py-0.5 rounded shrink-0 bg-amber-100 text-amber-700 w-16 text-center inline-block">updated</span>
    if (item.status === 'missing') return <span className="text-xs px-1.5 py-0.5 rounded shrink-0 bg-red-100 text-red-700 w-16 text-center inline-block">deleted</span>
    return null
  }

  const badgeCounts = hasImport ? {
    all: mergedItems.length,
    added: mergedItems.filter(i => i.kind === 'new').length,
    updated: mergedItems.filter(i => i.status === 'replace').length,
    deleted: mergedItems.filter(i => i.status === 'missing').length,
  } : null

  return (
    <FilterableList<MergedItem>
      title="Import CSV"
      items={filteredItems}
      getKey={(i) => i.id}
      getName={(i) => i.name}
      getPreviewSrc={(i) => thumbnails[i.id] || ''}
      getGroup={(i) => i.collectionName}
      selectedKeys={selection}
      onSelectedKeysChange={setSelection}
      renderItem={(item, _vm, selected, idx) => (
        <div className={`flex items-center gap-2 text-sm cursor-pointer select-none rounded px-2 py-0.5 ${selected ? (idx % 2 === 0 ? 'bg-primary/10' : 'bg-primary/5') : idx % 2 === 0 ? 'bg-muted/30' : ''} hover:bg-accent/40`}>
          <Checkbox checked={selected} className="pointer-events-none shrink-0" tabIndex={-1} />
          <span className="truncate flex-1">{item.name}</span>
          {badge(item)}
        </div>
      )}
      toolbar={hasImport ? <>
        <Button size="sm" variant="ghost" disabled={selectedCount === 0 && selectedMissing.length === 0} onClick={handleImport} title={`Import ${selectedCount} card${selectedCount !== 1 ? 's' : ''}`}>
          <Check className="h-4 w-4" />
          <span className="text-xs ml-1">{selectedCount}</span>
        </Button>
        <Button size="sm" variant="ghost" onClick={() => { setImportStaged([]); setBadgeFilter('all') }} title="Clear CSV">
          <X className="h-4 w-4" />
        </Button>
      </> : <Button size="sm" variant="ghost" onClick={loadCsv} title="Load CSV">
        <Upload className="h-4 w-4" />
      </Button>}
      subheader={badgeCounts ? <>
        {(['all', 'added', 'updated', 'deleted'] as const).map(f => {
          const count = badgeCounts[f]
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
      </> : undefined}
      empty={<p className="text-sm text-muted-foreground">{hasImport ? 'No matching cards.' : 'Load a CSV to preview changes.'}</p>}
    />
  )
}
