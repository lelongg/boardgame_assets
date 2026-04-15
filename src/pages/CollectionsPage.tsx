import { useState, useEffect, useRef, lazy, Suspense } from 'react'
import { useParams, useNavigate, useSearchParams } from 'react-router-dom'
import { useQueryClient } from '@tanstack/react-query'
import { Button } from '@/components/ui/button'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Input } from '@/components/ui/input'
import { ArrowLeft, Pencil, Copy, Plus, Check, Layers, Loader2 } from 'lucide-react'
import ConfirmButton from '@/components/ConfirmButton'
import ListItem from '@/components/ListItem'
import { ValueItemEditor } from '@/components/layout/ControlPanel'
import LayoutEditorPanel from '@/components/layout/LayoutEditorPanel'
import ImportPanel from '@/components/ImportPanel'
import ZipMergePanel from '@/components/ZipMergePanel'
import CardThumbnail from '@/components/CardThumbnail'
import LoadingImg from '@/components/LoadingImg'
import FilterableList from '@/components/FilterableList'
import PageLayout from '@/components/PageLayout'
import FontManager, { FontPreview, FontPreviewEditor, defaultPreviewText } from '@/components/FontManager'
import useStorage from '../hooks/useStorage'
import {
  useGame, useCollections, useLayouts, useFonts, useImages, useCards,
  useCreateCollection, useUpdateCollection, useDeleteCollection,
  useCreateLayout, useSaveLayout, useCopyLayout, useDeleteLayout,
  useSaveCard, useCopyCard, useDeleteCard,
  useUpdateGame, useUploadImage, useDeleteImage,
  useInvalidateGame, queryKeys,
} from '../hooks/useGameData'
import FilesPanel from '@/components/FilesPanel'
import useAssetUrl from '../hooks/useAssetUrl'
import useFontStyles from '../hooks/useFontStyles'
const LazyImageEditor = lazy(() => import('@/components/ImageEditor'))

function ResolvedImageEditor(props: { src: string; filename?: string; onSave: (dataUrl: string, filename?: string) => void; onSaveAsNew?: (dataUrl: string, filename?: string) => Promise<void>; onCancel: () => void }) {
  const resolved = useAssetUrl(props.src)
  if (!resolved) return <div className="p-4 text-center text-sm text-muted-foreground">Loading image...</div>
  return (
    <Suspense fallback={<div className="p-4 text-center text-sm text-muted-foreground">Loading editor...</div>}>
      <LazyImageEditor {...props} src={resolved} />
    </Suspense>
  )
}

function GameFilesPanel({ gameId, game, layouts, collections, gameFonts, onStatusChange }: {
  gameId: string; game: any; layouts: any[]; collections: any[]; gameFonts: Record<string, { name: string; file: string }>; onStatusChange: (msg: string) => void
}) {
  const { storage } = useStorage()
  const queryClient = useQueryClient()
  const [allCards, setAllCards] = useState<any[]>([])
  const layout = layouts[0] ?? null

  useEffect(() => {
    if (!storage || !gameId || !collections.length) { setAllCards([]); return }
    let cancelled = false
    const load = async () => {
      const cards: any[] = []
      for (const col of collections) {
        const colCards = queryClient.getQueryData<any[]>(queryKeys.cards(gameId, col.id))
          ?? await queryClient.fetchQuery({ queryKey: queryKeys.cards(gameId, col.id), queryFn: () => storage.listCards(gameId, col.id) })
          ?? []
        cards.push(...colCards.map((c: any) => ({ ...c, collectionId: col.id, collectionName: col.name, collectionBack: col.back, collectionBackFit: col.backFit })))
      }
      if (!cancelled) setAllCards(cards)
    }
    load()
    return () => { cancelled = true }
  }, [storage, gameId, collections])

  return (
    <FilesPanel
      gameId={gameId}
      gameName={game?.name}
      cards={allCards}
      layout={layout}
      gameFonts={gameFonts}
      onStatusChange={onStatusChange}
    />
  )
}

