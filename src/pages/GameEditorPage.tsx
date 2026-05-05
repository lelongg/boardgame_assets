import { useState, useEffect, useMemo, useRef, useCallback } from 'react'
import { createPortal } from 'react-dom'
import { ArrowLeft, Copy, Plus, Check, ArrowUpDown, ArrowUp, ArrowDown, ChevronLeft, ChevronRight, GripVertical, RotateCcw, X, Loader2, RefreshCw } from 'lucide-react'
import { useParams, useNavigate, useSearchParams } from 'react-router-dom'
import { useQueryClient } from '@tanstack/react-query'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog'
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
import { createLatestSaveQueue } from '@/lib/latestSaveQueue'

const EDITOR_ICONS: Record<string, typeof Palette> = {
  color: Palette,
  emoji: Smile,
  'image-upload': Image,
  boolean: ToggleLeft,
}

/** Strip HTML tags for plain-text preview, preserving text content. */
const stripHtml = (html: string) => html.replace(/<[^>]+>/g, '').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&nbsp;/g, ' ')

/** localStorage key for a card's unsaved draft (survives page reload). */
const cardDraftKey = (gameId: string, collectionId: string, cardId: string) =>
  `editor:draft:${gameId}:${collectionId}:${cardId}`

function RichTextCell({ value, onSave }: { value: string; onSave: (v: string) => void }) {
  const [editing, setEditing] = useState(false)
  const editorRef = useRef<any>(null)
  const cellRef = useRef<HTMLDivElement>(null)
  const popupRef = useRef<HTMLDivElement>(null)
  const [pos, setPos] = useState({ top: 0, left: 0, width: 0 })

  useEffect(() => {
    if (!editing) return
    if (cellRef.current) {
      const r = cellRef.current.getBoundingClientRect()
      let top = r.bottom + 2
      const left = r.left
      const width = Math.max(r.width, 250)
      // Flip above if it would overflow the bottom
      if (top + 120 > window.innerHeight) top = r.top - 120 - 2
      setPos({ top, left, width })
    }
    const onMouseDown = (e: MouseEvent) => {
      if (popupRef.current?.contains(e.target as Node)) return
      if (cellRef.current?.contains(e.target as Node)) return
      if (editorRef.current != null && editorRef.current !== value) onSave(editorRef.current)
      setEditing(false); editorRef.current = null
    }
    document.addEventListener('mousedown', onMouseDown)
    return () => document.removeEventListener('mousedown', onMouseDown)
  }, [editing, value, onSave])

  const plain = stripHtml(value)
  return (
    <div
      ref={cellRef}
      className={`flex items-center rounded ring-1 cursor-text ${editing ? 'ring-primary' : 'ring-transparent'}`}
      onClick={() => { if (!editing) setEditing(true) }}
    >
      <div className="flex-1 px-1 py-0.5 min-h-[1.5rem] truncate [&_strong]:font-bold [&_em]:italic [&_p]:inline" dangerouslySetInnerHTML={{ __html: value || '' }} />
      {!plain && !editing && <span className="flex-1 px-1 py-0.5 text-muted-foreground/50 italic">-</span>}
      {editing && createPortal(
        <div
          ref={popupRef}
          className="fixed z-50 rounded-md border bg-popover shadow-md"
          style={{ top: pos.top, left: pos.left, width: pos.width }}
          onClick={e => e.stopPropagation()}
        >
          <RichTextField
            value={value}
            onChange={v => { editorRef.current = v }}
          />
        </div>,
        document.body,
      )}
    </div>
  )
}

