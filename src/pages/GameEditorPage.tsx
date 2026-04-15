import { useState, useEffect, useMemo, useRef } from 'react'
import { ArrowLeft, Copy, Plus, Check, ArrowUpDown, ArrowUp, ArrowDown, ChevronLeft, ChevronRight, GripVertical, RotateCcw, X, Loader2 } from 'lucide-react'
import { useParams, useNavigate, useSearchParams } from 'react-router-dom'
import { useQueryClient } from '@tanstack/react-query'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { ValueItemEditor, getEditorType } from '@/components/layout/ControlPanel'
import PortalDropdown from '@/components/ui/PortalDropdown'
import { Palette, Smile, Image, ToggleLeft } from 'lucide-react'
import {
  useReactTable,
  getCoreRowModel,
  getSortedRowModel,
  getFilteredRowModel,
  getPaginationRowModel,
  flexRender,
  type SortingState,
  type ColumnFiltersState,
  type ColumnOrderState,
  type ColumnSizingState,
} from '@tanstack/react-table'
import LayoutEditorPanel from '@/components/layout/LayoutEditorPanel'
import { FloatingInput, FloatingSelect } from '@/components/ui/floating-field'
import ZoomablePreview from '@/components/ZoomablePreview'
import ConfirmButton from '@/components/ConfirmButton'
import LoadingImg from '@/components/LoadingImg'
import FilterableList from '@/components/FilterableList'
import ListItem from '@/components/ListItem'
import CardThumbnail from '@/components/CardThumbnail'
import PageLayout from '@/components/PageLayout'
import useStorage from '../hooks/useStorage'
import {
  useGame, useCollection, useLayout, useFonts, useImages, useLayouts, useCards,
  useUpdateGame, useUpdateCollection, useSaveLayout,
  useCopyCard, useDeleteCard, useUploadImage,
  useInvalidateGame, queryKeys,
} from '../hooks/useGameData'
import FilesPanel from '@/components/FilesPanel'
import useFontStyles from '../hooks/useFontStyles'
import ImportPanel from '@/components/ImportPanel'
import ZipMergePanel from '@/components/ZipMergePanel'
import CollapsibleHeader, { useCollapsible } from '@/components/ui/CollapsibleHeader'
import RichTextField from '@/components/RichTextField'

const EDITOR_ICONS: Record<string, typeof Palette> = {
  color: Palette,
  emoji: Smile,
  'image-upload': Image,
  boolean: ToggleLeft,
}

/** Strip HTML tags for plain-text preview, preserving text content. */
const stripHtml = (html: string) => html.replace(/<[^>]+>/g, '').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&nbsp;/g, ' ')

function RichTextCell({ value, onSave }: { value: string; onSave: (v: string) => void }) {
  const [editing, setEditing] = useState(false)
  const editorRef = useRef<any>(null)

  if (editing) {
    return (
      <div className="rounded ring-1 ring-primary bg-background" onClick={e => e.stopPropagation()}>
        <RichTextField
          value={value}
          onChange={v => { editorRef.current = v }}
        />
        <div className="flex justify-end gap-1 px-1 pb-1">
          <button className="text-xs text-muted-foreground hover:text-foreground px-1" onClick={() => { setEditing(false); editorRef.current = null }}>Cancel</button>
          <button className="text-xs text-primary hover:text-primary/80 font-medium px-1" onClick={() => { if (editorRef.current != null && editorRef.current !== value) onSave(editorRef.current); setEditing(false); editorRef.current = null }}>Save</button>
        </div>
      </div>
    )
  }

  const plain = stripHtml(value)
  return (
    <div
      className="flex items-center rounded ring-1 ring-transparent cursor-text"
      onClick={() => setEditing(true)}
    >
      <div className="flex-1 px-1 py-0.5 min-h-[1.5rem] truncate [&_strong]:font-bold [&_em]:italic [&_p]:inline" dangerouslySetInnerHTML={{ __html: value || '' }} />
      {!plain && <span className="flex-1 px-1 py-0.5 text-muted-foreground/50 italic">-</span>}
    </div>
  )
}

