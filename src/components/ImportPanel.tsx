import { useState, useEffect } from 'react'
import { Upload } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import CardSelectionList from './CardSelectionList'
import type { SelectableCard } from './CardSelectionList'
import { csvToCards } from '../cardsCsv'
import type { CardLayout } from '../types'

type ImportPanelProps = {
  gameId: string
  collectionId?: string
  cards: SelectableCard[]
  layout?: CardLayout
  gameFonts?: Record<string, { name: string; file: string }>
  storage: any
  onStatusChange?: (msg: string) => void
  onCardsChange?: () => void
  collections?: { id: string; name: string; layoutId: string }[]
}

export default function ImportPanel({
  gameId, collectionId, cards, layout, gameFonts, storage,
  onStatusChange, onCardsChange, collections = [],
}: ImportPanelProps) {
  const storageKey = `import:${gameId}:${collectionId}`

  const [cardSelection, setCardSelection] = useState<Set<string>>(() => {
    try { const s = localStorage.getItem(`${storageKey}:cardSel`); return s ? new Set(JSON.parse(s)) : new Set(cards.map(c => c.id)) } catch { return new Set(cards.map(c => c.id)) }
  })
  const [importStaged, setImportStaged] = useState<{ name: string; fields: Record<string, string> }[]>(() => {
    try { const s = localStorage.getItem(`${storageKey}:staged`); return s ? JSON.parse(s) : [] } catch { return [] }
  })
  const [importSelection, setImportSelection] = useState<Set<number>>(() => {
    try { const s = localStorage.getItem(`${storageKey}:importSel`); return s ? new Set(JSON.parse(s)) : new Set() } catch { return new Set() }
  })
  // Persist state
  useEffect(() => { localStorage.setItem(`${storageKey}:staged`, JSON.stringify(importStaged)) }, [importStaged, storageKey])
  useEffect(() => { localStorage.setItem(`${storageKey}:importSel`, JSON.stringify([...importSelection])) }, [importSelection, storageKey])
  useEffect(() => { localStorage.setItem(`${storageKey}:cardSel`, JSON.stringify([...cardSelection])) }, [cardSelection, storageKey])

  const setStatus = (msg: string) => onStatusChange?.(msg)

  useEffect(() => {
    setCardSelection(prev => {
      const valid = new Set(cards.map(c => c.id))
      const next = new Set([...prev].filter(id => valid.has(id)))
      return next.size === prev.size ? prev : next
    })
  }, [cards])

  const hasImport = importStaged.length > 0
  const existingByName = new Map(cards.map(c => [c.name, c]))
  const stagedNames = hasImport ? new Set(importStaged.map(c => c.name)) : null
  const missingCards = hasImport ? cards.filter(c => !stagedNames!.has(c.name)) : []
  const selectedImport = hasImport ? importStaged.filter((_, i) => importSelection.has(i)).length : 0

  return (
    <div className="grid grid-cols-1 md:grid-cols-[1fr_auto] gap-4">
      <CardSelectionList
        cards={cards}
        layout={layout}
        gameFonts={gameFonts}
        collectionId={collectionId}
        selection={cardSelection}
        onSelectionChange={setCardSelection}
        importStaged={importStaged}
        importSelection={importSelection}
        onImportSelectionChange={setImportSelection}
      />

      <div className="space-y-4 md:w-64">
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
                setCardSelection(new Set(cards.map(c => c.id)))
              } catch (e: any) { setStatus(`Parse error: ${e.message || e}`) }
            }
            input.click()
          }}>
            Load CSV
          </Button>
          {hasImport && (() => {
            const selectedMissing = missingCards.filter(c => cardSelection.has(c.id))
            return <>
              {selectedMissing.length > 0 && (
                <p className="text-xs text-red-600">{selectedMissing.length} card{selectedMissing.length !== 1 ? 's' : ''} selected for deletion</p>
              )}
              <Button className="w-full" variant="outline" disabled={selectedImport === 0 && selectedMissing.length === 0} onClick={async () => {
                try {
                  setStatus('Importing...')
                  // Build collection name → id map, create missing collections
                  const colNameToId = new Map(collections.map(c => [c.name, c.id]))
                  const toImport = importStaged.filter((_, i) => importSelection.has(i))
                  for (const card of toImport) {
                    const existing = existingByName.get(card.name)
                    let colId = collectionId || (existing as any)?.collectionId
                    // Resolve from CSV collectionName
                    if (!colId && (card as any).collectionName) {
                      colId = colNameToId.get((card as any).collectionName)
                      if (!colId) {
                        // Create the collection
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
                  onCardsChange?.()
                  setImportStaged([])
                  setImportSelection(new Set())
                  const deleted = selectedMissing.length > 0 ? `, deleted ${selectedMissing.length}` : ''
                  setStatus(`Imported ${toImport.length} card${toImport.length !== 1 ? 's' : ''}${deleted}.`)
                } catch (e: any) { setStatus(`Import error: ${e.message || e}`) }
              }}>
                <Upload className="h-4 w-4 mr-2" />
                Import {selectedImport} card{selectedImport !== 1 ? 's' : ''}
              </Button>
              <Button className="w-full" variant="outline" onClick={() => { setImportStaged([]); setImportSelection(new Set()) }}>
                Clear CSV
              </Button>
            </>
          })()}
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