function EditableCell({ value, onSave, bold, editorType, editorProps, allowedValues, gameImages }: {
  value: string; onSave: (v: string) => void; bold?: boolean
  editorType?: string; editorProps?: Record<string, any>
  allowedValues?: string[]
  gameImages?: { file: string; url: string; name: string }[]
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

  const imgLabel = (v: string) => gameImages?.find(img => img.url === v)?.name ?? v

  if (allowedValues?.length) {
    return (
      <select
        className="w-full bg-transparent text-sm pl-1 pr-5 py-0.5 rounded outline-none cursor-pointer focus:ring-1 focus:ring-primary truncate"
        value={value}
        onChange={e => onSave(e.target.value)}
      >
        {!allowedValues.includes(value) && <option value={value}>{imgLabel(value) || '-'}</option>}
        {allowedValues.map(v => <option key={v} value={v}>{imgLabel(v) || '(empty)'}</option>)}
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
          ) : (draft ? imgLabel(draft) : '') || <span className="text-muted-foreground/50 italic">-</span>}
        </div>
      )}
      {adornment
        ? <div className={editing ? '' : 'invisible'}>{adornment}</div>
        : null}
    </div>
  )
}

function DataSheet({ cards, gameId, collectionId, layout, gameImages, onCardsChange, onStatusChange, isLoading, onCreateCard, onSaveCard }: {
  cards: any[]
  gameId: string
  collectionId: string
  layout?: any
  gameImages?: { file: string; url: string; name: string }[]
  onCardsChange: (cards: any[] | ((prev: any[]) => any[])) => void
  onStatusChange: (msg: string) => void
  isLoading?: boolean
  onCreateCard: (name?: string) => Promise<void>
  onSaveCard: (card: any) => Promise<unknown>
}) {
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

  // Build a map from field key (e.g. "defaultValue:suit") to item type (e.g. "image")
  const fieldItemTypes = useMemo(() => {
    const map: Record<string, string> = {}
    if (!layout?.root) return map
    const collect = (section: any) => {
      for (const [prop, binding] of Object.entries(section.bindings ?? {} as Record<string, { field: string }>)) {
        map[`${prop}:${(binding as any).field}`] = 'section'
      }
      section.items?.forEach((item: any) => {
        for (const [prop, binding] of Object.entries(item.bindings ?? {} as Record<string, { field: string }>)) {
          map[`${prop}:${(binding as any).field}`] = item.type ?? 'text'
        }
      })
      section.children?.forEach(collect)
    }
    collect(layout.root)
    return map
  }, [layout])

  // Field names are the union of fields used by any card and fields declared by
  // the layout's bindings, so columns appear even when no card has set a value.
  const fieldNames = useMemo(() => {
    const set = new Set<string>()
    for (const c of cards) for (const k of Object.keys(c.fields ?? {})) set.add(k)
    for (const k of Object.keys(fieldItemTypes)) set.add(k)
    return [...set]
  }, [cards, fieldItemTypes])

  const saveCard = async (cardId: string, updated: any) => {
    onCardsChange(prev => prev.map(c => c.id === cardId ? updated : c))
    try { await onSaveCard(updated) }
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
      const itemType = fieldItemTypes[f]
      const edType = getEditorType(property, itemType)
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
            editorType={hasSpecialEditor ? effectiveType : undefined}
            editorProps={hasSpecialEditor ? { property, itemType, layout, gameImages } : undefined}
            gameImages={gameImages}
          />
        ),
      }
    }),
  ], [fieldNames, cards, fieldItemTypes])

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
    return (
      <div className="text-center py-8 space-y-3">
        <p className="text-sm text-muted-foreground">No cards yet.</p>
        <Button size="sm" variant="outline" onClick={() => onCreateCard()}>
          <Plus className="h-4 w-4 mr-1" /> New Card
        </Button>
      </div>
    )
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
        <Button size="sm" variant="ghost" onClick={() => onCreateCard()} title="New card">
          <Plus className="h-3.5 w-3.5" />
        </Button>
        <span className="text-xs text-muted-foreground ml-auto">
          {table.getFilteredRowModel().rows.length} / {cards.length} cards
        </span>
      </div>
      <div className="overflow-auto rounded-lg border max-h-[75vh]">
        <table className="text-sm" style={{ minWidth: '100%', width: table.getCenterTotalSize(), tableLayout: 'fixed' }}>
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
      if (!gameId || !collectionId) return
      // Apply any localStorage drafts (unsaved edits from a previous session
      // that were interrupted before the async storage write could complete).
      const cardsWithDrafts = queryCards.map((c: any) => {
        try {
          const draftJson = localStorage.getItem(cardDraftKey(gameId, collectionId, c.id))
          if (draftJson) {
            const draft = JSON.parse(draftJson)
            // Only use the draft if it's an object with the matching card id.
            if (draft && typeof draft === 'object' && draft.id === c.id) return draft
          }
        } catch { /* ignore corrupt drafts */ }
        return c
      })
      setCards(cardsWithDrafts)
      cardsInitialized.current = true
      // Auto-select
      if (cardsWithDrafts.length > 0) {
        const saved = localStorage.getItem(`editor:${gameId}:${collectionId}:selectedCard`)
        const cardToSelect = saved && cardsWithDrafts.some((c: any) => c.id === saved) ? saved : cardsWithDrafts[0].id
        setSelectedCardId(cardToSelect)
        // Use the storage version as the "saved" baseline so that a restored
        // draft triggers auto-save immediately on mount.
        const storedCard = queryCards.find((c: any) => c.id === cardToSelect)
        setSavedCardJson(storedCard ? JSON.stringify(storedCard) : '')
      }
    }
  }, [queryCards])

  // Mirror the local `cards` state into the React Query cache so that edits
  // persisted via storage.saveCard (which bypasses the mutation hooks) are not
  // shadowed by a stale cache when the user navigates away and remounts the
  // page. Without this, with staleTime=Infinity (local) or 5min (remote), the
  // query returns pre-edit data on remount and the local state is re-seeded
  // from it, making saved edits appear lost.
  useEffect(() => {
    if (!cardsInitialized.current || !gameId || !collectionId) return
    queryClient.setQueryData(queryKeys.cards(gameId, collectionId), cards)
  }, [cards, gameId, collectionId, queryClient])

  const [selectedCardId, setSelectedCardId] = useState<string | null>(null)
  const selectedCard = useMemo(() => cards.find(c => c.id === selectedCardId) ?? null, [cards, selectedCardId])
  const [cardPreview, setCardPreview] = useState<string>('')
  const [editingName, setEditingName] = useState(false)
  const [editingColName, setEditingColName] = useState(false)
  const [savedCardJson, setSavedCardJson] = useState('')
  const [cardThumbnails, setCardThumbnails] = useState<Record<string, string>>({})
  const [showCreateForm, setShowCreateForm] = useState(false)
  const [newCardName, setNewCardName] = useState('')
  const [showReloadDialog, setShowReloadDialog] = useState(false)
  const cardEditor = useCollapsible()
  const lsKey = (suffix: string) => `editor:${gameId}:${collectionId}:${suffix}`
  const loadSet = (suffix: string) => { try { const v = localStorage.getItem(lsKey(suffix)); return v ? new Set<string>(JSON.parse(v)) : new Set<string>() } catch { return new Set<string>() } }
  const [cardSelection, _setCardSelection] = useState<Set<string>>(() => loadSet('cardSel'))

  // Refs that always point at the latest values — used by flushSave which is
  // called from event handlers and cleanup effects where stale closures would
  // otherwise capture an old snapshot of state.
  const selectedCardRef = useRef<typeof selectedCard>(null)
  const savedCardJsonRef = useRef<string>('')
  const storageRef = useRef<typeof storage>(null)
  const saveLayoutMutRef = useRef(saveLayoutMut)
  const cardSaveQueuesRef = useRef(new Map<string, ReturnType<typeof createLatestSaveQueue<any>>>())
  const layoutSaveQueuesRef = useRef(new Map<string, ReturnType<typeof createLatestSaveQueue<any>>>())
  selectedCardRef.current = selectedCard
  savedCardJsonRef.current = savedCardJson
  storageRef.current = storage
  saveLayoutMutRef.current = saveLayoutMut

  const enqueueCardSave = useCallback((card: any) => {
    if (!gameId || !collectionId) return Promise.reject(new Error('Missing game or collection.'))
    const key = `${gameId}:${collectionId}:${card.id}`
    let queue = cardSaveQueuesRef.current.get(key)
    if (!queue) {
      queue = createLatestSaveQueue<any>(async (latestCard) => {
        const s = storageRef.current
        if (!s) throw new Error('Storage is not ready.')
        await s.saveCard(gameId, collectionId, latestCard.id, latestCard)
      })
      cardSaveQueuesRef.current.set(key, queue)
    }
    return queue.enqueue(card)
  }, [gameId, collectionId])

  const enqueueLayoutSave = useCallback((layout: any) => {
    if (!gameId || !collection?.layoutId) return Promise.reject(new Error('Missing game or layout.'))
    const key = `${gameId}:${collection.layoutId}`
    let queue = layoutSaveQueuesRef.current.get(key)
    if (!queue) {
      queue = createLatestSaveQueue<any>(async (latestLayout) => {
        await saveLayoutMutRef.current.mutateAsync({ layoutId: collection.layoutId, layout: latestLayout })
      })
      layoutSaveQueuesRef.current.set(key, queue)
    }
    return queue.enqueue(layout)
  }, [gameId, collection?.layoutId])

  /**
   * Immediately persist the selected card if it has unsaved changes.
   * Called fire-and-forget when switching cards or unmounting so that edits
   * made inside the debounce window are never lost.
   */
  const flushSave = useCallback(() => {
    const card = selectedCardRef.current
    const savedJson = savedCardJsonRef.current
    if (!card || !gameId || !collectionId) return
    if (JSON.stringify(card) === savedJson) return
    const cardId = card.id
    enqueueCardSave(card)
      .then((result) => {
        if (result !== 'saved') return
        // Clear the localStorage draft now that the storage write succeeded
        // (the component may already be unmounted so we can't rely on state effects).
        try { localStorage.removeItem(cardDraftKey(gameId, collectionId, cardId)) } catch { /* ignore */ }
      })
      .catch((err: unknown) => console.error('Flush save failed:', err))
  }, [gameId, collectionId, enqueueCardSave])

  // Flush on unmount so navigation away never discards pending edits.
  useEffect(() => () => { flushSave() }, [flushSave])

  // Write unsaved card data to localStorage immediately whenever there are
  // pending changes.  localStorage writes are synchronous and survive a page
  // reload, so this guarantees the draft is present even if the browser
  // unloads the page before the async storage.saveCard call completes.
  useEffect(() => {
    if (!selectedCard || !gameId || !collectionId) return
    const cardJson = JSON.stringify(selectedCard)
    if (cardJson === savedCardJson) {
      // Card is fully saved – remove any stale draft so we don't restore old
      // data after the user has deliberately made further edits and saved.
      try { localStorage.removeItem(cardDraftKey(gameId, collectionId, selectedCard.id)) } catch { /* ignore */ }
      return
    }
    try { localStorage.setItem(cardDraftKey(gameId, collectionId, selectedCard.id), cardJson) } catch { /* ignore quota errors */ }
  }, [selectedCard, savedCardJson, gameId, collectionId])

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
        // Create a separate URL for the card list thumbnail so each can be
        // revoked independently (revoking the preview must not break the thumb).
        const thumbUrl = URL.createObjectURL(blob)
        const cardId = selectedCard.id
        setCardPreview((prev) => { if (prev) URL.revokeObjectURL(prev); return blobUrl })
        setCardThumbnails(prev => {
          const old = prev[cardId]
          if (old) { try { URL.revokeObjectURL(old) } catch { /* safe to ignore */ } }
          return { ...prev, [cardId]: thumbUrl }
        })
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
        const result = await enqueueCardSave(selectedCard)
        if (result === 'saved') setSavedCardJson(JSON.stringify(selectedCard))
      } catch (error) {
        console.error('Auto-save failed:', error)
        setStatus('Auto-save failed. Check your connection or storage settings.')
      }
    }, 2000)
    return () => clearTimeout(timer)
  }, [selectedCard, savedCardJson, gameId, collectionId, storage, enqueueCardSave])

  const selectCard = (_s: any, cardId: string) => {
    // Flush any edits made within the debounce window before switching away.
    flushSave()
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
      await enqueueCardSave(newCard)
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
      // Clear any localStorage draft for the deleted card.
      try { localStorage.removeItem(cardDraftKey(gameId, collectionId, selectedCardId)) } catch { /* ignore */ }
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

  // Layout handlers – optimistic update + immediate persist.
  // `LayoutEditorPanel` already debounces 300ms before calling `onSave`, so
  // adding another debounce here would double the latency and create a window
  // (300–600ms after the last edit) during which the user navigating away
  // would silently drop the change. Persisting synchronously also means that
  // the unmount safety-net flushes are no longer required for layout edits.
  const handleLayoutSave = (updatedLayout: any) => {
    if (!gameId || !game || !collection) return
    // Optimistic: update the query cache immediately for instant UI feedback.
    queryClient.setQueryData(queryKeys.layout(gameId, collection.layoutId), updatedLayout)
    enqueueLayoutSave(updatedLayout).catch(() => setStatus('Error saving layout.'))
  }

  /** True when there are unsaved local card edits (localStorage drafts or current card pending write). */
  const hasLocalCardChanges = useMemo(() => {
    if (!gameId || !collectionId) return false
    for (const card of cards) {
      if (localStorage.getItem(cardDraftKey(gameId, collectionId, card.id))) return true
    }
    if (selectedCard && JSON.stringify(selectedCard) !== savedCardJson) return true
    return false
  }, [gameId, collectionId, cards, selectedCard, savedCardJson])

  const reloadCardsFromStorage = () => {
    if (!gameId || !collectionId) return
    // Remove all localStorage drafts for this collection so re-seeding uses clean storage data.
    for (const card of cards) {
      try { localStorage.removeItem(cardDraftKey(gameId, collectionId, card.id)) } catch (err) { console.error('Failed to clear card draft:', err) }
    }
    // Deselect card to prevent auto-save firing during reload.
    setSelectedCardId(null)
    setSavedCardJson('')
    // Allow the next query result to re-seed the cards state.
    cardsInitialized.current = false
    // Force a fresh fetch from the storage backend.
    queryClient.invalidateQueries({ queryKey: queryKeys.cards(gameId, collectionId) })
    setShowReloadDialog(false)
  }

  const handleReloadClick = () => {
    if (hasLocalCardChanges) {
      setShowReloadDialog(true)
    } else {
      reloadCardsFromStorage()
    }
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
                  <>
                    <Button size="sm" variant="ghost" onClick={handleReloadClick} title="Reload from storage">
                      <RefreshCw className="h-4 w-4" />
                    </Button>
                    <Button size="sm" variant="ghost" onClick={() => { setShowCreateForm(v => { if (!v) setNewCardName(`Card ${cards.length + 1}`); else setNewCardName(''); return !v }) }} title={showCreateForm ? 'Cancel' : 'New card'}>
                      <Plus className={`h-4 w-4 transition-transform ${showCreateForm ? 'rotate-45' : ''}`} />
                    </Button>
                  </>
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
              onCreateCard={handleCreateCard}
              onSaveCard={enqueueCardSave}
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

        <Dialog open={showReloadDialog} onOpenChange={setShowReloadDialog}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Reload from storage?</DialogTitle>
              <DialogDescription>
                You have unsaved local modifications. Reloading will discard all local changes and replace them with the version in storage.
              </DialogDescription>
            </DialogHeader>
            <DialogFooter>
              <Button variant="outline" onClick={() => setShowReloadDialog(false)}>Keep local</Button>
              <Button variant="destructive" onClick={reloadCardsFromStorage}>Load from storage</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
    </PageLayout>
  )
}