function EditableCell({ value, onSave, bold, editorType, editorProps, allowedValues }: {
  value: string; onSave: (v: string) => void; bold?: boolean
  editorType?: string; editorProps?: Record<string, any>
  allowedValues?: string[]
}) {
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(value)
  useEffect(() => { if (!editing) setDraft(value) }, [value, editing])

  // Rich text gets its own cell component
  if (editorType === 'richtext') {
    return <RichTextCell value={value} onSave={onSave} />
  }

  const AdornIcon = editorType ? EDITOR_ICONS[editorType] : null

  const adornment = AdornIcon ? (
    <PortalDropdown
      align="right"
      trigger={({ ref, onClick }) => (
        <button ref={ref} onClick={(e) => { e.stopPropagation(); onClick() }} className="shrink-0 p-0.5 rounded text-muted-foreground hover:text-foreground hover:bg-muted transition-colors">
          <AdornIcon className="h-3.5 w-3.5" />
        </button>
      )}
    >
      {(close) => (
        <div className="p-2 min-w-[200px]" onClick={e => e.stopPropagation()}>
          <ValueItemEditor
            property={editorProps?.property ?? ''}
            itemType={editorProps?.itemType}
            value={value}
            onChange={v => { onSave(String(v)); close() }}
            layout={editorProps?.layout}
            gameImages={editorProps?.gameImages}
          />
        </div>
      )}
    </PortalDropdown>
  ) : null

  if (allowedValues?.length) {
    return (
      <select
        className="w-full bg-transparent text-sm px-1 py-0.5 rounded outline-none cursor-pointer focus:ring-1 focus:ring-primary"
        value={value}
        onChange={e => onSave(e.target.value)}
      >
        {!allowedValues.includes(value) && <option value={value}>{value || '-'}</option>}
        {allowedValues.map(v => <option key={v} value={v}>{v || '(empty)'}</option>)}
      </select>
    )
  }

  return (
    <div
      className={`flex items-center rounded ring-1 ${editing ? 'ring-primary bg-background' : 'ring-transparent cursor-text'}`}
      onClick={() => { if (!editing) setEditing(true) }}
      onMouseDown={e => { if (editing && !(e.target as HTMLElement).closest('input')) e.preventDefault() }}
    >
      {editing ? (
        <input
          autoFocus
          className={`flex-1 min-w-0 bg-transparent outline-none text-sm px-1 py-0.5 ${bold ? 'font-medium' : ''}`}
          value={draft}
          onChange={e => setDraft(e.target.value)}
          onBlur={() => { setEditing(false); if (draft !== value) onSave(draft) }}
          onKeyDown={e => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); if (e.key === 'Escape') { setDraft(value); setEditing(false) } }}
        />
      ) : (
        <div className={`flex-1 px-1 py-0.5 min-h-[1.5rem] truncate ${bold ? 'font-medium' : ''}`}>
          {editorType === 'color' && draft ? (
            <span className="flex items-center gap-1"><span className="inline-block w-3 h-3 rounded-sm border shrink-0" style={{ backgroundColor: draft }} />{draft}</span>
          ) : draft || <span className="text-muted-foreground/50 italic">-</span>}
        </div>
      )}
      {adornment
        ? <div className={editing ? '' : 'invisible'}>{adornment}</div>
        : null}
    </div>
  )
}

