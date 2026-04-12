import { useState, useMemo } from 'react'
import { Upload, Check, X } from 'lucide-react'
import JSZip from 'jszip'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import FilterableList from './FilterableList'

type DiffItem = { name: string; status: 'added' | 'updated' | 'unchanged'; key: string }

type ZipDiff = {
  layouts: DiffItem[]
  collections: DiffItem[]
  cards: (DiffItem & { collectionName: string })[]
  fonts: DiffItem[]
  images: DiffItem[]
}

type ZipData = {
  layouts: Record<string, any>
  collections: Record<string, any>
  cards: Record<string, { collectionId: string; card: any }[]>
  fonts: Record<string, any>
  fontFiles: Record<string, Blob>
  images: Record<string, Blob>
}

type ZipMergePanelProps = {
  gameId: string
  storage: any
  layouts: any[]
  collections: any[]
  gameFonts: Record<string, { name: string; file: string }>
  gameImages: { file: string; url: string; name: string }[]
  onStatusChange: (msg: string) => void
  onComplete: () => void
}

async function parseZip(blob: Blob): Promise<ZipData> {
  const zip = await JSZip.loadAsync(blob)
  const readJson = async (path: string) => {
    const f = zip.file(path)
    return f ? JSON.parse(await f.async('text')) : null
  }

  const layouts: Record<string, any> = {}
  for (const f of zip.file(/^layouts\/.*\.json$/)) {
    const data = JSON.parse(await f.async('text'))
    layouts[data.id ?? f.name] = data
  }

  const collections: Record<string, any> = {}
  const cards: Record<string, { collectionId: string; card: any }[]> = {}
  for (const f of zip.file(/^collections\/[^/]+\/collection\.json$/)) {
    const col = JSON.parse(await f.async('text'))
    collections[col.id] = col
    cards[col.id] = []
    const colDir = f.name.replace('/collection.json', '')
    for (const cf of zip.file(new RegExp(`^${colDir}/cards/.*\\.json$`))) {
      const card = JSON.parse(await cf.async('text'))
      cards[col.id].push({ collectionId: col.id, card })
    }
  }

  const fontsManifest = await readJson('fonts/fonts.json') ?? {}
  const fontFiles: Record<string, Blob> = {}
  for (const [, entry] of Object.entries(fontsManifest) as [string, any][]) {
    if (!entry.file) continue
    const f = zip.file(`fonts/${entry.file}`)
    if (f) fontFiles[entry.file] = await f.async('blob')
  }

  const images: Record<string, Blob> = {}
  for (const f of zip.file(/^images\//)) {
    const name = f.name.replace('images/', '')
    if (name) images[name] = await f.async('blob')
  }

  return { layouts, collections, cards, fonts: fontsManifest, fontFiles, images }
}

function computeDiff(zipData: ZipData, layouts: any[], collections: any[], gameFonts: Record<string, any>, gameImages: { file: string }[]): ZipDiff {
  const existingLayouts = new Set(layouts.map(l => l.id))
  const existingCollections = new Map(collections.map(c => [c.id, c]))
  const existingFonts = new Set(Object.keys(gameFonts))
  const existingImages = new Set(gameImages.map(i => i.file))

  return {
    layouts: Object.entries(zipData.layouts).map(([id, data]) => ({
      key: id, name: data.name ?? id,
      status: existingLayouts.has(id) ? 'updated' : 'added',
    })),
    collections: Object.entries(zipData.collections).map(([id, col]) => ({
      key: id, name: col.name ?? id,
      status: existingCollections.has(id) ? 'updated' : 'added',
    })),
    cards: Object.entries(zipData.cards).flatMap(([colId, cardList]) => {
      const colName = zipData.collections[colId]?.name ?? colId
      return cardList.map(({ card }) => ({
        key: `${colId}:${card.id}`, name: card.name ?? card.id, collectionName: colName,
        status: 'updated' as const,
      }))
    }),
    fonts: Object.entries(zipData.fonts).map(([slot, entry]: [string, any]) => ({
      key: slot, name: `${slot} (${entry.name})`,
      status: existingFonts.has(slot) ? 'updated' : 'added',
    })),
    images: Object.keys(zipData.images).map(file => ({
      key: file, name: file,
      status: existingImages.has(file) ? 'unchanged' : 'added',
    })),
  }
}

const statusBadge = (status: string) => {
  if (status === 'added') return <span className="text-xs px-1.5 py-0.5 rounded shrink-0 bg-green-100 text-green-700 w-16 text-center inline-block">added</span>
  if (status === 'updated') return <span className="text-xs px-1.5 py-0.5 rounded shrink-0 bg-amber-100 text-amber-700 w-16 text-center inline-block">updated</span>
  return <span className="text-xs px-1.5 py-0.5 rounded shrink-0 bg-muted text-muted-foreground w-16 text-center inline-block">unchanged</span>
}

type MergedItem = { id: string; name: string; status: string; group: string }

export default function ZipMergePanel({ gameId, storage, layouts, collections, gameFonts, gameImages, onStatusChange, onComplete }: ZipMergePanelProps) {
  const [zipData, setZipData] = useState<ZipData | null>(null)
  const [diff, setDiff] = useState<ZipDiff | null>(null)
  const [selection, setSelection] = useState<Set<string>>(new Set())
  const [importing, setImporting] = useState(false)
  const [badgeFilter, setBadgeFilter] = useState('all')

  const loadZip = async (file: File) => {
    onStatusChange('Parsing zip...')
    const data = await parseZip(file)
    const d = computeDiff(data, layouts, collections, gameFonts, gameImages)
    setZipData(data)
    setDiff(d)
    const allKeys = new Set([
      ...d.layouts.filter(i => i.status !== 'unchanged').map(i => `layout:${i.key}`),
      ...d.collections.filter(i => i.status !== 'unchanged').map(i => `collection:${i.key}`),
      ...d.cards.filter(i => i.status !== 'unchanged').map(i => `card:${i.key}`),
      ...d.fonts.filter(i => i.status !== 'unchanged').map(i => `font:${i.key}`),
      ...d.images.filter(i => i.status !== 'unchanged').map(i => `image:${i.key}`),
    ])
    setSelection(allKeys)
    onStatusChange('Zip loaded.')
  }

  const handleMerge = async () => {
    if (!zipData || !diff) return
    setImporting(true)
    try {
      let count = 0
      for (const item of diff.layouts) {
        if (!selection.has(`layout:${item.key}`)) continue
        onStatusChange(`Importing layout: ${item.name}`)
        await storage.saveLayout(gameId, item.key, zipData.layouts[item.key])
        count++
      }
      for (const item of diff.fonts) {
        if (!selection.has(`font:${item.key}`)) continue
        const entry = zipData.fonts[item.key]
        if (!entry?.file || !zipData.fontFiles[entry.file]) continue
        onStatusChange(`Importing font: ${item.name}`)
        const blob = zipData.fontFiles[entry.file]
        const ext = entry.file.match(/\.[^.]+$/)?.[0] ?? ''
        const f = new File([blob], `${entry.name}${ext}`, { type: 'application/octet-stream' })
        await storage.uploadFont(gameId, f, item.key)
        count++
      }
      for (const item of diff.images) {
        if (!selection.has(`image:${item.key}`)) continue
        onStatusChange(`Importing image: ${item.name}`)
        const blob = zipData.images[item.key]
        const ext = item.key.match(/\.[^.]+$/)?.[0] ?? '.png'
        const mimeTypes: Record<string, string> = { '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.webp': 'image/webp', '.gif': 'image/gif' }
        const f = new File([blob], item.key, { type: mimeTypes[ext] ?? 'application/octet-stream' })
        await storage.uploadImage(gameId, f)
        count++
      }
      for (const colItem of diff.collections) {
        if (!selection.has(`collection:${colItem.key}`)) continue
        const col = zipData.collections[colItem.key]
        const existing = collections.find(c => c.id === colItem.key)
        if (!existing) {
          onStatusChange(`Creating collection: ${col.name}`)
          await storage.createCollection(gameId, col.name, col.layoutId)
        }
        count++
      }
      for (const cardItem of diff.cards) {
        if (!selection.has(`card:${cardItem.key}`)) continue
        const [colId, cardId] = cardItem.key.split(':')
        const cardData = zipData.cards[colId]?.find(c => c.card.id === cardId)?.card
        if (!cardData) continue
        onStatusChange(`Importing card: ${cardItem.name}`)
        const colExists = collections.find(c => c.id === colId) || diff.collections.find(c => c.key === colId && selection.has(`collection:${c.key}`))
        if (!colExists) {
          const col = zipData.collections[colId]
          if (col) await storage.createCollection(gameId, col.name, col.layoutId)
        }
        await storage.saveCard(gameId, colId, cardData.id, cardData)
        count++
      }
      onStatusChange(`Merged ${count} items.`)
      setZipData(null)
      setDiff(null)
      onComplete()
    } catch (e: any) {
      onStatusChange(`Merge error: ${e.message || e}`)
    } finally {
      setImporting(false)
    }
  }

  const allItems: MergedItem[] = useMemo(() => {
    if (!diff) return []
    return [
      ...diff.layouts.map(i => ({ id: `layout:${i.key}`, name: i.name, status: i.status, group: 'Layouts' })),
      ...diff.collections.map(i => ({ id: `collection:${i.key}`, name: i.name, status: i.status, group: 'Collections' })),
      ...diff.cards.map(i => ({ id: `card:${i.key}`, name: i.name, status: i.status, group: `Cards — ${i.collectionName}` })),
      ...diff.fonts.map(i => ({ id: `font:${i.key}`, name: i.name, status: i.status, group: 'Fonts' })),
      ...diff.images.map(i => ({ id: `image:${i.key}`, name: i.name, status: i.status, group: 'Images' })),
    ]
  }, [diff])

  const filteredItems = badgeFilter === 'all' ? allItems : allItems.filter(i => i.status === badgeFilter)
  const hasZip = !!diff

  const badgeCounts = hasZip ? {
    all: allItems.length,
    added: allItems.filter(i => i.status === 'added').length,
    updated: allItems.filter(i => i.status === 'updated').length,
    unchanged: allItems.filter(i => i.status === 'unchanged').length,
  } : null

  const clear = () => { setZipData(null); setDiff(null); setSelection(new Set()); setBadgeFilter('all') }

  return (
    <FilterableList<MergedItem>
      title="Merge from zip"
      items={hasZip ? filteredItems : []}
      getKey={(i) => i.id}
      getName={(i) => i.name}
      selectedKeys={selection}
      onSelectedKeysChange={setSelection}
      renderItem={(item, _vm, selected, idx) => (
        <div className={`flex items-center gap-2 text-sm cursor-pointer select-none rounded px-2 py-0.5 ${selected ? (idx % 2 === 0 ? 'bg-primary/10' : 'bg-primary/5') : idx % 2 === 0 ? 'bg-muted/30' : ''} hover:bg-accent/40`}>
          <Checkbox checked={selected} className="pointer-events-none shrink-0" tabIndex={-1} />
          <span className="truncate flex-1">{item.name}</span>
          {statusBadge(item.status)}
        </div>
      )}
      toolbar={hasZip ? <>
        <Button size="sm" variant="ghost" disabled={selection.size === 0 || importing} onClick={handleMerge} title={`Merge ${selection.size} items`}>
          <Check className="h-4 w-4" />
          <span className="text-xs ml-1">{selection.size}</span>
        </Button>
        <Button size="sm" variant="ghost" onClick={clear} title="Clear zip">
          <X className="h-4 w-4" />
        </Button>
      </> : <Button size="sm" variant="ghost" onClick={() => {
        const input = document.createElement('input')
        input.type = 'file'; input.accept = '.zip'
        input.onchange = async () => { const f = input.files?.[0]; if (f) loadZip(f) }
        input.click()
      }} title="Load zip">
        <Upload className="h-4 w-4" />
      </Button>}
      subheader={badgeCounts ? <>
        {(['all', 'added', 'updated', 'unchanged'] as const).map(f => {
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
      empty={<p className="text-sm text-muted-foreground">{hasZip ? 'No matching items.' : 'Load a zip to preview changes.'}</p>}
    />
  )
}
