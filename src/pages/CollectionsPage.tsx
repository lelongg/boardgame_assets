import { useState, useEffect, useRef } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { ArrowLeft, Eye, Pencil, ChevronLeft, ChevronRight, X, Copy, Minus, Plus, LayoutGrid, Layers } from 'lucide-react'
import { createStorage } from '../storage'
import ConfirmButton from '@/components/ConfirmButton'
import NodeTree from '@/components/layout/NodeTree'
import PropertyPanel from '@/components/layout/PropertyPanel'
import ZoomablePreview from '@/components/ZoomablePreview'
import { getNodeKind, moveNode, findSectionById, findNodeLocation, findParentSection, findItemById } from '@/components/layout/templateHelpers'

export default function CollectionsPage() {
  const { gameId } = useParams<{ gameId: string }>()
  const navigate = useNavigate()
  const [storage, setStorage] = useState<any>(null)
  const [game, setGame] = useState<any>(null)
  const [collections, setCollections] = useState<any[]>([])
  const [templates, setTemplates] = useState<any[]>([])
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
  const [selectedTemplateId, setSelectedTemplateId] = useState<string | null>(() => {
    try { return localStorage.getItem(`game:${gameId}:selectedTemplate`) } catch { return null }
  })
  const [status, setStatus] = useState('Loading...')
  const [showSections, setShowSections] = useState(true)
  const [showItemWires, setShowItemWires] = useState(true)
  const [editingName, setEditingName] = useState(false)

  // Layout editor state
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null)
  const [selectedProperty, setSelectedProperty] = useState<string | null>(null)
  const [propertyByType, setPropertyByType] = useState<Record<string, string>>({})
  const [templatePreview, setTemplatePreview] = useState<string>('')
  const [templateHitAreas, setTemplateHitAreas] = useState<{ id: string; x: number; y: number; width: number; height: number }[]>([])

  const selectedTemplate = selectedTemplateId ? templates.find(t => t.id === selectedTemplateId) : null

  useEffect(() => {
    const init = async () => {
      const s = await createStorage()
      setStorage(s)
      await loadData(s)
    }
    init()
  }, [gameId])

  // Template preview
  useEffect(() => {
    if (!selectedTemplate) { setTemplatePreview(''); return }
    const updatePreview = async () => {
      const { renderTemplateSvg, computeLayout } = await import('../render')
      let svg = renderTemplateSvg(selectedTemplate, { showSections, showItems: showItemWires, selectedNodeId })
      // Embed images as base64 data URIs since blob SVGs can't fetch external URLs
      const imgMatches = svg.match(/href="(\/api\/[^"]+)"/g) || []
      for (const match of imgMatches) {
        const url = match.slice(6, -1)
        try {
          const resp = await fetch(url)
          if (resp.ok) {
            const blob = await resp.blob()
            const b64 = await new Promise<string>(resolve => {
              const reader = new FileReader()
              reader.onload = () => resolve(reader.result as string)
              reader.readAsDataURL(blob)
            })
            svg = svg.replace(`href="${url}"`, `href="${b64}"`)
          }
        } catch { /* skip */ }
      }
      const layout = computeLayout(selectedTemplate)
      const areas = [
        ...Array.from(layout.sections.entries()).map(([id, r]: [string, any]) => ({ id, ...r })),
        ...Array.from(layout.items.entries()).map(([id, r]: [string, any]) => ({ id, ...r })),
      ]
      setTemplateHitAreas(areas)
      const blob = new Blob([svg], { type: 'image/svg+xml' })
      const url = URL.createObjectURL(blob)
      setTemplatePreview(prev => { if (prev) URL.revokeObjectURL(prev); return url })
    }
    updatePreview()
  }, [selectedTemplate, showSections, showItemWires, selectedNodeId])

  // Render card previews client-side
  useEffect(() => {
    if (!collectionCards.length || !expandedCollection || !templates.length) { setCardPreviews({}); return }
    const col = collections.find(c => c.id === expandedCollection)
    const tpl = col ? templates.find(t => t.id === col.templateId) : null
    if (!tpl) { setCardPreviews({}); return }
    let cancelled = false
    const renderAll = async () => {
      const { renderCardSvg } = await import('../render')
      const previews: Record<string, string> = {}
      for (const card of collectionCards) {
        if (cancelled) return
        let svg = renderCardSvg(card, tpl)
        // Embed images as base64
        const matches = svg.match(/href="((?:\/api\/|data:)[^"]+)"/g) || []
        for (const m of matches) {
          const url = m.slice(6, -1)
          if (url.startsWith('data:')) continue
          try {
            const resp = await fetch(url)
            if (resp.ok) {
              const blob = await resp.blob()
              const b64 = await new Promise<string>(r => { const reader = new FileReader(); reader.onload = () => r(reader.result as string); reader.readAsDataURL(blob) })
              svg = svg.replace(`href="${url}"`, `href="${b64}"`)
            }
          } catch { /* skip */ }
        }
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
  }, [collectionCards, collections, templates, expandedCollection])

  // Load cards when a collection is selected
  useEffect(() => {
    if (!expandedCollection || !storage || !gameId) { setCollectionCards([]); setSelectedCardId(null); return; }
    setSelectedCardId(null); setShowBigPreview(false)
    storage.listCards(gameId, expandedCollection).then(setCollectionCards).catch(() => setCollectionCards([]))
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
      const [gameData, colList, tplList] = await Promise.all([
        s.getGame(gameId),
        s.listCollections(gameId),
        s.listTemplates(gameId),
      ])
      setGame(gameData)
      setCollections(colList)
      setTemplates(tplList)
      setCardPreviews({})
      setStatus('Ready.')
    } catch {
      setStatus('Error loading game.')
    }
  }

  const handleCreateCollection = async () => {
    if (!storage || !gameId || templates.length === 0) return
    try {
      const name = `Collection ${collections.length + 1}`
      const created = await storage.createCollection(gameId, name, templates[0].id)
      setCollections([...collections, created])
      setExpandedCollection(created.id)
      if (gameId) localStorage.setItem(`game:${gameId}:selectedCollection`, created.id)
    } catch {
      setStatus('Error creating collection.')
    }
  }

  const handleCreateTemplate = async () => {
    if (!storage || !gameId) return
    try {
      const name = `Template ${templates.length + 1}`
      const created = await storage.createTemplate(gameId, name)
      setTemplates([...templates, created])
      setSelectedTemplateId(created.id)
      if (gameId) localStorage.setItem(`game:${gameId}:selectedTemplate`, created.id)
    } catch {
      setStatus('Error creating template.')
    }
  }

  // --- Layout editor handlers ---

  const handleTemplateSave = async (updatedTemplate: any) => {
    if (!gameId || !selectedTemplateId || !storage) return
    try {
      await storage.saveTemplate(gameId, selectedTemplateId, updatedTemplate)
      setTemplates(prev => prev.map(t => t.id === selectedTemplateId ? updatedTemplate : t))
      setStatus('Template saved.')
    } catch {
      setStatus('Error saving template.')
    }
  }

  const getNodeTypeKey = (id: string): string => {
    if (!selectedTemplate?.root) return 'unknown'
    const kind = getNodeKind(selectedTemplate.root, id)
    if (kind === 'section') return 'section'
    const item = findItemById(selectedTemplate.root, id)
    return (item as any)?.type ?? 'text'
  }

  const handleNodeSelect = (id: string) => {
    if (selectedNodeId && selectedProperty) {
      const typeKey = getNodeTypeKey(selectedNodeId)
      setPropertyByType(prev => ({ ...prev, [typeKey]: selectedProperty }))
    }
    setSelectedNodeId(id)
    const newTypeKey = getNodeTypeKey(id)
    const defaults: Record<string, string> = { section: 'layout', text: 'fieldId', frame: 'fillColor', image: 'fieldId' }
    setSelectedProperty(propertyByType[newTypeKey] ?? defaults[newTypeKey] ?? 'name')
  }

  const handlePropertyChange = (property: string, value: unknown) => {
    if (!selectedTemplate || !selectedNodeId) return
    const t = JSON.parse(JSON.stringify(selectedTemplate))
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
    if (property === 'attachAnchor') {
      if (!node.attach) node.attach = { targetType: 'section', targetId: '', anchor: { x: 0, y: 0 } }
      node.attach.anchor = value
    } else if (property === 'attachTargetId') {
      if (!node.attach) node.attach = { targetType: 'section', targetId: '', anchor: { x: 0, y: 0 } }
      node.attach.targetId = value
      node.attach.targetType = getNodeKind(t.root, value as string) ?? 'section'
    } else {
      node[property] = value
    }
    handleTemplateSave(t)
  }

  const selectedKind = selectedNodeId && selectedTemplate?.root ? getNodeKind(selectedTemplate.root, selectedNodeId) : null
  const isRoot = selectedNodeId === selectedTemplate?.root?.id

  const handleAddSection = () => {
    if (!selectedTemplate) return
    const t = JSON.parse(JSON.stringify(selectedTemplate))
    const parentId = selectedKind === 'section' && selectedNodeId ? selectedNodeId : t.root.id
    const parent = findSectionById(t.root, parentId)
    if (!parent) return
    const section = { id: crypto.randomUUID(), name: 'New Section', layout: 'stack' as const, sizePct: 100, gap: 0, children: [] as any[], items: [] as any[] }
    parent.children.push(section)
    handleTemplateSave(t)
    setSelectedNodeId(section.id)
  }

  const handleAddItem = (itemType: 'text' | 'frame' | 'image') => {
    if (!selectedTemplate) return
    const t = JSON.parse(JSON.stringify(selectedTemplate))
    let parentId: string
    if (selectedKind === 'section' && selectedNodeId) parentId = selectedNodeId
    else if (selectedKind === 'item' && selectedNodeId) {
      const parent = findParentSection(t.root, selectedNodeId, 'item')
      parentId = parent?.id ?? t.root.id
    } else parentId = t.root.id
    const parent = findSectionById(t.root, parentId)
    if (!parent) return
    const base = { id: crypto.randomUUID(), anchor: { x: 0.5, y: 0.5 }, attach: { targetType: 'section', targetId: parentId, anchor: { x: 0.5, y: 0.5 } }, widthPct: 80, heightPct: 20 }
    const items: Record<string, any> = {
      text: { ...base, type: 'text', name: 'New Text', fieldId: 'field', fontSize: 20, align: 'left', anchor: { x: 0, y: 0 }, attach: { ...base.attach, anchor: { x: 0, y: 0 } } },
      frame: { ...base, type: 'frame', name: 'New Frame', heightPct: 90, widthPct: 90, strokeWidth: 2, cornerRadius: 8 },
      image: { ...base, type: 'image', name: 'New Image', fieldId: 'image', heightPct: 60, fit: 'cover', cornerRadius: 0 },
    }
    const item = items[itemType]
    if (selectedKind === 'item' && selectedNodeId) {
      const loc = findNodeLocation(t.root, selectedNodeId, 'item')
      if (loc) loc.list.splice(loc.index + 1, 0, item)
      else parent.items.push(item)
    } else parent.items.push(item)
    handleTemplateSave(t)
    setSelectedNodeId(item.id)
  }

  const handleDeleteNode = () => {
    if (!selectedNodeId || !selectedKind || isRoot || !selectedTemplate) return
    const t = JSON.parse(JSON.stringify(selectedTemplate))
    const loc = findNodeLocation(t.root, selectedNodeId, selectedKind)
    if (!loc) return
    loc.list.splice(loc.index, 1)
    handleTemplateSave(t)
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
    <div className="min-h-screen">
      <header className="border-b bg-background px-4 py-2 md:px-7">
        <div className="flex items-center gap-3">
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
          <div className="ml-auto text-sm text-muted-foreground">{status}</div>
        </div>
      </header>

      <main className="mx-auto max-w-7xl px-4 py-4 md:px-7 md:py-6">
        <Tabs defaultValue={localStorage.getItem(`game:${gameId}:tab`) || 'collections'} onValueChange={(v) => localStorage.setItem(`game:${gameId}:tab`, v)} className="w-full">
          <TabsList className="mb-4">
            <TabsTrigger value="collections">Collections</TabsTrigger>
            <TabsTrigger value="templates">Templates</TabsTrigger>
          </TabsList>

          <TabsContent value="collections">
            <div className="grid grid-cols-1 md:grid-cols-[1fr_2fr] gap-4 items-start">
            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0">
                <CardTitle className="text-base">Collections</CardTitle>
                <Button size="sm" onClick={handleCreateCollection} disabled={templates.length === 0}>
                  New
                </Button>
              </CardHeader>
              <CardContent className="space-y-2 overflow-y-auto max-h-[60vh]">
                {collections.map((col) => (
                  <div
                    key={col.id}
                    className={`rounded-lg border bg-card cursor-pointer ${expandedCollection === col.id ? 'ring-2 ring-inset ring-primary' : ''}`}
                    onClick={() => {
                      const next = expandedCollection === col.id ? null : col.id
                      setExpandedCollection(next)
                      if (gameId) { if (next) localStorage.setItem(`game:${gameId}:selectedCollection`, next); else localStorage.removeItem(`game:${gameId}:selectedCollection`) }
                    }}
                  >
                    <div className="px-3 py-2.5">
                      <span className="font-medium">{col.name}</span>
                      <span className="ml-2 text-xs text-muted-foreground">
                        {templates.find((t) => t.id === col.templateId)?.name ?? col.templateId}
                      </span>
                    </div>
                    {expandedCollection === col.id && (
                      <div className="flex gap-2 border-t px-3 py-2" onClick={(e) => e.stopPropagation()}>
                        <Button size="sm" onClick={() => navigate(`/game/${gameId}/collection/${col.id}`)}>
                          Edit
                        </Button>
                        <select
                          className="rounded-md border bg-background px-2 py-1 text-sm"
                          value={col.templateId}
                          onChange={async (e) => {
                            try {
                              await storage.updateCollection(gameId, col.id, { templateId: e.target.value })
                              await loadData(storage)
                            } catch {
                              setStatus('Error updating collection.')
                            }
                          }}
                        >
                          {templates.map((t) => (
                            <option key={t.id} value={t.id}>{t.name}</option>
                          ))}
                        </select>
                        <ConfirmButton onConfirm={async () => {
                          try {
                            await storage.deleteCollection(gameId, col.id)
                            setCollections(collections.filter((c) => c.id !== col.id))
                          } catch {
                            setStatus('Error deleting collection.')
                          }
                        }} />
                      </div>
                    )}
                  </div>
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
                          try {
                            await storage.copyCard(gameId, expandedCollection, selectedCardId)
                            storage.listCards(gameId, expandedCollection).then(setCollectionCards)
                            setStatus('Card copied.')
                          } catch { setStatus('Error copying card.') }
                        }}
                      >
                        <Copy className="h-4 w-4" />
                      </button>
                      <button
                        className="rounded p-1 text-muted-foreground hover:text-foreground transition-colors"
                        title="Edit"
                        onClick={() => {
                          if (selectedCardId && gameId && expandedCollection) localStorage.setItem(`editor:${gameId}:${expandedCollection}:selectedCard`, selectedCardId)
                          navigate(`/game/${gameId}/collection/${expandedCollection}`)
                        }}
                      >
                        <Pencil className="h-4 w-4" />
                      </button>
                      <ConfirmButton
                        iconOnly
                        onConfirm={async () => {
                          try {
                            await storage.deleteCard(gameId, expandedCollection, selectedCardId)
                            const updated = collectionCards.filter(c => c.id !== selectedCardId)
                            setCollectionCards(updated)
                            if (updated.length > 0) setSelectedCardId(updated[0].id)
                            else { setSelectedCardId(null); setShowBigPreview(false) }
                            setStatus('Card deleted.')
                          } catch { setStatus('Error deleting card.') }
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
                      <img
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
                        <img
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
                          onClick={async () => { try { await storage.copyCard(gameId, expandedCollection, selectedCardId); storage.listCards(gameId, expandedCollection).then(setCollectionCards); setStatus('Card copied.') } catch { setStatus('Error copying card.') } }}>
                          <Copy className="h-4 w-4" />
                        </button>
                        <button className="rounded p-1 text-muted-foreground hover:text-foreground transition-colors" title="Edit"
                          onClick={() => { if (selectedCardId && gameId && expandedCollection) localStorage.setItem(`editor:${gameId}:${expandedCollection}:selectedCard`, selectedCardId); navigate(`/game/${gameId}/collection/${expandedCollection}`) }}>
                          <Pencil className="h-4 w-4" />
                        </button>
                        <ConfirmButton iconOnly onConfirm={async () => { try { await storage.deleteCard(gameId, expandedCollection, selectedCardId); setCollectionCards(collectionCards.filter(c => c.id !== selectedCardId)); setSelectedCardId(null); setStatus('Card deleted.') } catch { setStatus('Error deleting card.') } }} />
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
                          <img src={cardPreviews[card.id] || ''} alt={card.name} className="w-full h-full" />
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

          <TabsContent value="templates">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 items-start">
              <Card>
                <CardHeader className="flex flex-row items-center justify-between space-y-0">
                  <CardTitle className="text-base">Templates</CardTitle>
                  <Button size="sm" onClick={handleCreateTemplate}>
                    New
                  </Button>
                </CardHeader>
                <CardContent className="space-y-2 overflow-y-auto max-h-[60vh]">
                  {templates.map((tpl) => (
                    <div
                      key={tpl.id}
                      className={`rounded-lg border bg-card cursor-pointer ${selectedTemplateId === tpl.id ? 'ring-2 ring-inset ring-primary' : ''}`}
                      onClick={() => {
                        const next = selectedTemplateId === tpl.id ? null : tpl.id
                        setSelectedTemplateId(next)
                        setSelectedNodeId(null)
                        if (gameId) { if (next) localStorage.setItem(`game:${gameId}:selectedTemplate`, next); else localStorage.removeItem(`game:${gameId}:selectedTemplate`) }
                      }}
                    >
                      <div className="px-3 py-2.5">
                        <span className="font-medium">{tpl.name}</span>
                        <span className="ml-2 text-xs text-muted-foreground">{tpl.width}×{tpl.height}</span>
                      </div>
                      {selectedTemplateId === tpl.id && (
                        <div className="flex gap-2 border-t px-3 py-2" onClick={(e) => e.stopPropagation()}>
                          <Button size="sm" variant="outline" onClick={async () => {
                            try {
                              const copy = await storage.copyTemplate(gameId, tpl.id)
                              setTemplates([...templates, copy])
                            } catch { setStatus('Error copying template.') }
                          }}>
                            <Copy className="h-4 w-4" />
                          </Button>
                          <ConfirmButton onConfirm={async () => {
                            try {
                              await storage.deleteTemplate(gameId, tpl.id)
                              setTemplates(templates.filter((t) => t.id !== tpl.id))
                              if (selectedTemplateId === tpl.id) setSelectedTemplateId(null)
                            } catch (err: any) {
                              setStatus(err.message || 'Error deleting template.')
                            }
                          }} />
                        </div>
                      )}
                    </div>
                  ))}
                  {templates.length === 0 && (
                    <p className="text-sm text-muted-foreground">No templates yet.</p>
                  )}
                </CardContent>
              </Card>

              {selectedTemplate?.root ? (
                <>
                  <div className="space-y-4">
                    <div className="overflow-y-auto max-h-[60vh] rounded-md border p-2">
                      <NodeTree
                        root={selectedTemplate.root}
                        selectedNodeId={selectedNodeId}
                        onSelectNode={handleNodeSelect}
                        onDrop={(dragId, dragKind, dropTargetId, position) => {
                          const t = JSON.parse(JSON.stringify(selectedTemplate))
                          if (moveNode(t.root, dragId, dragKind, dropTargetId, position)) {
                            handleTemplateSave(t)
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
                            template={selectedTemplate}
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
                  {templatePreview && (
                    <ZoomablePreview
                      src={templatePreview}
                      alt="Template preview"
                      svgWidth={selectedTemplate.width}
                      svgHeight={selectedTemplate.height}
                      hitAreas={templateHitAreas}
                      selectedHitAreaId={selectedNodeId}
                      onHitAreaClick={handleNodeSelect}
                      extraButtons={<>
                        <button
                          onClick={() => setShowSections(s => !s)}
                          className={`rounded-md border p-1.5 transition-colors ${showSections ? 'bg-primary text-primary-foreground border-primary' : 'bg-background/80 text-muted-foreground hover:text-foreground'}`}
                          title={showSections ? 'Hide sections' : 'Show sections'}
                        >
                          <LayoutGrid className="h-4 w-4" />
                        </button>
                        <button
                          onClick={() => setShowItemWires(s => !s)}
                          className={`rounded-md border p-1.5 transition-colors ${showItemWires ? 'bg-primary text-primary-foreground border-primary' : 'bg-background/80 text-muted-foreground hover:text-foreground'}`}
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
                  <p className="text-sm text-muted-foreground">Select a template to edit</p>
                </div>
              )}
            </div>
          </TabsContent>
        </Tabs>
      </main>
    </div>
  )
}