function GameImportPanel({ gameId, layouts, collections, gameFonts, onStatusChange, onCardsChange }: {
  gameId: string; layouts: any[]; collections: any[]; gameFonts: Record<string, { name: string; file: string }>; onStatusChange: (msg: string) => void; onCardsChange: () => void
}) {
  const { storage } = useStorage()
  const queryClient = useQueryClient()
  const [allCards, setAllCards] = useState<any[]>([])
  const layout = layouts[0] ?? null

  useEffect(() => {
    if (!storage || !gameId || !collections.length) { setAllCards([]); return }
    let cancelled = false
    const load = async () => {
      const cards: any[] = []
      for (const col of collections) {
        const colCards = queryClient.getQueryData<any[]>(queryKeys.cards(gameId, col.id))
          ?? await queryClient.fetchQuery({ queryKey: queryKeys.cards(gameId, col.id), queryFn: () => storage.listCards(gameId, col.id) })
          ?? []
        cards.push(...colCards.map((c: any) => ({ ...c, collectionId: col.id, collectionName: col.name })))
      }
      if (!cancelled) setAllCards(cards)
    }
    load()
    return () => { cancelled = true }
  }, [storage, gameId, collections])

  return (
    <ImportPanel
      gameId={gameId}
      cards={allCards}
      layout={layout}
      gameFonts={gameFonts}
      collections={collections}
      onStatusChange={onStatusChange}
      onCardsChange={onCardsChange}
    />
  )
}


