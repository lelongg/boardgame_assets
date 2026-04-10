import { useState, useEffect, useRef } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { ArrowLeft, Eye, Pencil, ChevronLeft, ChevronRight, X, Copy, Minus, Plus, LayoutGrid, Layers, Printer } from 'lucide-react'
import ConfirmButton from '@/components/ConfirmButton'
import ListItem from '@/components/ListItem'
import NodeTree from '@/components/layout/NodeTree'
import PropertyPanel from '@/components/layout/PropertyPanel'
import ZoomablePreview from '@/components/ZoomablePreview'
import { getNodeKind, moveNode, findSectionById, findNodeLocation, findParentSection, findItemById } from '@/components/layout/layoutHelpers'
import LoadingImg from '@/components/LoadingImg'
import PageLayout from '@/components/PageLayout'
import FontManager, { FontPreview, FontPreviewEditor, defaultPreviewText } from '@/components/FontManager'
import useStorage from '../hooks/useStorage'

export default function CollectionsPage() {
  const { gameId } = useParams<{ gameId: string }>()
  const navigate = useNavigate()
  const { storage, status, setStatus } = useStorage()
  const [game, setGame] = useState<any>(null)
  const [collections, setCollections] = useState<any[]>([])
  const [layouts, setLayouts] = useState<any[]>([])
  const [expandedCollection, setExpandedCollection] = useState<string | null>(() => {
    try { return localStorage.getItem(`game:${gameId}:selectedCollection`) } catch { return null }
  })
  const [collectionCards, setCollectionCards] = useState<any[]>([])
  const [selectedCardId, setSelectedCardId] = useState<string | null>(null)
  const [galleryCols, setGalleryCols] = useState(() => {
    try { return Number(localStorage.getItem('galleryCols')) || 3 } catch { return 3 }
  })
  const [showBigPreview, setShowBigPreview] = useState(false)
  const [cardPreviews, setCardPreviews] = useState<Record<string, string>>({})
  const carouselRefs = useRef<Map<string, HTMLElement>>(new Map())
  const [selectedLayoutId, setSelectedLayoutId] = useState<string | null>(() => {
    try { return localStorage.getItem(`game:${gameId}:selectedLayout`) } catch { return null }
  })
  const [showSections, setShowSections] = useState(true)
  const [showItemWires, setShowItemWires] = useState(true)
  const [editingName, setEditingName] = useState(false)
  const [showFontAdd, setShowFontAdd] = useState(false)
  const [selectedFont, setSelectedFont] = useState<string | null>(null)
  const [fontPreviewText, setFontPreviewText] = useState(defaultPreviewText)
  const [gameFonts, setGameFonts] = useState<Record<string, { name: string; file: string; source: 'upload' | 'google' }>>({})

  // Layout editor state
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null)
  const [selectedProperty, setSelectedProperty] = useState<string | null>(null)
  const [propertyByType, setPropertyByType] = useState<Record<string, string>>({})
  const [layoutPreview, setLayoutPreview] = useState<string>('')
  const [layoutHitAreas, setLayoutHitAreas] = useState<{ id: string; x: number; y: number; width: number; height: number }[]>([])

  const selectedLayout = selectedLayoutId ? layouts.find(t => t.id === selectedLayoutId) : null

  useEffect(() => {
    if (!storage || !gameId) return
    loadData(storage)
  }, [storage, gameId])

  // Layout preview
  useEffect(() => {
    if (!selectedLayout) { setLayoutPreview(''); return }
    const updatePreview = async () => {
      const { renderLayoutSvg, computeLayout, embedFontsInSvg, embedImagesInSvg } = await import('../render')
      let svg = renderLayoutSvg(selectedLayout, { showSections, showItems: showItemWires, selectedNodeId })
      svg = await embedFontsInSvg(svg, selectedLayout, gameId!)
      svg = await embedImagesInSvg(svg)
      const layout = computeLayout(selectedLayout)
      const areas = [
        ...Array.from(layout.sections.entries()).map(([id, r]: [string, any]) => ({ id, ...r })),
        ...Array.from(layout.items.entries()).map(([id, r]: [string, any]) => ({ id, ...r })),
      ]
      setLayoutHitAreas(areas)
      const blob = new Blob([svg], { type: 'image/svg+xml' })
      const url = URL.createObjectURL(blob)
      setLayoutPreview(prev => { if (prev) URL.revokeObjectURL(prev); return url })
    }
    updatePreview()
  }, [selectedLayout, showSections, showItemWires, selectedNodeId])

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
        let svg = renderCardSvg(card, tpl)
        svg = await embedFontsInSvg(svg, tpl, gameId!)
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
    setSelectedCardId(null); setShowBigPreview(false)
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
      const [gameData, colList, tplList, fonts] = await Promise.all([
        s.getGame(gameId),
        s.listCollections(gameId),
        s.listLayouts(gameId),
        s.listFonts(gameId),
      ])
      setGame(gameData)
      setCollections(colList)
      setLayouts(tplList)
      setGameFonts(fonts)
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
        if (tpl.root?.id && !selectedNodeId) setSelectedNodeId(tpl.root.id)
      }
      const fontKeys = Object.keys(fonts)
      if (fontKeys.length > 0 && !selectedFont) {
        setSelectedFont(fontKeys[0])
      }

      setStatus('Ready.')
    } catch {
      setStatus('Error loading game.')
    }
  }

  const handleCreateCollection = async () => {
    if (!storage || !gameId || layouts.length === 0) return
    const name = `Collection ${collections.length + 1}`
    const optimistic = { id: `temp-${Date.now()}`, name, layoutId: layouts[0].id }
    setCollections(prev => [...prev, optimistic])
    setExpandedCollection(optimistic.id)
    try {
      const created = await storage.createCollection(gameId, name, layouts[0].id)
      setCollections(prev => prev.map(c => c.id === optimistic.id ? created : c))
      setExpandedCollection(created.id)
      if (gameId) localStorage.setItem(`game:${gameId}:selectedCollection`, created.id)
    } catch {
      setCollections(prev => prev.filter(c => c.id !== optimistic.id))
      setStatus('Error creating collection.')
    }
  }

  const handleCreateLayout = async () => {
    if (!storage || !gameId) return
    const name = `Layout ${layouts.length + 1}`
    const optimistic = { version: 2 as const, id: `temp-${Date.now()}`, name, width: 750, height: 1050, radius: 28, bleed: 18, fonts: {}, root: { id: 'root', name: 'Root', layout: 'stack' as const, sizePct: 100, gap: 0, children: [], items: [] } }
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

  const getNodeTypeKey = (id: string): string => {
    if (!selectedLayout?.root) return 'unknown'
    const kind = getNodeKind(selectedLayout.root, id)
    if (kind === 'section') return 'section'
    const item = findItemById(selectedLayout.root, id)
    return (item as any)?.type ?? 'text'
  }

  const handleNodeSelect = (id: string) => {
    if (selectedNodeId && selectedProperty) {
      const typeKey = getNodeTypeKey(selectedNodeId)
      setPropertyByType(prev => ({ ...prev, [typeKey]: selectedProperty }))
    }
    setSelectedNodeId(id)
    const newTypeKey = getNodeTypeKey(id)
    const defaults: Record<string, string> = { section: 'layout', text: 'fieldId', frame: 'fillColor', image: 'fieldId', emoji: 'emoji' }
    setSelectedProperty(propertyByType[newTypeKey] ?? defaults[newTypeKey] ?? 'name')
  }

  const handlePropertyChange = (property: string, value: unknown) => {
    if (!selectedLayout || !selectedNodeId) return
    const t = JSON.parse(JSON.stringify(selectedLayout))
    const kind = getNodeKind(t.root, selectedNodeId)
    if (!kind) return
    let node: any
    if (kind === 'section') {
      const findSection = (s: any): any => {
        if (s.id === selectedNodeId) return s
        for (const c of s.children) { const f = findSection(c); if (f) return f }
        return null
      }
      node = findSection(t.root)
    } else {
      const findItem = (s: any): any => {
        const item = s.items.find((i: any) => i.id === selectedNodeId)
        if (item) return item
        for (const c of s.children) { const f = findItem(c); if (f) return f }
        return null
      }
      node = findItem(t.root)
    }
    if (!node) return
    const TEMPLATE_KEYS = new Set(['width', 'height', 'radius', 'bleed'])
    if (TEMPLATE_KEYS.has(property)) {
      (t as any)[property] = value
    } else if (property === 'attachAnchor') {
      if (!node.attach) node.attach = { targetType: 'section', targetId: '', anchor: { x: 0, y: 0 } }
      node.attach.anchor = value
    } else if (property === 'attachTargetId') {
      if (!node.attach) node.attach = { targetType: 'section', targetId: '', anchor: { x: 0, y: 0 } }
      node.attach.targetId = value
      node.attach.targetType = getNodeKind(t.root, value as string) ?? 'section'
    } else {
      node[property] = value
    }
    handleLayoutSave(t)
  }

  const selectedKind = selectedNodeId && selectedLayout?.root ? getNodeKind(selectedLayout.root, selectedNodeId) : null
  const isRoot = selectedNodeId === selectedLayout?.root?.id

  const handleAddSection = () => {
    if (!selectedLayout) return
    const t = JSON.parse(JSON.stringify(selectedLayout))
    const parentId = selectedKind === 'section' && selectedNodeId ? selectedNodeId : t.root.id
    const parent = findSectionById(t.root, parentId)
    if (!parent) return
    const section = { id: crypto.randomUUID(), name: 'New Section', layout: 'stack' as const, sizePct: 100, gap: 0, children: [] as any[], items: [] as any[] }
    parent.children.push(section)
    handleLayoutSave(t)
    setSelectedNodeId(section.id)
  }

  const handleAddItem = (itemType: 'text' | 'frame' | 'image' | 'emoji') => {
    if (!selectedLayout) return
    const t = JSON.parse(JSON.stringify(selectedLayout))
    let parentId: string
    if (selectedKind === 'section' && selectedNodeId) parentId = selectedNodeId
    else if (selectedKind === 'item' && selectedNodeId) {
      const parent = findParentSection(t.root, selectedNodeId, 'item')
      parentId = parent?.id ?? t.root.id
    } else parentId = t.root.id
    const parent = findSectionById(t.root, parentId)
    if (!parent) return
    const base = { id: crypto.randomUUID(), anchor: { x: 0.5, y: 0.5 }, attach: { targetType: 'section', targetId: parentId, anchor: { x: 0.5, y: 0.5 } }, widthPct: 100, heightPct: 100 }
    const items: Record<string, any> = {
      text: { ...base, type: 'text', name: 'New Text', fieldId: 'field', fontSize: 20, align: 'left', anchor: { x: 0, y: 0 }, attach: { ...base.attach, anchor: { x: 0, y: 0 } } },
      frame: { ...base, type: 'frame', name: 'New Frame', strokeWidth: 2, cornerRadius: 8 },
      image: { ...base, type: 'image', name: 'New Image', fieldId: 'image', fit: 'cover', cornerRadius: 0 },
      emoji: { ...base, type: 'emoji', name: 'Emoji', emoji: '⭐', fontSize: 32 },
    }
    const item = items[itemType]
    if (selectedKind === 'item' && selectedNodeId) {
      const loc = findNodeLocation(t.root, selectedNodeId, 'item')
      if (loc) loc.list.splice(loc.index + 1, 0, item)
      else parent.items.push(item)
    } else parent.items.push(item)
    handleLayoutSave(t)
    setSelectedNodeId(item.id)
  }

  const handleDeleteNode = () => {
    if (!selectedNodeId || !selectedKind || isRoot || !selectedLayout) return
    const t = JSON.parse(JSON.stringify(selectedLayout))
    const loc = findNodeLocation(t.root, selectedNodeId, selectedKind)
    if (!loc) return
    loc.list.splice(loc.index, 1)
    handleLayoutSave(t)
    setSelectedNodeId(null)
  }

  if (!game) {
    return (
      <div className="flex h-screen items-center justify-center">
        <p className="text-muted-foreground">{status}</p>
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
    >
        <Tabs defaultValue={localStorage.getItem(`game:${gameId}:tab`) || 'collections'} onValueChange={(v) => localStorage.setItem(`game:${gameId}:tab`, v)} className="w-full">
          <TabsList className="mb-4">
            <TabsTrigger value="collections">Collections</TabsTrigger>
            <TabsTrigger value="layouts">Layouts</TabsTrigger>
            <TabsTrigger value="fonts">Fonts</TabsTrigger>
          </TabsList>

          <TabsContent value="collections">
            <div className="grid grid-cols-1 md:grid-cols-[320px_1fr] gap-4 items-start">
            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0">
                <CardTitle className="text-base">Collections</CardTitle>
                <Button size="sm" variant="ghost" onClick={handleCreateCollection} disabled={layouts.length === 0} title="New collection">
                  <Plus className="h-4 w-4" />
                </Button>
              </CardHeader>
              <CardContent className="space-y-2 overflow-y-auto max-h-[60vh]">
                {collections.map((col) => (
                  <ListItem
                    key={col.id}
                    selected={expandedCollection === col.id}
                    onClick={() => {
                      const next = expandedCollection === col.id ? null : col.id
                      setExpandedCollection(next)
                      if (gameId) { if (next) localStorage.setItem(`game:${gameId}:selectedCollection`, next); else localStorage.removeItem(`game:${gameId}:selectedCollection`) }
                    }}
                    actions={<>
                      <Button size="sm" variant="outline" onClick={() => navigate(`/game/${gameId}/collection/${col.id}`)} title="Edit">
                        <Pencil className="h-4 w-4" />
                      </Button>
                      <Button size="sm" variant="outline" onClick={() => navigate(`/game/${gameId}/collection/${col.id}/print`)} title="Print">
                        <Printer className="h-4 w-4" />
                      </Button>
                      <select
                        className="rounded-md border bg-background px-2 py-1 text-sm"
                        value={col.layoutId}
                        onChange={async (e) => {
                          try {
                            await storage.updateCollection(gameId, col.id, { layoutId: e.target.value })
                            await loadData(storage)
                          } catch {
                            setStatus('Error updating collection.')
                          }
                        }}
                      >
                        {layouts.map((t) => (
                          <option key={t.id} value={t.id}>{t.name}</option>
                        ))}
                      </select>
                      <ConfirmButton onConfirm={async () => {
                        const prev = collections
                        setCollections(collections.filter((c) => c.id !== col.id))
                        setExpandedCollection(null)
                        try { await storage.deleteCollection(gameId, col.id) }
                        catch { setCollections(prev); setStatus('Error deleting collection.') }
                      }} />
                    </>}
                  >
                    <span className="font-medium">{col.name}</span>
                    <span className="ml-2 text-xs text-muted-foreground">
                      {layouts.find((t) => t.id === col.layoutId)?.name ?? col.layoutId}
                    </span>
                  </ListItem>
                ))}
                {collections.length === 0 && (
                  <p className="text-sm text-muted-foreground">No collections yet.</p>
                )}
              </CardContent>
            </Card>
            <div className="space-y-4 min-w-0">
              {showBigPreview && selectedCardId && expandedCollection ? (
                <div className="space-y-3">
                  <div className="flex items-center gap-2">
                    <Button size="sm" variant="ghost" onClick={() => setShowBigPreview(false)}>
                      <X className="h-4 w-4" />
                    </Button>
                    <div className="flex items-center gap-1">
                      <button
                        className="rounded p-1 text-muted-foreground hover:text-foreground transition-colors"
                        title="Copy"
                        onClick={async () => {
                          const card = collectionCards.find(c => c.id === selectedCardId)
                          if (!card) return
                          const optimistic = { ...card, id: `temp-${Date.now()}`, name: `New Card ${collectionCards.length + 1}` }
                          setCollectionCards(prev => [...prev, optimistic])
                          try {
                            const copy = await storage.copyCard(gameId, expandedCollection, selectedCardId)
                            setCollectionCards(prev => prev.map(c => c.id === optimistic.id ? copy : c))
                          } catch { setCollectionCards(prev => prev.filter(c => c.id !== optimistic.id)); setStatus('Error copying card.') }
                        }}
                      >
                        <Copy className="h-4 w-4" />
                      </button>
                      <button
                        className="rounded p-1 text-muted-foreground hover:text-foreground transition-colors"
                        title="Edit"
                        onClick={() => {
                          if (gameId && expandedCollection) {
                            if (selectedCardId) localStorage.setItem(`editor:${gameId}:${expandedCollection}:selectedCard`, selectedCardId)
                            localStorage.setItem(`editor:${gameId}:tab`, 'cards')
                          }
                          navigate(`/game/${gameId}/collection/${expandedCollection}`)
                        }}
                      >
                        <Pencil className="h-4 w-4" />
                      </button>
                      <ConfirmButton
                        iconOnly
                        onConfirm={async () => {
                          const prev = collectionCards
                          const prevId = selectedCardId
                          const updated = collectionCards.filter(c => c.id !== selectedCardId)
                          setCollectionCards(updated)
                          if (updated.length > 0) setSelectedCardId(updated[0].id)
                          else { setSelectedCardId(null); setShowBigPreview(false) }
                          try {
                            await storage.deleteCard(gameId, expandedCollection, prevId)
                          } catch { setCollectionCards(prev); setSelectedCardId(prevId); setStatus('Error deleting card.') }
                        }}
                      />
                    </div>
                    <span className="text-sm font-medium">{collectionCards.find(c => c.id === selectedCardId)?.name}</span>
                    <span className="text-xs text-muted-foreground">
                      {collectionCards.findIndex(c => c.id === selectedCardId) + 1} / {collectionCards.length}
                    </span>
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      className="rounded-full border p-2 text-muted-foreground hover:text-foreground disabled:opacity-30 transition-colors"
                      disabled={collectionCards.findIndex(c => c.id === selectedCardId) === 0}
                      onClick={() => {
                        const idx = collectionCards.findIndex(c => c.id === selectedCardId)
                        if (idx > 0) setSelectedCardId(collectionCards[idx - 1].id)
                      }}
                    >
                      <ChevronLeft className="h-5 w-5" />
                    </button>
                    <div className="flex-1 rounded-lg border bg-card p-4 flex justify-center">
                      <LoadingImg
                        src={selectedCardId ? cardPreviews[selectedCardId] || '' : ''}
                        alt="Card preview"
                        className="max-w-full max-h-[60vh]"
                      />
                    </div>
                    <button
                      className="rounded-full border p-2 text-muted-foreground hover:text-foreground disabled:opacity-30 transition-colors"
                      disabled={collectionCards.findIndex(c => c.id === selectedCardId) === collectionCards.length - 1}
                      onClick={() => {
                        const idx = collectionCards.findIndex(c => c.id === selectedCardId)
                        if (idx < collectionCards.length - 1) setSelectedCardId(collectionCards[idx + 1].id)
                      }}
                    >
                      <ChevronRight className="h-5 w-5" />
                    </button>
                  </div>
                  <div className="flex gap-2 overflow-x-auto p-1 min-w-0 max-w-full">
                    {collectionCards.map((card) => (
                      <button
                        key={card.id}
                        ref={(el) => { if (el) carouselRefs.current.set(card.id, el); else carouselRefs.current.delete(card.id) }}
                        className={`flex-shrink-0 rounded-md border overflow-hidden w-16 transition-all ${
                          selectedCardId === card.id ? 'ring-2 ring-inset ring-primary' : 'opacity-60 hover:opacity-100'
                        }`}
                        onClick={() => setSelectedCardId(card.id)}
                      >
                        <LoadingImg
                          src={cardPreviews[card.id] || ''}
                          alt={card.name}
                          className="w-full"
                        />
                      </button>
                    ))}
                  </div>
                </div>
              ) : expandedCollection && collectionCards.length > 0 ? (
                <div className="rounded-lg border bg-card overflow-y-auto max-h-[70vh]">
                  <div className="flex items-center gap-1 p-2 border-b sticky top-0 bg-card z-10">
                    <button
                      className="rounded p-1 text-muted-foreground hover:text-foreground transition-colors"
                      title="View"
                      onClick={() => {
                        if (!selectedCardId && collectionCards.length > 0) setSelectedCardId(collectionCards[0].id)
                        setShowBigPreview(true)
                      }}
                    >
                      <Eye className="h-4 w-4" />
                    </button>
                    {selectedCardId && (
                      <>
                        <button className="rounded p-1 text-muted-foreground hover:text-foreground transition-colors" title="Copy"
                          onClick={async () => {
                            const card = collectionCards.find(c => c.id === selectedCardId)
                            if (!card) return
                            const opt = { ...card, id: `temp-${Date.now()}`, name: `New Card ${collectionCards.length + 1}` }
                            setCollectionCards(prev => [...prev, opt])
                            try { const copy = await storage.copyCard(gameId, expandedCollection, selectedCardId); setCollectionCards(prev => prev.map(c => c.id === opt.id ? copy : c)) }
                            catch { setCollectionCards(prev => prev.filter(c => c.id !== opt.id)); setStatus('Error copying card.') }
                          }}>
                          <Copy className="h-4 w-4" />
                        </button>
                        <button className="rounded p-1 text-muted-foreground hover:text-foreground transition-colors" title="Edit"
                          onClick={() => { if (gameId && expandedCollection) { if (selectedCardId) localStorage.setItem(`editor:${gameId}:${expandedCollection}:selectedCard`, selectedCardId); localStorage.setItem(`editor:${gameId}:tab`, 'cards') }; navigate(`/game/${gameId}/collection/${expandedCollection}`) }}>
                          <Pencil className="h-4 w-4" />
                        </button>
                        <ConfirmButton iconOnly onConfirm={async () => {
                          const prev = collectionCards; const prevId = selectedCardId
                          setCollectionCards(collectionCards.filter(c => c.id !== selectedCardId)); setSelectedCardId(null)
                          try { await storage.deleteCard(gameId, expandedCollection, prevId) }
                          catch { setCollectionCards(prev); setSelectedCardId(prevId); setStatus('Error deleting card.') }
                        }} />
                      </>
                    )}
                    <div className="ml-auto flex items-center gap-1">
                      <button className="rounded p-1 text-muted-foreground hover:text-foreground disabled:opacity-30" disabled={galleryCols <= 1}
                        onClick={() => setGalleryCols(c => { const v = Math.max(1, c - 1); localStorage.setItem('galleryCols', String(v)); return v })} title="Larger cards">
                        <Minus className="h-4 w-4" />
                      </button>
                      <span className="text-xs text-muted-foreground w-6 text-center">{galleryCols}</span>
                      <button className="rounded p-1 text-muted-foreground hover:text-foreground disabled:opacity-30" disabled={galleryCols >= 8}
                        onClick={() => setGalleryCols(c => { const v = Math.min(8, c + 1); localStorage.setItem('galleryCols', String(v)); return v })} title="Smaller cards">
                        <Plus className="h-4 w-4" />
                      </button>
                    </div>
                  </div>
                  <div className="grid gap-3 p-4" style={{ gridTemplateColumns: `repeat(${galleryCols}, minmax(0, 1fr))` }}>
                    {collectionCards.map((card) => (
                      <div key={card.id}
                        className={`relative rounded-md cursor-pointer transition-all ${selectedCardId === card.id ? 'outline outline-2 outline-primary' : 'outline outline-1 outline-border'}`}
                        onClick={() => setSelectedCardId(selectedCardId === card.id ? null : card.id)}>
                        <div className="rounded-t-md overflow-hidden" style={{ aspectRatio: '5 / 7' }}>
                          <LoadingImg src={cardPreviews[card.id] || ''} alt={card.name} className="w-full h-full" wrapperClassName="w-full h-full" />
                        </div>
                        <p className="px-2 py-1 text-xs text-center text-muted-foreground truncate">{card.name}</p>
                      </div>
                    ))}
                  </div>
                </div>
              ) : (
                <div className="flex items-center justify-center rounded-lg border bg-card p-8">
                  <p className="text-sm text-muted-foreground">{expandedCollection ? 'No cards in this collection.' : 'Select a collection to preview cards.'}</p>
                </div>
              )}
            </div>
            </div>
          </TabsContent>

          <TabsContent value="layouts">
            <div className="grid grid-cols-1 md:grid-cols-[320px_1fr_1fr] gap-4 items-start">
              <Card>
                <CardHeader className="flex flex-row items-center justify-between space-y-0">
                  <CardTitle className="text-base">Layouts</CardTitle>
                  <Button size="sm" variant="ghost" onClick={handleCreateLayout} title="New layout">
                    <Plus className="h-4 w-4" />
                  </Button>
                </CardHeader>
                <CardContent className="space-y-2 overflow-y-auto max-h-[60vh]">
                  {layouts.map((tpl) => (
                    <ListItem
                      key={tpl.id}
                      selected={selectedLayoutId === tpl.id}
                      onClick={() => {
                        const next = selectedLayoutId === tpl.id ? null : tpl.id
                        setSelectedLayoutId(next)
                        setSelectedNodeId(next ? tpl.root?.id ?? null : null)
                        if (gameId) { if (next) localStorage.setItem(`game:${gameId}:selectedLayout`, next); else localStorage.removeItem(`game:${gameId}:selectedLayout`) }
                      }}
                      actions={<>
                        <Button size="sm" variant="outline" onClick={async () => {
                          const opt = { ...tpl, id: `temp-${Date.now()}`, name: `Layout ${layouts.length + 1}` }
                          setLayouts(prev => [...prev, opt])
                          try {
                            const copy = await storage.copyLayout(gameId, tpl.id)
                            setLayouts(prev => prev.map(t => t.id === opt.id ? copy : t))
                          } catch { setLayouts(prev => prev.filter(t => t.id !== opt.id)); setStatus('Error copying layout.') }
                        }}>
                          <Copy className="h-4 w-4" />
                        </Button>
                        <ConfirmButton onConfirm={async () => {
                          const prev = layouts
                          setLayouts(layouts.filter((t) => t.id !== tpl.id))
                          if (selectedLayoutId === tpl.id) setSelectedLayoutId(null)
                          try { await storage.deleteLayout(gameId, tpl.id) }
                          catch (err: any) { setLayouts(prev); setStatus(err.message || 'Error deleting layout.') }
                        }} />
                      </>}
                    >
                      <span className="font-medium">{tpl.name}</span>
                      <span className="ml-2 text-xs text-muted-foreground">{tpl.width}×{tpl.height}</span>
                    </ListItem>
                  ))}
                  {layouts.length === 0 && (
                    <p className="text-sm text-muted-foreground">No layouts yet.</p>
                  )}
                </CardContent>
              </Card>

              {selectedLayout?.root ? (
                <>
                  <div className="space-y-4">
                    <div className="overflow-y-auto max-h-[60vh] rounded-lg border bg-card overflow-hidden">
                      <NodeTree
                        root={selectedLayout.root}
                        selectedNodeId={selectedNodeId}
                        onSelectNode={handleNodeSelect}
                        onDrop={(dragId, dragKind, dropTargetId, position) => {
                          const t = JSON.parse(JSON.stringify(selectedLayout))
                          if (moveNode(t.root, dragId, dragKind, dropTargetId, position)) {
                            handleLayoutSave(t)
                          }
                        }}
                        onAddSection={handleAddSection}
                        onAddItem={handleAddItem}
                        onDelete={handleDeleteNode}
                        canAddSection={!selectedKind || selectedKind === 'section'}
                        canAddItem={!selectedKind || selectedKind === 'section'}
                        canDelete={!!selectedNodeId && !isRoot}
                      />
                    </div>
                    {selectedNodeId && (
                      <Card>
                        <CardContent className="pt-4">
                          <PropertyPanel
                            layout={selectedLayout}
                            selectedNodeId={selectedNodeId}
                            selectedProperty={selectedProperty}
                            onSelectProperty={(prop) => {
                              setSelectedProperty(prop)
                              if (selectedNodeId) {
                                const typeKey = getNodeTypeKey(selectedNodeId)
                                setPropertyByType(prev => ({ ...prev, [typeKey]: prop }))
                              }
                            }}
                            onPropertyChange={handlePropertyChange}
                          />
                        </CardContent>
                      </Card>
                    )}
                  </div>
                  {layoutPreview && (
                    <ZoomablePreview
                      src={layoutPreview}
                      alt="Layout preview"
                      svgWidth={selectedLayout.width}
                      svgHeight={selectedLayout.height}
                      hitAreas={layoutHitAreas}
                      selectedHitAreaId={selectedNodeId}
                      onHitAreaClick={handleNodeSelect}
                      extraButtons={<>
                        <button
                          onClick={() => setShowSections(s => !s)}
                          className={`rounded p-1 transition-colors ${showSections ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:text-foreground'}`}
                          title={showSections ? 'Hide sections' : 'Show sections'}
                        >
                          <LayoutGrid className="h-4 w-4" />
                        </button>
                        <button
                          onClick={() => setShowItemWires(s => !s)}
                          className={`rounded p-1 transition-colors ${showItemWires ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:text-foreground'}`}
                          title={showItemWires ? 'Hide items' : 'Show items'}
                        >
                          <Layers className="h-4 w-4" />
                        </button>
                      </>}
                    />
                  )}
                </>
              ) : (
                <div className="md:col-span-2 flex items-center justify-center rounded-lg border bg-card p-8">
                  <p className="text-sm text-muted-foreground">Select a layout to edit</p>
                </div>
              )}
            </div>
          </TabsContent>

          <TabsContent value="fonts">
            <div className="grid grid-cols-1 md:grid-cols-[320px_1fr_1fr] gap-4 items-start">
              <Card>
                <CardHeader className="flex flex-row items-center justify-between space-y-0">
                  <CardTitle className="text-base">Fonts</CardTitle>
                  <Button size="sm" variant="ghost" onClick={() => setShowFontAdd(v => !v)} title="Add font">
                    <Plus className="h-4 w-4" />
                  </Button>
                </CardHeader>
                <CardContent>
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
                </CardContent>
              </Card>

              <FontPreviewEditor previewText={fontPreviewText} onChangePreviewText={setFontPreviewText} />

              <FontPreview fonts={gameFonts} selectedFont={selectedFont} previewText={fontPreviewText} />
            </div>
          </TabsContent>
        </Tabs>
    </PageLayout>
  )
}