function DataSheet({ cards, gameId, collectionId, layout, gameImages, onCardsChange, onStatusChange, isLoading }: {
  cards: any[]
  gameId: string
  collectionId: string
  layout?: any
  gameImages?: { file: string; url: string; name: string }[]
  onCardsChange: (cards: any[]) => void
  onStatusChange: (msg: string) => void
  isLoading?: boolean
}) {
  const { storage } = useStorage()
  const stateKey = `dataSheet:${gameId}:${collectionId}`
  const loadState = <T,>(key: string, fallback: T): T => {
    try { const v = localStorage.getItem(`${stateKey}:${key}`); return v ? JSON.parse(v) : fallback } catch { return fallback }
  }
  const saveState = (key: string, value: any) => {
    try { localStorage.setItem(`${stateKey}:${key}`, JSON.stringify(value)) } catch {}
  }

  const [sorting, setSorting] = useState<SortingState>(() => loadState('sorting', []))
  const [columnFilters, setColumnFilters] = useState<ColumnFiltersState>([])
  const [globalFilter, setGlobalFilter] = useState('')
  const [columnOrder, setColumnOrder] = useState<ColumnOrderState>(() => loadState('order', []))
  const [columnSizing, setColumnSizing] = useState<ColumnSizingState>(() => loadState('sizing', {}))

  useEffect(() => { saveState('sorting', sorting) }, [sorting])
  useEffect(() => { saveState('order', columnOrder) }, [columnOrder])
  useEffect(() => { saveState('sizing', columnSizing) }, [columnSizing])

  const fieldNames = useMemo(() => [...new Set(cards.flatMap(c => Object.keys(c.fields ?? {})))], [cards])

  const saveCard = async (cardId: string, updated: any) => {
    onCardsChange(cards.map(c => c.id === cardId ? updated : c))
    try { await storage.saveCard(gameId, collectionId, cardId, updated) }
    catch { onStatusChange('Error saving card.') }
  }

  const naturalSort = (a: any, b: any, columnId: string) => {
    const va = String(a.getValue(columnId) ?? '')
    const vb = String(b.getValue(columnId) ?? '')
    return va.localeCompare(vb, undefined, { numeric: true, sensitivity: 'base' })
  }

  const columns = useMemo(() => [
    {
      accessorKey: 'name',
      header: 'Name',
      sortingFn: naturalSort,
      cell: ({ row }: any) => (
        <EditableCell
          bold
          value={row.original.name ?? ''}
          onSave={v => { const c = row.original; saveCard(c.id, { ...c, name: v }) }}
        />
      ),
    },
    ...fieldNames.map(f => {
      const property = f.includes(':') ? f.split(':')[0] : f
      const edType = getEditorType(property)
      // Detect richtext: check if any card has HTML in this field
      const effectiveType = edType === 'text' && cards.some(c => /<(?:p|strong|em)[ >]/.test(c.fields?.[f] ?? ''))
        ? 'richtext' : edType
      const hasSpecialEditor = effectiveType !== 'text' && effectiveType !== 'number' && effectiveType !== 'select'
      const allowed = layout?.bindingMeta?.[f]?.values as string[] | undefined
      return {
        id: f,
        accessorFn: (row: any) => row.fields?.[f] ?? '',
        header: f.includes(':') ? f.split(':').pop()! : f,
        sortingFn: naturalSort,
        cell: ({ row }: any) => (
          <EditableCell
            value={row.original.fields?.[f] ?? ''}
            onSave={v => { const c = row.original; saveCard(c.id, { ...c, fields: { ...c.fields, [f]: v } }) }}
            allowedValues={allowed}
            editorType={!allowed?.length && hasSpecialEditor ? effectiveType : undefined}
            editorProps={!allowed?.length && hasSpecialEditor ? { property, layout, gameImages } : undefined}
          />
        ),
      }
    }),
  ], [fieldNames, cards])

  const table = useReactTable({
    data: cards,
    columns,
    state: { sorting, columnFilters, globalFilter, columnOrder, columnSizing },
    onSortingChange: setSorting,
    onColumnFiltersChange: setColumnFilters,
    onGlobalFilterChange: setGlobalFilter,
    onColumnOrderChange: setColumnOrder,
    onColumnSizingChange: setColumnSizing,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
    columnResizeMode: 'onChange',
    initialState: { pagination: { pageSize: 50 } },
  })

  const dragCol = useRef<string | null>(null)
  const [dropTarget, setDropTarget] = useState<string | null>(null)

  if (cards.length === 0) {
    if (isLoading) return <div className="flex items-center justify-center py-8"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>
    return <p className="text-sm text-muted-foreground text-center py-8">No cards yet.</p>
  }

  const SortIcon = ({ column }: { column: any }) => {
    const sorted = column.getIsSorted()
    if (sorted === 'asc') return <ArrowUp className="h-3 w-3" />
    if (sorted === 'desc') return <ArrowDown className="h-3 w-3" />
    return <ArrowUpDown className="h-3 w-3 opacity-30" />
  }

  const resetState = () => {
    setSorting([]); setColumnOrder([]); setColumnSizing({})
    setColumnFilters([]); setGlobalFilter('')
    ;['sorting', 'order', 'sizing'].forEach(k => { try { localStorage.removeItem(`${stateKey}:${k}`) } catch {} })
  }

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2">
        <div className="relative max-w-xs flex-1">
          <Input
            value={globalFilter}
            onChange={e => setGlobalFilter(e.target.value)}
            placeholder="Search all columns..."
            className="h-8 text-sm pr-7"
          />
          {globalFilter && (
            <button className="absolute right-1.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground" onClick={() => setGlobalFilter('')}>
              <X className="h-3.5 w-3.5" />
            </button>
          )}
        </div>
        <Button size="sm" variant="ghost" onClick={resetState} title="Reset sheet">
          <RotateCcw className="h-3.5 w-3.5" />
        </Button>
        <span className="text-xs text-muted-foreground ml-auto">
          {table.getFilteredRowModel().rows.length} / {cards.length} cards
        </span>
      </div>
      <div className="overflow-auto rounded-lg border max-h-[75vh]">
        <table className="text-sm" style={{ minWidth: '100%', width: table.getCenterTotalSize() }}>
          <thead className="sticky top-0 bg-muted z-10">
            {table.getHeaderGroups().map((hg: any) => (
              <tr key={hg.id}>
                {hg.headers.map((header: any) => (
                  <th
                    key={header.id}
                    className={`relative px-2 py-1 text-left font-medium text-muted-foreground whitespace-nowrap border-b select-none group transition-colors ${dropTarget === header.column.id ? 'bg-primary/10' : ''}`}
                    style={{ width: header.getSize() }}
                    draggable
                    onDragStart={e => {
                      if (!dragCol.current) { e.preventDefault(); return }
                    }}
                    onDragOver={e => { e.preventDefault(); if (dragCol.current && dragCol.current !== header.column.id) setDropTarget(header.column.id) }}
                    onDragLeave={() => { if (dropTarget === header.column.id) setDropTarget(null) }}
                    onDrop={() => {
                      if (dragCol.current && dragCol.current !== header.column.id) {
                        setColumnOrder(prev => {
                          const current = prev.length ? [...prev] : table.getAllLeafColumns().map((c: any) => c.id)
                          const from = current.indexOf(dragCol.current!)
                          const to = current.indexOf(header.column.id)
                          if (from >= 0 && to >= 0 && from !== to) {
                            current.splice(from, 1)
                            current.splice(to, 0, dragCol.current!)
                            return current
                          }
                          return prev
                        })
                      }
                      dragCol.current = null; setDropTarget(null)
                    }}
                    onDragEnd={() => { dragCol.current = null; setDropTarget(null) }}
                  >
                    <div className="space-y-1">
                      <div className="flex items-center gap-0.5">
                        <div
                          onMouseDown={() => { dragCol.current = header.column.id }}
                          onMouseUp={() => { dragCol.current = null }}
                          className="shrink-0 cursor-grab opacity-0 group-hover:opacity-40 active:opacity-70"
                        >
                          <GripVertical className="h-3 w-3" />
                        </div>
                        <button
                          className="flex items-center gap-1 hover:text-foreground transition-colors min-w-0 truncate"
                          onClick={header.column.getToggleSortingHandler()}
                        >
                          {flexRender(header.column.columnDef.header, header.getContext())}
                          <SortIcon column={header.column} />
                        </button>
                      </div>
                      <div className="relative">
                        <input
                          className="w-full h-6 rounded border bg-background px-1 pr-5 text-xs font-normal focus:ring-1 focus:ring-primary outline-none"
                          placeholder="Filter..."
                          value={(header.column.getFilterValue() as string) ?? ''}
                          onChange={e => header.column.setFilterValue(e.target.value || undefined)}
                        />
                        {header.column.getFilterValue() && (
                          <button
                            className="absolute right-1 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                            onClick={() => header.column.setFilterValue(undefined)}
                          >
                            <X className="h-3 w-3" />
                          </button>
                        )}
                      </div>
                    </div>
                    <div
                      onMouseDown={header.getResizeHandler()}
                      onTouchStart={header.getResizeHandler()}
                      className="absolute right-0 top-0 bottom-0 w-1 cursor-col-resize hover:bg-primary/50 active:bg-primary"
                    />
                  </th>
                ))}
              </tr>
            ))}
          </thead>
          <tbody>
            {table.getRowModel().rows.map((row: any) => (
              <tr key={row.id} className="border-b last:border-0 hover:bg-muted/30">
                {row.getVisibleCells().map((cell: any) => (
                  <td key={cell.id} className="px-2 py-0.5 overflow-hidden" style={{ width: cell.column.getSize() }}>
                    {flexRender(cell.column.columnDef.cell, cell.getContext())}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {table.getPageCount() > 1 && (
        <div className="flex items-center justify-between">
          <span className="text-xs text-muted-foreground">
            Page {table.getState().pagination.pageIndex + 1} of {table.getPageCount()}
          </span>
          <div className="flex items-center gap-1">
            <Button size="sm" variant="outline" onClick={() => table.previousPage()} disabled={!table.getCanPreviousPage()}>
              <ChevronLeft className="h-3.5 w-3.5" />
            </Button>
            <Button size="sm" variant="outline" onClick={() => table.nextPage()} disabled={!table.getCanNextPage()}>
              <ChevronRight className="h-3.5 w-3.5" />
            </Button>
          </div>
        </div>
      )}
    </div>
  )
}

export default function GameEditorPage() {
  const { gameId, collectionId } = useParams<{ gameId: string; collectionId: string }>()
  const navigate = useNavigate()
  const [searchParams, setSearchParams] = useSearchParams()
  const activeTab = searchParams.get('tab') || 'cards'
  const { storage, status, setStatus, errorDetail, clearError } = useStorage()
  const queryClient = useQueryClient()

  // ── Query hooks (data loading) ──────────────────────────────────
  const { data: gameData } = useGame(gameId)
  const { data: collection } = useCollection(gameId, collectionId)
  const { data: gameFonts = {} } = useFonts(gameId)
  const { data: gameImages = [] } = useImages(gameId)
  const { data: allLayouts = [] } = useLayouts(gameId)
  const { data: queryLayout } = useLayout(gameId, collection?.layoutId)
  const { data: queryCards, isLoading: cardsLoading } = useCards(gameId, collectionId)

  // ── Mutation hooks ──────────────────────────────────────────────
  const updateGameMut = useUpdateGame(gameId)
  const updateCollectionMut = useUpdateCollection(gameId)
  const saveLayoutMut = useSaveLayout(gameId)
  const copyCardMut = useCopyCard(gameId, collectionId)
  const deleteCardMut = useDeleteCard(gameId, collectionId)
  const uploadImageMut = useUploadImage(gameId)
  const invalidateGame = useInvalidateGame(gameId)

  // Game with layout merged (for rendering)
  const game = useMemo(() => {
    if (!gameData || !queryLayout) return null
    return { ...gameData, layout: queryLayout }
  }, [gameData, queryLayout])

  // Cards: local state seeded from query, kept local for editing
  const [cards, setCards] = useState<any[]>([])
  const cardsInitialized = useRef(false)
  useEffect(() => {
    if (queryCards && !cardsInitialized.current) {
      setCards(queryCards)
      cardsInitialized.current = true
      // Auto-select
      if (queryCards.length > 0) {
        const saved = localStorage.getItem(`editor:${gameId}:${collectionId}:selectedCard`)
        const cardToSelect = saved && queryCards.some((c: any) => c.id === saved) ? saved : queryCards[0].id
        setSelectedCardId(cardToSelect)
        setSavedCardJson(JSON.stringify(queryCards.find((c: any) => c.id === cardToSelect) ?? ''))
      }
    }
  }, [queryCards])

  const [selectedCardId, setSelectedCardId] = useState<string | null>(null)
  const selectedCard = useMemo(() => cards.find(c => c.id === selectedCardId) ?? null, [cards, selectedCardId])
  const [cardPreview, setCardPreview] = useState<string>('')
  const [editingName, setEditingName] = useState(false)
  const [editingColName, setEditingColName] = useState(false)
  const [savedCardJson, setSavedCardJson] = useState('')
  const [cardThumbnails, setCardThumbnails] = useState<Record<string, string>>({})
  const [showCreateForm, setShowCreateForm] = useState(false)
  const [newCardName, setNewCardName] = useState('')
  const cardEditor = useCollapsible()
  const layoutSaveTimer = useRef<ReturnType<typeof setTimeout>>(undefined)
  const latestLayoutRef = useRef<any>(null)
  useEffect(() => () => clearTimeout(layoutSaveTimer.current), [])
  const lsKey = (suffix: string) => `editor:${gameId}:${collectionId}:${suffix}`
  const loadSet = (suffix: string) => { try { const v = localStorage.getItem(lsKey(suffix)); return v ? new Set<string>(JSON.parse(v)) : new Set<string>() } catch { return new Set<string>() } }
  const [cardSelection, _setCardSelection] = useState<Set<string>>(() => loadSet('cardSel'))

  useEffect(() => { localStorage.setItem(lsKey('cardSel'), JSON.stringify([...cardSelection])) }, [cardSelection])

  useFontStyles(gameId, gameFonts, 'game-fonts-style')

  useEffect(() => {
    if (!selectedCard || !game?.layout || !gameId) return
    let cancelled = false
    const timer = setTimeout(async () => {
      try {
        const { renderCardSvg, embedFontsInSvg, embedImagesInSvg } = await import('../render')
        if (cancelled) return
        let svg = renderCardSvg(selectedCard, game.layout, { fonts: gameFonts })
        if (cancelled) return
        svg = await embedFontsInSvg(svg, gameId, gameFonts)
        if (cancelled) return
        svg = await embedImagesInSvg(svg)
        if (cancelled) return
        const blob = new Blob([svg], { type: 'image/svg+xml' })
        const blobUrl = URL.createObjectURL(blob)
        setCardPreview((prev) => { if (prev) URL.revokeObjectURL(prev); return blobUrl })
      } catch (error) {
        if (!cancelled) console.error('Error updating card preview:', error)
      }
    }, 100)
    return () => { cancelled = true; clearTimeout(timer) }
  }, [selectedCard, game?.layout, gameId, collection?.back])

  // Generate thumbnails for detailed/gallery views — only re-render all on layout change or card add/remove
  const cardsRef = useRef(cards)
  cardsRef.current = cards
  const cardIds = useMemo(() => cards.map(c => c.id).join(','), [cards])
  useEffect(() => {
    if (!game?.layout || !gameId || cardsRef.current.length === 0) return
    let cancelled = false
    ;(async () => {
      const { renderCardSvg, embedFontsInSvg, embedImagesInSvg } = await import('../render')
      const thumbs: Record<string, string> = {}
      for (const card of cardsRef.current) {
        if (cancelled) return
        try {
          let svg = renderCardSvg(card, game.layout, { fonts: gameFonts })
          svg = await embedFontsInSvg(svg, gameId!, gameFonts)
          svg = await embedImagesInSvg(svg)
          const blob = new Blob([svg], { type: 'image/svg+xml' })
          thumbs[card.id] = URL.createObjectURL(blob)
        } catch { /* skip */ }
      }
      if (!cancelled) setCardThumbnails(prev => {
        Object.values(prev).forEach(u => { try { URL.revokeObjectURL(u) } catch {} })
        return thumbs
      })
    })()
    return () => { cancelled = true }
  }, [cardIds, game?.layout, gameId])

  // Auto-save card
  useEffect(() => {
    if (!selectedCard || !gameId || !collectionId || !storage) return
    if (JSON.stringify(selectedCard) === savedCardJson) return
    const timer = setTimeout(async () => {
      try {
        await storage.saveCard(gameId, collectionId, selectedCard.id, selectedCard)
        setSavedCardJson(JSON.stringify(selectedCard))
      } catch (error) {
        console.error('Auto-save failed:', error)
      }
    }, 2000)
    return () => clearTimeout(timer)
  }, [selectedCard, gameId, storage])

  const selectCard = (_s: any, cardId: string) => {
    setSelectedCardId(cardId)
    setSavedCardJson(JSON.stringify(cards.find(c => c.id === cardId) ?? ''))
    if (gameId && collectionId) localStorage.setItem(`editor:${gameId}:${collectionId}:selectedCard`, cardId)
  }

  const handleCreateCard = async (name?: string) => {
    if (!gameId || !collectionId) return
    const cardName = name?.trim() || `New Card ${cards.length + 1}`
    const newCard = { id: crypto.randomUUID(), name: cardName, fields: {} }
    setCards(prev => [...prev, newCard as any])
    setSelectedCardId(newCard.id)
    setSavedCardJson(JSON.stringify(newCard))
    try {
      await storage.saveCard(gameId, collectionId, newCard.id, newCard)
    } catch {
      setCards(prev => prev.filter(c => c.id !== newCard.id))
      setStatus('Error creating card.')
    }
  }

  const handleDeleteCard = async () => {
    if (!gameId || !collectionId || !selectedCardId) return
    const idx = cards.findIndex(c => c.id === selectedCardId)
    const updatedCards = cards.filter(c => c.id !== selectedCardId)
    try {
      await deleteCardMut.mutateAsync(selectedCardId)
      setCards(updatedCards)
      if (updatedCards.length > 0) {
        const nextIdx = Math.min(idx, updatedCards.length - 1)
        setSelectedCardId(updatedCards[nextIdx].id)
      } else {
        setSelectedCardId(null)
        setCardPreview('')
      }
    } catch {
      setStatus('Error deleting card.')
    }
  }

  const updateCard = (fn: (card: any) => any) => {
    if (!selectedCardId) return
    setCards(prev => prev.map(c => c.id === selectedCardId ? fn(c) : c))
  }

  // Layout handlers – optimistic update + debounced persist
  const handleLayoutSave = (updatedLayout: any) => {
    if (!gameId || !game || !collection) return
    // Optimistic: update the query cache immediately for instant UI feedback
    queryClient.setQueryData(queryKeys.layout(gameId, collection.layoutId), updatedLayout)
    latestLayoutRef.current = updatedLayout
    clearTimeout(layoutSaveTimer.current)
    layoutSaveTimer.current = setTimeout(async () => {
      try {
        await saveLayoutMut.mutateAsync({ layoutId: collection!.layoutId, layout: latestLayoutRef.current })
      } catch { setStatus('Error saving layout.') }
    }, 300)
  }


  if (!game) {
    return (
      <PageLayout
        header={<>
          <Button variant="ghost" size="sm" onClick={() => navigate(`/game/${gameId}`)}>
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <span className="text-muted-foreground text-sm">{status}</span>
        </>}
        errorDetail={errorDetail}
        onDismissError={clearError}
      >
        <div className="flex items-center justify-center p-16">
          <p className="text-muted-foreground animate-pulse">{status}</p>
        </div>
      </PageLayout>
    )
  }

  return (
    <PageLayout
      header={<>
        <Button variant="ghost" size="sm" onClick={() => navigate(`/game/${gameId}`)}>
          <ArrowLeft className="h-5 w-5" />
        </Button>
        {editingName ? (
          <input
            autoFocus
            className="text-lg font-semibold bg-transparent border-b border-primary outline-none"
            defaultValue={game.name}
            onBlur={async (e) => {
              const name = e.target.value.trim()
              setEditingName(false)
              if (!name || name === game.name) return
              try {
                await updateGameMut.mutateAsync({ name })
              } catch {
                setStatus('Error renaming game.')
              }
            }}
            onKeyDown={(e) => {
              if (e.key === 'Enter') (e.target as HTMLInputElement).blur()
              if (e.key === 'Escape') { setEditingName(false) }
            }}
          />
        ) : (
          <h1
            className="text-lg font-semibold cursor-pointer hover:text-muted-foreground transition-colors"
            onClick={() => setEditingName(true)}
          >{game.name}</h1>
        )}
        {collection && (editingColName ? (
          <input
            autoFocus
            className="text-sm italic bg-transparent border-b border-primary outline-none ml-2"
            defaultValue={collection.name}
            onBlur={async (e) => {
              const name = e.target.value.trim()
              setEditingColName(false)
              if (!name || name === collection.name) return
              try {
                await updateCollectionMut.mutateAsync({ collectionId: collectionId!, updates: { name } })
              } catch { setStatus('Error renaming collection.') }
            }}
            onKeyDown={(e) => {
              if (e.key === 'Enter') (e.target as HTMLInputElement).blur()
              if (e.key === 'Escape') setEditingColName(false)
            }}
          />
        ) : (
          <span className="text-sm text-muted-foreground italic ml-2 cursor-pointer hover:text-foreground transition-colors" onClick={() => setEditingColName(true)}>{collection.name}</span>
        ))}
      </>}
      status={status}
      errorDetail={errorDetail}
      onDismissError={clearError}
    >
        <Tabs value={activeTab} onValueChange={(v) => setSearchParams({ tab: v }, { replace: true })} className="w-full">
          <TabsList className="mb-4">
            <TabsTrigger value="cards">Cards</TabsTrigger>
            <TabsTrigger value="data">Data</TabsTrigger>
            <TabsTrigger value="layout">Layout</TabsTrigger>
            <TabsTrigger value="back">Back</TabsTrigger>
            <TabsTrigger value="import">Import</TabsTrigger>
            <TabsTrigger value="export">Export</TabsTrigger>
          </TabsList>

          <TabsContent value="cards">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 items-start">
              <FilterableList
                title="Cards"
                items={cards}
                getKey={(card: any) => card.id}
                getName={(card: any) => card.name ?? ''}
                maxHeight="60vh"
                viewMode={{ key: `editor:${gameId}:viewMode`, default: 'compact' }}
                grid={{ colsKey: `editor:${gameId}:galleryCols`, defaultCols: 2 }}
                getPreviewSrc={(card: any) => cardThumbnails[card.id] ?? ''}
                selectedKey={selectedCardId}
                onSelect={(key) => { if (key) selectCard(storage, key); else setSelectedCardId(null) }}
                empty={cardsLoading
                  ? <div className="flex items-center justify-center py-8"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>
                  : <p className="text-sm text-muted-foreground">No cards yet.</p>}
                actions={selectedCard && (<>
                  <button className="rounded p-1 text-muted-foreground hover:text-primary transition-colors" title="Copy" onClick={async () => {
                    if (!selectedCard) return
                    try {
                      const copy = await copyCardMut.mutateAsync(selectedCard.id)
                      setCards(prev => [...prev, copy])
                      setSelectedCardId(copy.id)
                      setSavedCardJson(JSON.stringify(copy))
                    } catch { setStatus('Error copying card.') }
                  }}>
                    <Copy className="h-4 w-4" />
                  </button>
                  <ConfirmButton iconOnly onConfirm={handleDeleteCard} />
                </>)}
                toolbar={
                  <Button size="sm" variant="ghost" onClick={() => { setShowCreateForm(v => { if (!v) setNewCardName(`Card ${cards.length + 1}`); else setNewCardName(''); return !v }) }} title={showCreateForm ? 'Cancel' : 'New card'}>
                    <Plus className={`h-4 w-4 transition-transform ${showCreateForm ? 'rotate-45' : ''}`} />
                  </Button>
                }
                drawer={showCreateForm ? (
                  <form className="px-2 py-2 border-b space-y-2" onSubmit={async (e) => {
                    e.preventDefault()
                    if (!newCardName.trim()) return
                    await handleCreateCard(newCardName)
                    setNewCardName('')
                    setShowCreateForm(false)
                  }}>
                    <Input
                      autoFocus
                      value={newCardName}
                      onChange={(e) => setNewCardName(e.target.value)}
                      placeholder="Card name"
                      className="h-8 text-sm"
                    />
                    <Button size="sm" variant="outline" type="submit" className="w-full border-green-600 text-green-600 hover:bg-green-600 hover:text-white"><Check className="h-4 w-4" /></Button>
                  </form>
                ) : undefined}
                renderItem={(card: any, vm, selected) => vm === 'gallery' ? (
                  <CardThumbnail
                    src={cardThumbnails[card.id] ?? ''}
                    name={card.name ?? ''}
                    selected={selected}
                  />
                ) : (
                  <ListItem selected={selected}>
                    <div className={vm === 'detailed' ? 'flex items-center gap-3' : ''}>
                      {vm === 'detailed' && cardThumbnails[card.id] && (
                        <LoadingImg src={cardThumbnails[card.id]} alt="" className="h-16 w-auto rounded border object-contain shrink-0 bg-white" />
                      )}
                      <span className="text-sm font-medium">{card.name}</span>
                    </div>
                  </ListItem>
                )}
              />

              {selectedCard ? (
                <div className="rounded-lg border bg-card">
                  <CollapsibleHeader collapsed={cardEditor.collapsed} onToggle={cardEditor.toggle}>
                    <span className="text-sm font-semibold">Editor</span>
                  </CollapsibleHeader>
                  {!cardEditor.collapsed && (
                    <div className="p-4 space-y-4">
                      <FloatingInput
                        label="Name"
                        value={selectedCard.name || ''}
                        onChange={(e) => updateCard(c => ({ ...c, name: e.target.value }))}
                      />

                      {game?.layout?.root && (() => {
                        const bm = game.layout.bindingMeta ?? {}
                        const fieldMap = new Map<string, { field: string; property: string; itemType: string; itemId?: string; values?: string[] }>()
                        const addBindings = (bindings: Record<string, { field: string }> | undefined, nodeType: string, nodeId?: string) => {
                          if (!bindings) return
                          for (const [prop, binding] of Object.entries(bindings)) {
                            if (binding.field === 'name') continue
                            const key = `${binding.field}\0${prop}`
                            if (fieldMap.has(key)) continue
                            fieldMap.set(key, {
                              field: binding.field,
                              property: prop,
                              itemType: nodeType,
                              itemId: nodeId,
                              values: bm[`${prop}:${binding.field}`]?.values,
                            })
                          }
                        }
                        const collectBindings = (section: any) => {
                          addBindings(section.bindings, 'section', section.id)
                          section.items?.forEach((item: any) => addBindings(item.bindings, item.type ?? 'text', item.id))
                          section.children?.forEach(collectBindings)
                        }
                        collectBindings(game.layout.root)
                        if (fieldMap.size === 0) return null

                        const setField = (fieldKey: string, val: string) =>
                          updateCard(c => ({ ...c, fields: { ...c.fields, [fieldKey]: val } }))

                        const getField = (property: string, field: string) =>
                          selectedCard.fields?.[`${property}:${field}`] ?? selectedCard.fields?.[field] ?? bm[`${property}:${field}`]?.default ?? ''

                        return (
                          <div className="space-y-4">
                            {[...fieldMap.entries()].map(([key, { field, property, itemType, itemId, values }]) => {
                              const fieldKey = `${property}:${field}`
                              const val = getField(property, field)
                              const editorType = getEditorType(property, itemType)
                              const isFloatable = !values && (editorType === 'text' || editorType === 'select')
                              return (
                              <div key={key}>
                                {values ? (
                                  <FloatingSelect
                                    label={field}
                                    value={val}
                                    onValueChange={(v) => setField(fieldKey, v)}
                                    options={values.map((v: string) => ({ value: v, label: itemType === 'image' ? gameImages.find(img => img.url === v)?.name ?? v.split('/').pop() ?? v : v }))}
                                  />
                                ) : isFloatable ? (
                                  <FloatingInput
                                    label={field}
                                    value={val}
                                    onChange={(e) => setField(fieldKey, e.target.value)}
                                  />
                                ) : (
                                  <div className="space-y-1">
                                    <Label className="text-sm">{field}</Label>
                                    <ValueItemEditor
                                      property={property}
                                      itemType={itemType}
                                      itemId={itemId}
                                      value={val}
                                      onChange={(v) => setField(fieldKey, v)}
                                      layout={game.layout}
                                      gameImages={gameImages}
                                      onUploadFile={async (file) => {
                                        return await uploadImageMut.mutateAsync(file)
                                      }}
                                    />
                                  </div>
                                )}
                              </div>
                              )
                            })}
                          </div>
                        )
                      })()}
                    </div>
                  )}
                </div>
              ) : (
                <div className="flex items-center justify-center rounded-lg border bg-card p-8">
                  <p className="text-sm text-muted-foreground">Select a card or create a new one to start editing</p>
                </div>
              )}

              {cardPreview && (
                <ZoomablePreview src={cardPreview} alt="Card preview" backImage={collection?.back} backFit={collection?.backFit} />
              )}
            </div>
          </TabsContent>

          <TabsContent value="data">
            <DataSheet
              cards={cards}
              gameId={gameId!}
              collectionId={collectionId!}
              layout={game?.layout}
              gameImages={gameImages}
              onCardsChange={setCards}
              onStatusChange={setStatus}
              isLoading={cardsLoading}
            />
          </TabsContent>

          <TabsContent value="layout">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 items-start">
              {game.layout?.root && allLayouts.length > 0 && (
                <div className="px-2 py-1.5">
                  <select
                    value={collection?.layoutId ?? ''}
                    onChange={async (e) => {
                      const newLayoutId = e.target.value
                      if (!gameId || !collectionId || newLayoutId === collection?.layoutId) return
                      try {
                        await updateCollectionMut.mutateAsync({ collectionId: collectionId!, updates: { layoutId: newLayoutId } })
                      } catch {
                        setStatus('Error changing layout.')
                      }
                    }}
                    className="w-full rounded-md border bg-background pl-3 pr-8 py-1.5 text-sm"
                  >
                    {allLayouts.map((l: any) => (
                      <option key={l.id} value={l.id}>{l.name}</option>
                    ))}
                  </select>
                </div>
              )}
              {game.layout?.root && (
                <LayoutEditorPanel
                  layout={game.layout}
                  onSave={handleLayoutSave}
                  gameId={gameId!}
                  gameFonts={gameFonts}
                  gameImages={gameImages}
                  onUploadFile={async (file) => {
                    return await uploadImageMut.mutateAsync(file)
                  }}
                  cards={cards}
                  back={collection?.back}
                />
              )}
            </div>
          </TabsContent>

          <TabsContent value="back">
            {collection?.back && (
              <ZoomablePreview src={collection.back} alt="Back preview" maxImgHeight="30vh" />
            )}
            <Card>
              <CardContent className="pt-6 space-y-4">
                <div className="space-y-2">
                  <Label>Card Back Image</Label>
                  <ValueItemEditor
                    property="defaultValue"
                    itemType="image"
                    value={collection?.back || ''}
                    layout={game?.layout}
                    gameImages={gameImages}
                    onUploadFile={async (file) => {
                      return await uploadImageMut.mutateAsync(file)
                    }}
                    onChange={async (v) => {
                      try { await updateCollectionMut.mutateAsync({ collectionId: collectionId!, updates: { back: v || undefined } }) }
                      catch { setStatus('Error saving back.') }
                    }}
                  />
                </div>
                {collection?.back && (
                  <div className="space-y-2">
                    <FloatingSelect
                      label="Fit Mode"
                      value={collection?.backFit || 'cover'}
                      onValueChange={async (fit) => {
                        try { await updateCollectionMut.mutateAsync({ collectionId: collectionId!, updates: { backFit: fit } }) }
                        catch { setStatus('Error saving back fit.') }
                      }}
                      options={[
                        { value: 'cover', label: 'Cover' },
                        { value: 'contain', label: 'Contain' },
                        { value: 'fill', label: 'Fill' },
                      ]}
                    />
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="import">
            <div className="space-y-4">
              <ZipMergePanel
                gameId={gameId!}
                layouts={game?.layout ? [game.layout] : []}
                collections={collection ? [collection] : []}
                gameFonts={gameFonts}
                gameImages={gameImages}
                onStatusChange={setStatus}
                onComplete={() => { invalidateGame(); cardsInitialized.current = false }}
              />
              <ImportPanel
                gameId={gameId!}
                collectionId={collectionId}
                cards={cards}
                layout={game?.layout}
                gameFonts={gameFonts}
                collections={collection ? [collection] : []}
                onStatusChange={setStatus}
                onCardsChange={() => { invalidateGame(); cardsInitialized.current = false }}
              />
            </div>
          </TabsContent>

          <TabsContent value="export">
            <FilesPanel
              gameId={gameId!}
              collectionId={collectionId}
              gameName={game?.name}
              collectionName={collection?.name}
              cards={cards}
              layout={game?.layout}
              gameFonts={gameFonts}
              back={collection?.back}
              backFit={collection?.backFit}
              onStatusChange={setStatus}
              onCardsChange={() => { invalidateGame(); cardsInitialized.current = false }}
            />
          </TabsContent>
        </Tabs>
    </PageLayout>
  )
}