export default function CollectionsPage() {
  const { gameId } = useParams<{ gameId: string }>()
  const navigate = useNavigate()
  const { storage, status, setStatus, errorDetail, clearError } = useStorage()
  const queryClient = useQueryClient()

  // ── Query hooks (data loading) ──────────────────────────────────
  const { data: game } = useGame(gameId)
  const { data: collections = [], isLoading: collectionsLoading } = useCollections(gameId)
  const { data: layouts = [], isLoading: layoutsLoading } = useLayouts(gameId)
  const { data: gameFonts = {}, isLoading: fontsLoading } = useFonts(gameId)
  const { data: gameImages = [], isLoading: imagesLoading } = useImages(gameId)

  const [expandedCollection, setExpandedCollection] = useState<string | null>(() => {
    try { return localStorage.getItem(`game:${gameId}:selectedCollection`) } catch { return null }
  })
  const { data: collectionCards = [], isLoading: cardsLoading } = useCards(gameId, expandedCollection ?? undefined)

  const [selectedCardId, setSelectedCardId] = useState<string | null>(null)
  const [cardPreviews, setCardPreviews] = useState<Record<string, string>>({})
  const carouselRefs = useRef<Map<string, HTMLElement>>(new Map())
  const [selectedLayoutId, setSelectedLayoutId] = useState<string | null>(() => {
    try { return localStorage.getItem(`game:${gameId}:selectedLayout`) } catch { return null }
  })
  const [editingName, setEditingName] = useState(false)
  const [searchParams, setSearchParams] = useSearchParams()
  const activeTab = searchParams.get('tab') || 'collections'
  const [showFontAdd, setShowFontAdd] = useState(false)
  const [selectedFont, setSelectedFont] = useState<string | null>(null)
  const [fontPreviewText, setFontPreviewText] = useState(defaultPreviewText)
  const [selectedImage, setSelectedImage_] = useState<string | null>(() => { try { return localStorage.getItem(`game:${gameId}:selectedImage`) } catch { return null } })
  const setSelectedImage = (v: string | null) => { setSelectedImage_(v); try { if (v) localStorage.setItem(`game:${gameId}:selectedImage`, v); else localStorage.removeItem(`game:${gameId}:selectedImage`) } catch {} }
  const [showImageUpload, setShowImageUpload] = useState(false)
  const [showCreateCollection, setShowCreateCollection] = useState(false)
  const [newCollectionName, setNewCollectionName] = useState('')
  const [newCollectionLayout, setNewCollectionLayout] = useState('')
  const [showCreateLayout, setShowCreateLayout] = useState(false)
  const [newLayoutName, setNewLayoutName] = useState('')
  const [showCreateCollCard, setShowCreateCollCard] = useState(false)
  const [newCollCardName, setNewCollCardName] = useState('')

  const [editingImage, setEditingImage] = useState(false)

  // ── Mutation hooks ──────────────────────────────────────────────
  const createCollectionMut = useCreateCollection(gameId)
  const updateCollectionMut = useUpdateCollection(gameId)
  const deleteCollectionMut = useDeleteCollection(gameId)
  const createLayoutMut = useCreateLayout(gameId)
  const saveLayoutMut = useSaveLayout(gameId)
  const copyLayoutMut = useCopyLayout(gameId)
  const deleteLayoutMut = useDeleteLayout(gameId)
  const saveCardMut = useSaveCard(gameId, expandedCollection ?? undefined)
  const copyCardMut = useCopyCard(gameId, expandedCollection ?? undefined)
  const deleteCardMut = useDeleteCard(gameId, expandedCollection ?? undefined)
  const updateGameMut = useUpdateGame(gameId)
  const uploadImageMut = useUploadImage(gameId)
  const deleteImageMut = useDeleteImage(gameId)
  const invalidateGame = useInvalidateGame(gameId)

  const [layoutPreviewCards, setLayoutPreviewCards] = useState<any[]>([])

  const selectedLayout = selectedLayoutId ? layouts.find(t => t.id === selectedLayoutId) : null

  // Auto-select first collection when data loads
  useEffect(() => {
    if (collections.length > 0) {
      const saved = localStorage.getItem(`game:${gameId}:selectedCollection`)
      if (!saved || !collections.some((c: any) => c.id === saved)) {
        setExpandedCollection(collections[0].id)
        localStorage.setItem(`game:${gameId}:selectedCollection`, collections[0].id)
      }
    }
  }, [collections, gameId])

  // Auto-select first layout when data loads
  useEffect(() => {
    if (layouts.length > 0) {
      const saved = localStorage.getItem(`game:${gameId}:selectedLayout`)
      if (!saved || !layouts.some((t: any) => t.id === saved)) {
        setSelectedLayoutId(layouts[0].id)
        localStorage.setItem(`game:${gameId}:selectedLayout`, layouts[0].id)
      }
    }
  }, [layouts, gameId])

  // Auto-select first font
  useEffect(() => {
    const fontKeys = Object.keys(gameFonts)
    if (fontKeys.length > 0 && !selectedFont) {
      setSelectedFont(fontKeys[0])
    }
  }, [gameFonts])

  // Auto-select first card when collection cards load
  useEffect(() => {
    if (!expandedCollection) { setSelectedCardId(null); return }
    if (cardsLoading) return // don't react while still fetching
    if (collectionCards.length > 0) {
      setSelectedCardId(prev => prev && collectionCards.some(c => c.id === prev) ? prev : collectionCards[0].id)
    } else {
      setSelectedCardId(null)
    }
  }, [collectionCards, expandedCollection, cardsLoading])

  // Load fonts into the page for preview
  useFontStyles(gameId, gameFonts)

  // Load cards for layout preview selector (uses query cache when available)
  useEffect(() => {
    if (!storage || !gameId || !selectedLayoutId || !collections.length) { setLayoutPreviewCards([]); return }
    let cancelled = false
    const load = async () => {
      const cols = collections.filter((c: any) => c.layoutId === selectedLayoutId)
      const all: any[] = []
      for (const col of cols) {
        const cards = queryClient.getQueryData<any[]>(queryKeys.cards(gameId, col.id))
          ?? await queryClient.fetchQuery({ queryKey: queryKeys.cards(gameId, col.id), queryFn: () => storage.listCards(gameId, col.id) })
          ?? []
        all.push(...cards.map((c: any) => ({ ...c, collectionName: col.name })))
      }
      if (!cancelled) setLayoutPreviewCards(all)
    }
    load()
    return () => { cancelled = true }
  }, [storage, gameId, selectedLayoutId, collections])

  // Render card previews client-side
  useEffect(() => {
    if (!collectionCards.length || !expandedCollection || !layouts.length) { setCardPreviews({}); return }
    const col = collections.find((c: any) => c.id === expandedCollection)
    const tpl = col ? layouts.find((t: any) => t.id === col.layoutId) : null
    if (!tpl) { setCardPreviews({}); return }
    let cancelled = false
    const renderAll = async () => {
      const { renderCardSvg, embedFontsInSvg, embedImagesInSvg } = await import('../render')
      const previews: Record<string, string> = {}
      for (const card of collectionCards) {
        if (cancelled) return
        let svg = renderCardSvg(card, tpl, { fonts: gameFonts })
        svg = await embedFontsInSvg(svg, gameId!, gameFonts)
        svg = await embedImagesInSvg(svg)
        const blob = new Blob([svg], { type: 'image/svg+xml' })
        previews[card.id] = URL.createObjectURL(blob)
      }
      if (!cancelled) setCardPreviews(prev => {
        Object.values(prev).forEach(u => URL.revokeObjectURL(u))
        return previews
      })
    }
    renderAll()
    return () => { cancelled = true }
  }, [collectionCards, collections, layouts, expandedCollection])

  // Scroll carousel thumbnail into view
  useEffect(() => {
    if (!selectedCardId) return
    const el = carouselRefs.current.get(selectedCardId)
    if (el) el.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'nearest' })
  }, [selectedCardId])

  const handleCreateCollection = async (customName?: string, layoutId?: string) => {
    if (!gameId || layouts.length === 0) return
    const name = customName?.trim() || `Collection ${collections.length + 1}`
    const lid = layoutId || layouts[0].id
    try {
      const created = await createCollectionMut.mutateAsync({ name, layoutId: lid })
      setExpandedCollection(created.id)
      if (gameId) localStorage.setItem(`game:${gameId}:selectedCollection`, created.id)
    } catch {
      setStatus('Error creating collection.')
    }
  }

  const handleCreateLayout = async (customName?: string) => {
    if (!gameId) return
    const name = customName?.trim() || `Layout ${layouts.length + 1}`
    try {
      const created = await createLayoutMut.mutateAsync(name)
      setSelectedLayoutId(created.id)
      if (gameId) localStorage.setItem(`game:${gameId}:selectedLayout`, created.id)
    } catch {
      setStatus('Error creating layout.')
    }
  }

  // --- Layout editor handlers ---

  const handleLayoutSave = async (updatedLayout: any) => {
    if (!gameId || !selectedLayoutId) return
    try {
      await saveLayoutMut.mutateAsync({ layoutId: selectedLayoutId, layout: updatedLayout })
      setStatus('Layout saved.')
    } catch {
      setStatus('Error saving layout.')
    }
  }


  if (!game) {
    return (
      <div className="flex h-screen items-center justify-center">
        <p className="text-muted-foreground animate-pulse">{status}</p>
      </div>
    )
  }

  return (
    <PageLayout
      header={<>
        <Button variant="ghost" size="sm" onClick={() => navigate('/')}>
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
              if (e.key === 'Escape') setEditingName(false)
            }}
          />
        ) : (
          <h1
            className="text-lg font-semibold cursor-pointer hover:text-muted-foreground transition-colors"
            onClick={() => setEditingName(true)}
          >{game.name}</h1>
        )}
      </>}
      status={status}
      errorDetail={errorDetail}
      onDismissError={clearError}
    >
        <Tabs value={activeTab} onValueChange={(v) => setSearchParams({ tab: v }, { replace: true })} className="w-full">
          <TabsList className="mb-4">
            <TabsTrigger value="collections">Collections</TabsTrigger>
            <TabsTrigger value="layouts">Layouts</TabsTrigger>
            <TabsTrigger value="fonts">Fonts</TabsTrigger>
            <TabsTrigger value="images">Images</TabsTrigger>
            <TabsTrigger value="import">Import</TabsTrigger>
            <TabsTrigger value="export">Export</TabsTrigger>
          </TabsList>

          <TabsContent value="collections">
            <div className="grid grid-cols-1 md:grid-cols-[320px_1fr] gap-4 items-start">
            <FilterableList
              title="Collections"
              items={collections}
              getKey={(col: any) => col.id}
              getName={(col: any) => col.name}
              selectedKey={expandedCollection}
              onSelect={(key) => {
                setExpandedCollection(key)
                if (gameId) { if (key) localStorage.setItem(`game:${gameId}:selectedCollection`, key); else localStorage.removeItem(`game:${gameId}:selectedCollection`) }
              }}
              empty={collectionsLoading
                ? <div className="flex items-center justify-center py-8"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>
                : <p className="text-sm text-muted-foreground">No collections yet.</p>}
              toolbar={
                <Button size="sm" variant="ghost" onClick={() => { setShowCreateCollection(v => { if (!v) { setNewCollectionName(`Collection ${collections.length + 1}`); setNewCollectionLayout('') } else { setNewCollectionName(''); setNewCollectionLayout('') } return !v }) }} disabled={layouts.length === 0} title={showCreateCollection ? 'Cancel' : 'New collection'}>
                  <Plus className={`h-4 w-4 transition-transform ${showCreateCollection ? 'rotate-45' : ''}`} />
                </Button>
              }
              actions={expandedCollection ? (() => {
                const col = collections.find((c: any) => c.id === expandedCollection)
                if (!col) return undefined
                return <>
                  <button className="rounded p-1 text-muted-foreground hover:text-foreground transition-colors" onClick={() => navigate(`/game/${gameId}/collection/${col.id}`)} title="Edit cards">
                    <Pencil className="h-4 w-4" />
                  </button>
                  <button className="rounded p-1 text-muted-foreground hover:text-foreground transition-colors" title="Clone collection" onClick={async () => {
                    try {
                      setStatus('Cloning collection...')
                      const newCol = await storage.createCollection(gameId, `${col.name} (copy)`, col.layoutId)
                      const cards = await storage.listCards(gameId, col.id)
                      for (const card of cards) {
                        await storage.saveCard(gameId, newCol.id, null, { ...card, id: undefined, name: card.name })
                      }
                      invalidateGame()
                      setExpandedCollection(newCol.id)
                      setStatus('Collection cloned.')
                    } catch { setStatus('Error cloning collection.') }
                  }}>
                    <Copy className="h-4 w-4" />
                  </button>
                  <button className="rounded p-1 text-muted-foreground hover:text-foreground transition-colors" onClick={() => {
                    setSelectedLayoutId(col.layoutId)
                    setSearchParams({ tab: 'layouts' }, { replace: true })
                  }} title="Edit layout">
                    <Layers className="h-4 w-4" />
                  </button>
                  <ConfirmButton iconOnly onConfirm={async () => {
                    try {
                      const idx = collections.findIndex((c: any) => c.id === col.id)
                      await deleteCollectionMut.mutateAsync(col.id)
                      const remaining = collections.filter((c: any) => c.id !== col.id)
                      const nextIdx = Math.min(idx, remaining.length - 1)
                      setExpandedCollection(remaining[nextIdx]?.id ?? null)
                    } catch { setStatus('Error deleting collection.') }
                  }} />
                </>
              })() : undefined}
              drawer={showCreateCollection ? (
                <form className="px-2 py-2 border-b space-y-2" onSubmit={async (e) => {
                  e.preventDefault()
                  if (!newCollectionName.trim()) return
                  await handleCreateCollection(newCollectionName, newCollectionLayout || undefined)
                  setNewCollectionName('')
                  setNewCollectionLayout('')
                  setShowCreateCollection(false)
                }}>
                  <Input
                    autoFocus
                    value={newCollectionName}
                    onChange={(e) => setNewCollectionName(e.target.value)}
                    placeholder="Collection name"
                    className="h-8 text-sm"
                  />
                  <select
                    value={newCollectionLayout || layouts[0]?.id || ''}
                    onChange={(e) => setNewCollectionLayout(e.target.value)}
                    className="w-full h-8 rounded-md border bg-background pl-2 pr-6 text-sm"
                  >
                    {layouts.map((l: any) => (
                      <option key={l.id} value={l.id}>{l.name}</option>
                    ))}
                  </select>
                  <Button size="sm" variant="outline" type="submit" className="w-full border-green-600 text-green-600 hover:bg-green-600 hover:text-white"><Check className="h-4 w-4" /></Button>
                </form>
              ) : undefined}
              renderItem={(col: any, _vm, selected) => (
                    <ListItem selected={selected}>
                      <span className="font-medium">{col.name}</span>
                      <select
                        className="ml-2 text-xs text-muted-foreground bg-transparent border-none cursor-pointer hover:text-foreground transition-colors"
                        value={col.layoutId}
                        onClick={(e) => e.stopPropagation()}
                        onChange={async (e) => {
                          const newLayoutId = e.target.value
                          try { await updateCollectionMut.mutateAsync({ collectionId: col.id, updates: { layoutId: newLayoutId } }) }
                          catch { setStatus('Error changing layout.') }
                        }}
                      >
                        {layouts.map((t: any) => (
                          <option key={t.id} value={t.id}>{t.name}</option>
                        ))}
                      </select>
                    </ListItem>
                  )}
                />
            <div className="space-y-4 min-w-0">
              {expandedCollection ? (
                <FilterableList
                  title="Cards"
                  items={collectionCards}
                  getKey={(card: any) => card.id}
                  getName={(card: any) => card.name}
                  empty={cardsLoading
                    ? <div className="flex items-center justify-center py-8"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>
                    : <p className="text-sm text-muted-foreground text-center py-4">No cards in this collection.</p>}
                  viewMode={{ key: `game:${gameId}:collCardViewMode`, default: 'gallery' }}
                  grid={{ colsKey: 'galleryCols', defaultCols: 3 }}
                  getPreviewSrc={(card: any) => cardPreviews[card.id] || ''}
                  selectedKey={selectedCardId}
                  onSelect={setSelectedCardId}
                  actions={selectedCardId ? (<>
                    <button className="rounded p-1 text-muted-foreground hover:text-foreground transition-colors" title="Edit"
                      onClick={() => { if (gameId && expandedCollection) { if (selectedCardId) localStorage.setItem(`editor:${gameId}:${expandedCollection}:selectedCard`, selectedCardId); localStorage.setItem(`editor:${gameId}:tab`, 'cards') }; navigate(`/game/${gameId}/collection/${expandedCollection}`) }}>
                      <Pencil className="h-4 w-4" />
                    </button>
                    <button className="rounded p-1 text-muted-foreground hover:text-foreground transition-colors" title="Copy"
                      onClick={async () => {
                        if (!selectedCardId) return
                        try {
                          const copy = await copyCardMut.mutateAsync(selectedCardId)
                          setSelectedCardId(copy.id)
                        } catch { setStatus('Error copying card.') }
                      }}>
                      <Copy className="h-4 w-4" />
                    </button>
                    <ConfirmButton iconOnly onConfirm={async () => {
                      if (!selectedCardId) return
                      try {
                        const idx = collectionCards.findIndex(c => c.id === selectedCardId)
                        await deleteCardMut.mutateAsync(selectedCardId)
                        const remaining = collectionCards.filter(c => c.id !== selectedCardId)
                        const nextIdx = Math.min(idx, remaining.length - 1)
                        setSelectedCardId(remaining[nextIdx]?.id ?? null)
                      } catch { setStatus('Error deleting card.') }
                    }} />
                  </>) : undefined}
                  toolbar={
                    <Button size="sm" variant="ghost" onClick={() => { setShowCreateCollCard(v => { if (!v) setNewCollCardName(`Card ${collectionCards.length + 1}`); else setNewCollCardName(''); return !v }) }} title={showCreateCollCard ? 'Cancel' : 'New card'}>
                      <Plus className={`h-4 w-4 transition-transform ${showCreateCollCard ? 'rotate-45' : ''}`} />
                    </Button>
                  }
                  drawer={showCreateCollCard ? (
                    <form className="px-2 py-2 border-b space-y-2" onSubmit={async (e) => {
                      e.preventDefault()
                      if (!newCollCardName.trim() || !expandedCollection) return
                      const name = newCollCardName.trim()
                      const newCard = { id: crypto.randomUUID(), name, fields: {} }
                      try {
                        await saveCardMut.mutateAsync({ cardId: newCard.id, card: newCard })
                        setSelectedCardId(newCard.id)
                      } catch {
                        setStatus('Error creating card.')
                      }
                      setNewCollCardName('')
                      setShowCreateCollCard(false)
                    }}>
                      <Input
                        autoFocus
                        value={newCollCardName}
                        onChange={(e) => setNewCollCardName(e.target.value)}
                        placeholder="Card name"
                        className="h-8 text-sm"
                      />
                      <Button size="sm" variant="outline" type="submit" className="w-full border-green-600 text-green-600 hover:bg-green-600 hover:text-white"><Check className="h-4 w-4" /></Button>
                    </form>
                  ) : undefined}
                  renderItem={(card: any, vm, selected) => vm === 'gallery' ? (
                    <CardThumbnail
                      src={cardPreviews[card.id] || ''}
                      name={card.name}
                      selected={selected}
                    />
                  ) : (
                    <ListItem selected={selected}>
                      <div className={vm === 'detailed' ? 'flex items-center gap-3' : ''}>
                        {vm === 'detailed' && cardPreviews[card.id] && (
                          <img src={cardPreviews[card.id]} alt="" className="h-16 w-auto rounded border object-contain shrink-0 bg-white" />
                        )}
                        <span className="text-sm font-medium">{card.name}</span>
                      </div>
                    </ListItem>
                  )}
                />
              ) : (
                <div className="flex items-center justify-center rounded-lg border bg-card p-8">
                  <p className="text-sm text-muted-foreground">Select a collection to preview cards.</p>
                </div>
              )}
            </div>
            </div>
          </TabsContent>

          <TabsContent value="layouts">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 items-start">
              <FilterableList
                title="Layouts"
                items={layouts}
                getKey={(tpl: any) => tpl.id}
                getName={(tpl: any) => tpl.name}
                selectedKey={selectedLayoutId}
                onSelect={(key) => {
                  setSelectedLayoutId(key)
                  if (gameId) { if (key) localStorage.setItem(`game:${gameId}:selectedLayout`, key); else localStorage.removeItem(`game:${gameId}:selectedLayout`) }
                }}
                empty={layoutsLoading
                  ? <div className="flex items-center justify-center py-8"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>
                  : <p className="text-sm text-muted-foreground">No layouts yet.</p>}
                toolbar={
                  <Button size="sm" variant="ghost" onClick={() => { setShowCreateLayout(v => { if (!v) setNewLayoutName(`Layout ${layouts.length + 1}`); else setNewLayoutName(''); return !v }) }} title={showCreateLayout ? 'Cancel' : 'New layout'}>
                    <Plus className={`h-4 w-4 transition-transform ${showCreateLayout ? 'rotate-45' : ''}`} />
                  </Button>
                }
                actions={selectedLayoutId ? (() => {
                  const tpl = layouts.find((t: any) => t.id === selectedLayoutId)
                  if (!tpl) return undefined
                  return <>
                    <button className="rounded p-1 text-muted-foreground hover:text-foreground transition-colors" title="Copy layout" onClick={async () => {
                      try {
                        const copy = await copyLayoutMut.mutateAsync(tpl.id)
                        setSelectedLayoutId(copy.id)
                      } catch { setStatus('Error copying layout.') }
                    }}>
                      <Copy className="h-4 w-4" />
                    </button>
                    <ConfirmButton iconOnly onConfirm={async () => {
                      try {
                        const idx = layouts.findIndex((t: any) => t.id === tpl.id)
                        await deleteLayoutMut.mutateAsync(tpl.id)
                        const remaining = layouts.filter((t: any) => t.id !== tpl.id)
                        const nextIdx = Math.min(idx, remaining.length - 1)
                        setSelectedLayoutId(remaining[nextIdx]?.id ?? null)
                      } catch (err: any) { setStatus(err.message || 'Error deleting layout.') }
                    }} />
                  </>
                })() : undefined}
                drawer={showCreateLayout ? (
                  <form className="px-2 py-2 border-b space-y-2" onSubmit={async (e) => {
                    e.preventDefault()
                    if (!newLayoutName.trim()) return
                    await handleCreateLayout(newLayoutName)
                    setNewLayoutName('')
                    setShowCreateLayout(false)
                  }}>
                    <Input
                      autoFocus
                      value={newLayoutName}
                      onChange={(e) => setNewLayoutName(e.target.value)}
                      placeholder="Layout name"
                      className="h-8 text-sm"
                    />
                    <Button size="sm" variant="outline" type="submit" className="w-full border-green-600 text-green-600 hover:bg-green-600 hover:text-white"><Check className="h-4 w-4" /></Button>
                  </form>
                ) : undefined}
                renderItem={(tpl: any, _vm, selected) => (
                  <ListItem selected={selected}>
                    <span className="font-medium">{tpl.name}</span>
                    <span className="ml-2 text-xs text-muted-foreground">{tpl.width}×{tpl.height}</span>
                  </ListItem>
                )}
              />

              {selectedLayout?.root ? (
                <LayoutEditorPanel
                  layout={selectedLayout}
                  onSave={handleLayoutSave}
                  gameId={gameId!}
                  gameFonts={gameFonts}
                  gameImages={gameImages}
                  onUploadFile={async (file) => {
                    const url = await uploadImageMut.mutateAsync(file)
                    return url
                  }}
                  cards={layoutPreviewCards}
                />
              ) : (
                <div className="md:col-span-2 flex items-center justify-center rounded-lg border bg-card p-8">
                  <p className="text-sm text-muted-foreground">Select a layout to edit</p>
                </div>
              )}
            </div>
          </TabsContent>

          <TabsContent value="fonts">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 items-start">
              <FontManager
                gameId={gameId!}
                fonts={gameFonts}
                onFontsChange={() => queryClient.invalidateQueries({ queryKey: queryKeys.fonts(gameId!) })}
                onStatus={setStatus}
                showAdd={showFontAdd}
                onToggleAdd={() => setShowFontAdd(v => !v)}
                selectedFont={selectedFont}
                onSelectFont={setSelectedFont}
                isLoading={fontsLoading}
              />

              <FontPreviewEditor previewText={fontPreviewText} onChangePreviewText={setFontPreviewText} />

              <FontPreview fonts={gameFonts} selectedFont={selectedFont} previewText={fontPreviewText} />
            </div>
          </TabsContent>

          <TabsContent value="images">
            {editingImage && selectedImage ? (() => {
              const img = gameImages.find(i => i.file === selectedImage)
              if (!img) return null
              return (
                  <ResolvedImageEditor
                    src={img.url}
                    filename={img.name}
                    onSave={async (dataUrl, newName) => {
                      try {
                        await deleteImageMut.mutateAsync(selectedImage)
                        const resp = await fetch(dataUrl)
                        const blob = await resp.blob()
                        const ext = dataUrl.startsWith('data:image/webp') ? 'webp' : 'png'
                        const file = new File([blob], `${newName || img.name}.${ext}`, { type: blob.type })
                        await uploadImageMut.mutateAsync(file)
                        setEditingImage(false)
                      } catch { setStatus('Error saving image.') }
                    }}
                    onSaveAsNew={async (dataUrl, newName) => {
                      try {
                        const resp = await fetch(dataUrl)
                        const blob = await resp.blob()
                        const ext = dataUrl.startsWith('data:image/webp') ? 'webp' : 'png'
                        const file = new File([blob], `${newName || img.name}.${ext}`, { type: blob.type })
                        await uploadImageMut.mutateAsync(file)
                        setEditingImage(false)
                      } catch { setStatus('Error saving image.') }
                    }}
                    onCancel={() => setEditingImage(false)}
                  />
              )
            })() : (
              <FilterableList
                title="Images"
                items={gameImages}
                getKey={img => img.file}
                getName={img => img.name}
                viewMode={{ key: `game:${gameId}:imageViewMode`, default: 'gallery' }}
                grid={{ colsKey: 'imageCols' }}
                getPreviewSrc={img => img.url}
                selectedKey={selectedImage}
                onSelect={setSelectedImage}
                empty={imagesLoading
                  ? <div className="flex items-center justify-center py-8"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>
                  : <p className="text-sm text-muted-foreground">No images yet.</p>}
                actions={selectedImage ? (<>
                  <button className="rounded p-1 text-muted-foreground hover:text-foreground transition-colors" title="Edit image"
                    onClick={() => setEditingImage(true)}>
                    <Pencil className="h-4 w-4" />
                  </button>
                  <button className="rounded p-1 text-muted-foreground hover:text-foreground transition-colors" title="Copy URL"
                    onClick={() => { const img = gameImages.find(i => i.file === selectedImage); if (img) { navigator.clipboard.writeText(img.url); setStatus('URL copied.') } }}>
                    <Copy className="h-4 w-4" />
                  </button>
                  <ConfirmButton iconOnly onConfirm={async () => {
                    if (!selectedImage) return
                    const idx = gameImages.findIndex((i: any) => i.file === selectedImage)
                    try {
                      await deleteImageMut.mutateAsync(selectedImage)
                      const remaining = gameImages.filter((i: any) => i.file !== selectedImage)
                      const nextIdx = Math.min(idx, remaining.length - 1)
                      setSelectedImage(remaining[nextIdx]?.file ?? null)
                    } catch { setStatus('Error deleting image.') }
                  }} />
                </>) : undefined}
                toolbar={
                  <Button size="sm" variant="ghost" onClick={() => setShowImageUpload(v => !v)} title={showImageUpload ? 'Cancel' : 'Upload image'}>
                    <Plus className={`h-4 w-4 transition-transform ${showImageUpload ? 'rotate-45' : ''}`} />
                  </Button>
                }
                drawer={showImageUpload ? (
                  <div className="px-3 py-2 border-b">
                    <ValueItemEditor
                      property="defaultValue" itemType="image" value=""
                      layout={selectedLayout ?? layouts[0]} gameImages={gameImages}
                      onUploadFile={async (file) => { const url = await uploadImageMut.mutateAsync(file); setShowImageUpload(false); return url }}
                      onChange={() => {}}
                    />
                  </div>
                ) : undefined}
                renderItem={(img, vm, selected) => vm === 'gallery' ? (
                  <CardThumbnail
                    src={img.url} name={img.name} aspectRatio="1"
                    selected={selected}
                  />
                ) : (
                  <ListItem selected={selected}>
                    <div className={vm === 'detailed' ? 'flex items-center gap-3' : ''}>
                      {vm === 'detailed' && (
                        <div className="h-10 w-10 shrink-0 rounded border overflow-hidden" style={{ backgroundImage: 'repeating-conic-gradient(#e5e5e5 0% 25%, transparent 0% 50%)', backgroundSize: '8px 8px' }}>
                          <LoadingImg src={img.url} alt={img.name} className="w-full h-full object-contain" wrapperClassName="w-full h-full" />
                        </div>
                      )}
                      <span className="text-sm font-medium truncate">{img.name}</span>
                    </div>
                  </ListItem>
                )}
              />
            )}
          </TabsContent>

          <TabsContent value="import">
            <div className="space-y-4">
              <ZipMergePanel
                gameId={gameId!}
                layouts={layouts}
                collections={collections}
                gameFonts={gameFonts}
                gameImages={gameImages}
                onStatusChange={setStatus}
                onComplete={invalidateGame}
              />
              <GameImportPanel gameId={gameId!} layouts={layouts} collections={collections} gameFonts={gameFonts} onStatusChange={setStatus} onCardsChange={invalidateGame} />
            </div>
          </TabsContent>

          <TabsContent value="export">
            <GameFilesPanel gameId={gameId!} game={game} layouts={layouts} collections={collections} gameFonts={gameFonts} onStatusChange={setStatus} />
          </TabsContent>
        </Tabs>
    </PageLayout>
  )
}
