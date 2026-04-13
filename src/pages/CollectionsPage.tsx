import { useState, useEffect, useRef, lazy, Suspense } from 'react'
import { useParams, useNavigate, useSearchParams } from 'react-router-dom'
import { Button } from '@/components/ui/button'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Input } from '@/components/ui/input'
import { ArrowLeft, Pencil, Copy, Plus, Check, Layers } from 'lucide-react'
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
import FilesPanel from '@/components/FilesPanel'
import useAssetUrl from '../hooks/useAssetUrl'
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

function GameFilesPanel({ gameId, storage, game, layouts, collections, gameFonts, onStatusChange }: {
  gameId: string; storage: any; game: any; layouts: any[]; collections: any[]; gameFonts: Record<string, { name: string; file: string }>; onStatusChange: (msg: string) => void
}) {
  const [allCards, setAllCards] = useState<any[]>([])
  const layout = layouts[0] ?? null

  useEffect(() => {
    if (!storage || !gameId || !collections.length) { setAllCards([]); return }
    let cancelled = false
    const load = async () => {
      const cards: any[] = []
      for (const col of collections) {
        const colCards = await storage.listCards(gameId, col.id)
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
      storage={storage}
      onStatusChange={onStatusChange}
    />
  )
}

function GameImportPanel({ gameId, storage, layouts, collections, gameFonts, onStatusChange, onCardsChange }: {
  gameId: string; storage: any; layouts: any[]; collections: any[]; gameFonts: Record<string, { name: string; file: string }>; onStatusChange: (msg: string) => void; onCardsChange: () => void
}) {
  const [allCards, setAllCards] = useState<any[]>([])
  const layout = layouts[0] ?? null

  useEffect(() => {
    if (!storage || !gameId || !collections.length) { setAllCards([]); return }
    let cancelled = false
    const load = async () => {
      const cards: any[] = []
      for (const col of collections) {
        const colCards = await storage.listCards(gameId, col.id)
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
      storage={storage}
      collections={collections}
      onStatusChange={onStatusChange}
      onCardsChange={onCardsChange}
    />
  )
}


export default function CollectionsPage() {
  const { gameId } = useParams<{ gameId: string }>()
  const navigate = useNavigate()
  const { storage, status, setStatus, setError, errorDetail, clearError } = useStorage()
  const [game, setGame] = useState<any>(null)
  const [collections, setCollections] = useState<any[]>([])
  const [layouts, setLayouts] = useState<any[]>([])
  const [expandedCollection, setExpandedCollection] = useState<string | null>(() => {
    try { return localStorage.getItem(`game:${gameId}:selectedCollection`) } catch { return null }
  })
  const [collectionCards, setCollectionCards] = useState<any[]>([])
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
  const [gameFonts, setGameFonts] = useState<Record<string, { name: string; file: string; source: 'upload' | 'google' }>>({})
  const [gameImages, setGameImages] = useState<{ file: string; url: string; name: string }[]>([])
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

  // Fuzzy filters

  const [layoutPreviewCards, setLayoutPreviewCards] = useState<any[]>([])

  const selectedLayout = selectedLayoutId ? layouts.find(t => t.id === selectedLayoutId) : null

  useEffect(() => {
    if (!storage || !gameId) return
    loadData(storage)
  }, [storage, gameId])

  // Load fonts into the page for preview (fetch through interceptor for IndexedDB support)
  useEffect(() => {
    if (!gameFonts || !gameId) return
    let cancelled = false
    const styleId = `game-fonts-${gameId}`
    let style = document.getElementById(styleId) as HTMLStyleElement | null
    if (!style) { style = document.createElement('style'); style.id = styleId; document.head.appendChild(style) }
    const load = async () => {
      const rules: string[] = []
      for (const f of Object.values(gameFonts)) {
        if (!f.file || cancelled) continue
        try {
          const resp = await fetch(`/api/games/${gameId}/fonts/${f.file}`)
          if (!resp.ok) continue
          const blob = await resp.blob()
          const b64 = await new Promise<string>(r => { const reader = new FileReader(); reader.onload = () => r(reader.result as string); reader.readAsDataURL(blob) })
          rules.push(`@font-face { font-family: '${f.name}'; src: url('${b64}'); }`)
        } catch { /* skip */ }
      }
      if (!cancelled && style) style.textContent = rules.join('\n')
    }
    load()
    return () => { cancelled = true; if (style) style.textContent = '' }
  }, [gameFonts, gameId])

  // Load cards for layout preview selector
  useEffect(() => {
    if (!storage || !gameId || !selectedLayoutId || !collections.length) { setLayoutPreviewCards([]); return }
    const load = async () => {
      const cols = collections.filter(c => c.layoutId === selectedLayoutId)
      const all: any[] = []
      for (const col of cols) {
        const cards = await storage.listCards(gameId, col.id)
        all.push(...cards.map((c: any) => ({ ...c, collectionName: col.name })))
      }
      setLayoutPreviewCards(all)
    }
    load()
  }, [storage, gameId, selectedLayoutId, collections])

  // Render card previews client-side
  useEffect(() => {
    if (!collectionCards.length || !expandedCollection || !layouts.length) { setCardPreviews({}); return }
    const col = collections.find(c => c.id === expandedCollection)
    const tpl = col ? layouts.find(t => t.id === col.layoutId) : null
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

  // Load cards when a collection is selected
  useEffect(() => {
    if (!expandedCollection || !storage || !gameId) { setCollectionCards([]); setSelectedCardId(null); return; }
    setSelectedCardId(null)
    storage.listCards(gameId, expandedCollection).then((cards: any[]) => {
      setCollectionCards(cards)
      if (cards.length > 0) setSelectedCardId(cards[0].id)
    }).catch(() => setCollectionCards([]))
  }, [expandedCollection, storage, gameId])

  // Scroll carousel thumbnail into view
  useEffect(() => {
    if (!selectedCardId) return
    const el = carouselRefs.current.get(selectedCardId)
    if (el) el.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'nearest' })
  }, [selectedCardId])

  const loadData = async (s: any) => {
    try {
      if (!gameId) return
      const [gameData, colList, tplList, fonts, images] = await Promise.all([
        s.getGame(gameId),
        s.listCollections(gameId),
        s.listLayouts(gameId),
        s.listFonts(gameId),
        s.listImages?.(gameId).catch(() => []) ?? [],
      ])
      setGame(gameData)
      setCollections(colList)
      setLayouts(tplList)
      setGameFonts(fonts)
      setGameImages(images)
      setCardPreviews({})

      // Auto-select first item if no persisted selection
      if (colList.length > 0) {
        const saved = localStorage.getItem(`game:${gameId}:selectedCollection`)
        if (!saved || !colList.some((c: any) => c.id === saved)) {
          setExpandedCollection(colList[0].id)
          localStorage.setItem(`game:${gameId}:selectedCollection`, colList[0].id)
        }
      }
      if (tplList.length > 0) {
        const saved = localStorage.getItem(`game:${gameId}:selectedLayout`)
        const tpl = saved && tplList.find((t: any) => t.id === saved) ? tplList.find((t: any) => t.id === saved) : tplList[0]
        if (!saved || !tplList.some((t: any) => t.id === saved)) {
          setSelectedLayoutId(tpl.id)
          localStorage.setItem(`game:${gameId}:selectedLayout`, tpl.id)
        }
        // selectedNodeId is now managed inside LayoutEditorPanel
      }
      const fontKeys = Object.keys(fonts)
      if (fontKeys.length > 0 && !selectedFont) {
        setSelectedFont(fontKeys[0])
      }

      setStatus('Ready.')
    } catch (error) {
      setError('Error loading game', error)
    }
  }

  const handleCreateCollection = async (customName?: string, layoutId?: string) => {
    if (!storage || !gameId || layouts.length === 0) return
    const name = customName?.trim() || `Collection ${collections.length + 1}`
    const lid = layoutId || layouts[0].id
    const optimistic = { id: `temp-${Date.now()}`, name, layoutId: lid }
    setCollections(prev => [...prev, optimistic])
    setExpandedCollection(optimistic.id)
    try {
      const created = await storage.createCollection(gameId, name, lid)
      setCollections(prev => prev.map(c => c.id === optimistic.id ? created : c))
      setExpandedCollection(created.id)
      if (gameId) localStorage.setItem(`game:${gameId}:selectedCollection`, created.id)
    } catch {
      setCollections(prev => prev.filter(c => c.id !== optimistic.id))
      setStatus('Error creating collection.')
    }
  }

  const handleCreateLayout = async (customName?: string) => {
    if (!storage || !gameId) return
    const name = customName?.trim() || `Layout ${layouts.length + 1}`
    const optimistic = { version: 2 as const, id: `temp-${Date.now()}`, name, width: 63.5, height: 88.9, radius: 2.5, bleed: 1.5, fonts: {}, root: { id: 'root', name: 'Root', layout: 'stack' as const, sizePct: 100, gap: 0, children: [], items: [] } }
    setLayouts(prev => [...prev, optimistic])
    setSelectedLayoutId(optimistic.id)
    try {
      const created = await storage.createLayout(gameId, name)
      setLayouts(prev => prev.map(t => t.id === optimistic.id ? created : t))
      setSelectedLayoutId(created.id)
      if (gameId) localStorage.setItem(`game:${gameId}:selectedLayout`, created.id)
    } catch {
      setLayouts(prev => prev.filter(t => t.id !== optimistic.id))
      setStatus('Error creating layout.')
    }
  }

  // --- Layout editor handlers ---

  const handleLayoutSave = async (updatedLayout: any) => {
    if (!gameId || !selectedLayoutId || !storage) return
    try {
      await storage.saveLayout(gameId, selectedLayoutId, updatedLayout)
      setLayouts(prev => prev.map(t => t.id === selectedLayoutId ? updatedLayout : t))
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
                await storage.updateGame(gameId, { name })
                setGame({ ...game, name })
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
              empty={<p className="text-sm text-muted-foreground">No collections yet.</p>}
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
                      await loadData(storage)
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
                    const prev = collections
                    const idx = collections.findIndex((c) => c.id === col.id)
                    const updated = collections.filter((c) => c.id !== col.id)
                    setCollections(updated)
                    const nextIdx = Math.min(idx, updated.length - 1)
                    setExpandedCollection(updated[nextIdx]?.id ?? null)
                    try { await storage.deleteCollection(gameId, col.id) }
                    catch { setCollections(prev); setExpandedCollection(col.id); setStatus('Error deleting collection.') }
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
                          const prev = collections
                          setCollections(collections.map((c: any) => c.id === col.id ? { ...c, layoutId: newLayoutId } : c))
                          try { await storage.updateCollection(gameId, col.id, { layoutId: newLayoutId }) }
                          catch { setCollections(prev); setStatus('Error changing layout.') }
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
                  empty={<p className="text-sm text-muted-foreground text-center py-4">No cards in this collection.</p>}
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
                        const card = collectionCards.find(c => c.id === selectedCardId)
                        if (!card) return
                        const opt = { ...card, id: `temp-${Date.now()}`, name: `New Card ${collectionCards.length + 1}` }
                        setCollectionCards(prev => [...prev, opt])
                        setSelectedCardId(opt.id)
                        try { const copy = await storage.copyCard(gameId, expandedCollection, selectedCardId); setCollectionCards(prev => prev.map(c => c.id === opt.id ? copy : c)); setSelectedCardId(copy.id) }
                        catch { setCollectionCards(prev => prev.filter(c => c.id !== opt.id)); setStatus('Error copying card.') }
                      }}>
                      <Copy className="h-4 w-4" />
                    </button>
                    <ConfirmButton iconOnly onConfirm={async () => {
                      const prev = collectionCards; const prevId = selectedCardId
                      const idx = collectionCards.findIndex(c => c.id === selectedCardId)
                      const updated = collectionCards.filter(c => c.id !== selectedCardId)
                      setCollectionCards(updated)
                      const nextIdx = Math.min(idx, updated.length - 1)
                      setSelectedCardId(updated[nextIdx]?.id ?? null)
                      try { await storage.deleteCard(gameId, expandedCollection, prevId) }
                      catch { setCollectionCards(prev); setSelectedCardId(prevId); setStatus('Error deleting card.') }
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
                      setCollectionCards(prev => [...prev, newCard as any])
                      setSelectedCardId(newCard.id)
                      try {
                        await storage.saveCard(gameId, expandedCollection, newCard.id, newCard)
                      } catch {
                        setCollectionCards(prev => prev.filter(c => c.id !== newCard.id))
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
                empty={<p className="text-sm text-muted-foreground">No layouts yet.</p>}
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
                      const opt = { ...tpl, id: `temp-${Date.now()}`, name: `Layout ${layouts.length + 1}` }
                      setLayouts(prev => [...prev, opt])
                      setSelectedLayoutId(opt.id)
                      try {
                        const copy = await storage.copyLayout(gameId, tpl.id)
                        setLayouts(prev => prev.map(t => t.id === opt.id ? copy : t))
                        setSelectedLayoutId(copy.id)
                      } catch { setLayouts(prev => prev.filter(t => t.id !== opt.id)); setStatus('Error copying layout.') }
                    }}>
                      <Copy className="h-4 w-4" />
                    </button>
                    <ConfirmButton iconOnly onConfirm={async () => {
                      const prev = layouts
                      const idx = layouts.findIndex((t) => t.id === tpl.id)
                      const updated = layouts.filter((t) => t.id !== tpl.id)
                      setLayouts(updated)
                      const nextIdx = Math.min(idx, updated.length - 1)
                      setSelectedLayoutId(updated[nextIdx]?.id ?? null)
                      try { await storage.deleteLayout(gameId, tpl.id) }
                      catch (err: any) { setLayouts(prev); setSelectedLayoutId(tpl.id); setStatus(err.message || 'Error deleting layout.') }
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
                    const url = await storage.uploadImage(gameId, file)
                    const images = await storage.listImages(gameId)
                    setGameImages(images)
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
                storage={storage}
                fonts={gameFonts}
                onFontsChange={setGameFonts}
                onStatus={setStatus}
                showAdd={showFontAdd}
                onToggleAdd={() => setShowFontAdd(v => !v)}
                selectedFont={selectedFont}
                onSelectFont={setSelectedFont}
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
                        await storage.deleteImage(gameId, selectedImage)
                        const resp = await fetch(dataUrl)
                        const blob = await resp.blob()
                        const ext = dataUrl.startsWith('data:image/webp') ? 'webp' : 'png'
                        const file = new File([blob], `${newName || img.name}.${ext}`, { type: blob.type })
                        const url = await storage.uploadImage(gameId, file)
                        const images = await storage.listImages(gameId)
                        setGameImages(images)
                        const newFile = images.find((i: { url: string; file: string }) => i.url === url)?.file
                        setSelectedImage(newFile ?? images[0]?.file ?? null)
                        setEditingImage(false)
                      } catch { setStatus('Error saving image.') }
                    }}
                    onSaveAsNew={async (dataUrl, newName) => {
                      try {
                        const resp = await fetch(dataUrl)
                        const blob = await resp.blob()
                        const ext = dataUrl.startsWith('data:image/webp') ? 'webp' : 'png'
                        const file = new File([blob], `${newName || img.name}.${ext}`, { type: blob.type })
                        const url = await storage.uploadImage(gameId, file)
                        const images = await storage.listImages(gameId)
                        setGameImages(images)
                        const newFile = images.find((i: { url: string; file: string }) => i.url === url)?.file
                        if (newFile) setSelectedImage(newFile)
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
                    const idx = gameImages.findIndex(i => i.file === selectedImage)
                    const updated = gameImages.filter(i => i.file !== selectedImage)
                    const nextIdx = Math.min(idx, updated.length - 1)
                    try { await storage.deleteImage(gameId, selectedImage); setGameImages(updated); setSelectedImage(updated[nextIdx]?.file ?? null) }
                    catch { setStatus('Error deleting image.') }
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
                      onUploadFile={async (file) => { const url = await storage.uploadImage(gameId, file); const images = await storage.listImages(gameId); setGameImages(images); setShowImageUpload(false); return url }}
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
                storage={storage}
                layouts={layouts}
                collections={collections}
                gameFonts={gameFonts}
                gameImages={gameImages}
                onStatusChange={setStatus}
                onComplete={() => loadData(storage)}
              />
              <GameImportPanel gameId={gameId!} storage={storage} layouts={layouts} collections={collections} gameFonts={gameFonts} onStatusChange={setStatus} onCardsChange={() => loadData(storage)} />
            </div>
          </TabsContent>

          <TabsContent value="export">
            <GameFilesPanel gameId={gameId!} storage={storage} game={game} layouts={layouts} collections={collections} gameFonts={gameFonts} onStatusChange={setStatus} />
          </TabsContent>
        </Tabs>
    </PageLayout>
  )
}
