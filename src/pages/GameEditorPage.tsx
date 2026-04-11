import { useState, useEffect } from 'react'
import { Upload, Download, ArrowLeft, Copy, Save, Plus, List, LayoutGrid, Printer } from 'lucide-react'
import { useParams, useNavigate } from 'react-router-dom'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import NodeTree from '@/components/layout/NodeTree'
import PropertyPanel from '@/components/layout/PropertyPanel'
import { getNodeKind, moveNode, findSectionById, findNodeLocation, findParentSection, findItemById } from '@/components/layout/layoutHelpers'
import { applyPropertyChange } from '@/components/layout/applyPropertyChange'
import { ValueItemEditor } from '@/components/layout/ControlPanel'
import ZoomablePreview from '@/components/ZoomablePreview'
import LayoutPreview from '@/components/LayoutPreview'
import ConfirmButton from '@/components/ConfirmButton'
import ListItem from '@/components/ListItem'
import PageLayout from '@/components/PageLayout'
import { cardsToCSV, csvToCards } from '../cardsCsv'
import useStorage from '../hooks/useStorage'
import FilesPanel from '@/components/FilesPanel'

export default function GameEditorPage() {
  const { gameId, collectionId } = useParams<{ gameId: string; collectionId: string }>()
  const navigate = useNavigate()
  const { storage, status, setStatus, setError, errorDetail, clearError } = useStorage()
  const [game, setGame] = useState<any>(null)
  const [collection, setCollection] = useState<any>(null)
  const [cards, setCards] = useState<any[]>([])
  const [selectedCard, setSelectedCard] = useState<any>(null)
  const [cardPreview, setCardPreview] = useState<string>('')
  const [editingName, setEditingName] = useState(false)
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null)
  const [selectedProperty, setSelectedProperty] = useState<string | null>(null)
  const [propertyByType, setPropertyByType] = useState<Record<string, string>>({})
  const [savedCardJson, setSavedCardJson] = useState('')
  const [gameFonts, setGameFonts] = useState<Record<string, { name: string; file: string }>>({})
  const [gameImages, setGameImages] = useState<{ file: string; url: string }[]>([])
  const [detailedView, setDetailedView] = useState(false)
  const [cardThumbnails, setCardThumbnails] = useState<Record<string, string>>({})
  const lsKey = (suffix: string) => `editor:${gameId}:${collectionId}:${suffix}`
  const loadSet = (suffix: string) => { try { const v = localStorage.getItem(lsKey(suffix)); return v ? new Set<string>(JSON.parse(v)) : new Set<string>() } catch { return new Set<string>() } }
  const [cardSelection, setCardSelection] = useState<Set<string>>(() => loadSet('cardSel'))
  const [importStaged, setImportStaged] = useState<{ name: string; fields: Record<string, string> }[]>([])
  const [importSelection, setImportSelection] = useState<Set<number>>(new Set())
  const [deleteMissing, setDeleteMissing] = useState(false)
  const [dataGallery, setDataGallery] = useState(false)
  const [dataThumbnails, setDataThumbnails] = useState<Record<string, string>>({})
  const [importThumbnails, setImportThumbnails] = useState<Record<number, string>>({})
  const isCardDirty = selectedCard && JSON.stringify(selectedCard) !== savedCardJson

  useEffect(() => { localStorage.setItem(lsKey('cardSel'), JSON.stringify([...cardSelection])) }, [cardSelection])

  useEffect(() => {
    if (!storage || !gameId) return
    loadGame(storage)
  }, [storage, gameId])

  useEffect(() => {
    if (!Object.keys(gameFonts).length || !gameId) return
    let cancelled = false
    const styleId = 'game-fonts-style'
    let style = document.getElementById(styleId) as HTMLStyleElement | null
    if (!style) { style = document.createElement('style'); style.id = styleId; document.head.appendChild(style) }
    const load = async () => {
      const rules: string[] = []
      for (const f of Object.values(gameFonts) as any[]) {
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

  useEffect(() => {
    if (!selectedCard || !game?.layout || !gameId) return
    const timer = setTimeout(async () => {
      try {
        const { renderCardSvg, embedFontsInSvg, embedImagesInSvg } = await import('../render')
        let svg = renderCardSvg(selectedCard, game.layout, { fonts: gameFonts })
        svg = await embedFontsInSvg(svg, gameId, gameFonts)
        svg = await embedImagesInSvg(svg)
        const blob = new Blob([svg], { type: 'image/svg+xml' })
        const blobUrl = URL.createObjectURL(blob)
        setCardPreview((prev) => { if (prev) URL.revokeObjectURL(prev); return blobUrl })
      } catch (error) {
        console.error('Error updating card preview:', error)
      }
    }, 300)
    return () => clearTimeout(timer)
  }, [selectedCard, game?.layout, gameId, collection?.back])

  // Generate thumbnails for detailed view
  useEffect(() => {
    if (!detailedView || !game?.layout || !gameId || cards.length === 0) return
    let cancelled = false
    ;(async () => {
      const { renderCardSvg } = await import('../render')
      const thumbs: Record<string, string> = {}
      for (const card of cards) {
        if (cancelled) return
        try {
          const svg = renderCardSvg(card, game.layout, { fonts: gameFonts })
          thumbs[card.id] = `data:image/svg+xml,${encodeURIComponent(svg)}`
        } catch { /* skip */ }
      }
      if (!cancelled) setCardThumbnails(thumbs)
    })()
    return () => { cancelled = true }
  }, [detailedView, cards, game?.layout, gameId])

  // Generate thumbnails for data tab (existing cards)
  useEffect(() => {
    if (!dataGallery || !game?.layout || !gameId || cards.length === 0) { setDataThumbnails({}); return }
    let cancelled = false
    ;(async () => {
      const { renderCardSvg } = await import('../render')
      const thumbs: Record<string, string> = {}
      for (const card of cards) {
        if (cancelled) return
        try {
          const svg = renderCardSvg(card, game.layout, { fonts: gameFonts })
          thumbs[card.id] = `data:image/svg+xml,${encodeURIComponent(svg)}`
        } catch { /* skip */ }
      }
      if (!cancelled) setDataThumbnails(thumbs)
    })()
    return () => { cancelled = true }
  }, [dataGallery, cards, game?.layout, gameId])

  // Generate thumbnails for import staged cards
  useEffect(() => {
    if (!dataGallery || !game?.layout || !gameId || importStaged.length === 0) { setImportThumbnails({}); return }
    let cancelled = false
    ;(async () => {
      const { renderCardSvg } = await import('../render')
      const thumbs: Record<number, string> = {}
      for (let i = 0; i < importStaged.length; i++) {
        if (cancelled) return
        try {
          const svg = renderCardSvg({ id: `import-${i}`, ...importStaged[i] } as any, game.layout, { fonts: gameFonts })
          thumbs[i] = `data:image/svg+xml,${encodeURIComponent(svg)}`
        } catch { /* skip */ }
      }
      if (!cancelled) setImportThumbnails(thumbs)
    })()
    return () => { cancelled = true }
  }, [dataGallery, importStaged, game?.layout, gameId])

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

  const selectCard = async (s: any, cardId: string) => {
    try {
      if (!gameId || !collectionId) return
      const cardData = await s.getCard(gameId, collectionId, cardId)
      setSavedCardJson(JSON.stringify(cardData))
      setSelectedCard(cardData)
      localStorage.setItem(`editor:${gameId}:${collectionId}:selectedCard`, cardId)
    } catch (error) {
      console.error('Error loading card:', error)
    }
  }

  const loadGame = async (s: any) => {
    try {
      if (!gameId || !collectionId) return
      setStatus('Loading...')
      const [gameData, col] = await Promise.all([
        s.getGame(gameId),
        s.getCollection(gameId, collectionId),
      ])
      setCollection(col)

      const [layout, fonts, images] = await Promise.all([
        s.getLayout(gameId, col.layoutId),
        s.listFonts(gameId),
        s.listImages?.(gameId).catch(() => []) ?? [],
      ])
      gameData.layout = layout
      setGame(gameData)
      setGameFonts(fonts)
      setGameImages(images)
      if (layout?.root?.id && !selectedNodeId) setSelectedNodeId(layout.root.id)

      const cardList = await s.listCards(gameId, collectionId)
      setCards(cardList)

      if (cardList.length > 0) {
        const savedCardId = localStorage.getItem(`editor:${gameId}:${collectionId}:selectedCard`)
        const cardToSelect = savedCardId && cardList.some((c: any) => c.id === savedCardId) ? savedCardId : cardList[0].id
        await selectCard(s, cardToSelect)
      }

      setStatus('Ready.')
    } catch (error) {
      setError('Error loading game', error)
    }
  }

  const handleSaveCard = async () => {
    try {
      if (!gameId || !collectionId || !selectedCard) return
      setStatus('Saving card...')
      await storage.saveCard(gameId, collectionId, selectedCard.id, selectedCard)
      setSavedCardJson(JSON.stringify(selectedCard))
      setStatus('Card saved.')
      await loadGame(storage)
    } catch (error) {
      setError('Error saving card', error)
    }
  }

  const handleCreateCard = async () => {
    if (!gameId || !collectionId) return
    const newCard = { id: crypto.randomUUID(), name: `New Card ${cards.length + 1}`, fields: {} }
    setCards(prev => [...prev, newCard as any])
    setSelectedCard(newCard)
    setSavedCardJson(JSON.stringify(newCard))
    try {
      await storage.saveCard(gameId, collectionId, newCard.id, newCard)
    } catch {
      setCards(prev => prev.filter(c => c.id !== newCard.id))
      setStatus('Error creating card.')
    }
  }

  const handleDeleteCard = async () => {
    if (!gameId || !collectionId || !selectedCard) return
    const prevCards = cards
    const prevCard = selectedCard
    const updatedCards = cards.filter(c => c.id !== selectedCard.id)
    setCards(updatedCards)
    if (updatedCards.length > 0) {
      await selectCard(storage, updatedCards[0].id)
    } else {
      setSelectedCard(null)
      setCardPreview('')
    }
    try {
      await storage.deleteCard(gameId, collectionId, prevCard.id)
    } catch {
      setCards(prevCards)
      setSelectedCard(prevCard)
      setStatus('Error deleting card.')
    }
  }

  const updateCardField = (field: string, value: any) => {
    setSelectedCard((prev: any) => ({ ...prev, [field]: value }))
  }

  // Layout handlers
  const handleLayoutSave = async (updatedLayout: any) => {
    if (!gameId || !game || !collection) return
    try {
      await storage.saveLayout(gameId, collection.layoutId, updatedLayout)
      setGame({ ...game, layout: updatedLayout })
    } catch { setStatus('Error saving layout.') }
  }

  const getNodeTypeKey = (id: string): string => {
    if (!game?.layout?.root) return 'unknown'
    const kind = getNodeKind(game.layout.root, id)
    if (kind === 'section') return 'section'
    const item = findItemById(game.layout.root, id)
    return (item as any)?.type ?? 'text'
  }

  const handleNodeSelect = (id: string) => {
    if (selectedNodeId && selectedProperty) {
      setPropertyByType(prev => ({ ...prev, [getNodeTypeKey(selectedNodeId)]: selectedProperty }))
    }
    setSelectedNodeId(id)
    const newTypeKey = getNodeTypeKey(id)
    const defaults: Record<string, string> = { section: 'layout', text: 'defaultValue', frame: 'fillColor', image: 'defaultValue', emoji: 'emoji' }
    setSelectedProperty(propertyByType[newTypeKey] ?? defaults[newTypeKey] ?? 'name')
  }

  const handlePropertyChange = (property: string, value: unknown) => {
    if (!game?.layout || !selectedNodeId) return
    const t = JSON.parse(JSON.stringify(game.layout))
    if (!applyPropertyChange(t, selectedNodeId, property, value)) return
    handleLayoutSave(t)
  }

  const selectedKind = selectedNodeId && game?.layout?.root ? getNodeKind(game.layout.root, selectedNodeId) : null
  const isRoot = selectedNodeId === game?.layout?.root?.id

  const handleAddSection = () => {
    if (!game?.layout) return
    const t = JSON.parse(JSON.stringify(game.layout))
    const section = { id: crypto.randomUUID(), name: 'New Section', layout: 'stack' as const, sizePct: 100, gap: 0, children: [] as any[], items: [] as any[] }
    if (selectedKind === 'section' && selectedNodeId) {
      const parent = findSectionById(t.root, selectedNodeId)
      if (!parent) return
      parent.children.push(section)
    } else if (selectedKind === 'item' && selectedNodeId) {
      const parent = findParentSection(t.root, selectedNodeId, 'item')
      if (!parent) return
      parent.children.push(section)
    } else {
      t.root.children.push(section)
    }
    handleLayoutSave(t)
    setSelectedNodeId(section.id)
  }

  const handleAddItem = (itemType: 'text' | 'frame' | 'image' | 'emoji' | 'copy') => {
    if (!game?.layout) return
    const t = JSON.parse(JSON.stringify(game.layout))
    let parentId: string
    if (selectedKind === 'section' && selectedNodeId) parentId = selectedNodeId
    else if (selectedKind === 'item' && selectedNodeId) { const p = findParentSection(t.root, selectedNodeId, 'item'); parentId = p?.id ?? t.root.id }
    else parentId = t.root.id
    const parent = findSectionById(t.root, parentId)
    if (!parent) return
    const base = { id: crypto.randomUUID(), anchor: { x: 0.5, y: 0.5 }, attach: { targetType: 'section', targetId: parentId, anchor: { x: 0.5, y: 0.5 } }, widthPct: 100, heightPct: 100 }
    const items: Record<string, any> = {
      text: { ...base, type: 'text', name: 'New Text', fontSize: 20, align: 'left', anchor: { x: 0, y: 0 }, attach: { ...base.attach, anchor: { x: 0, y: 0 } } },
      frame: { ...base, type: 'frame', name: 'New Frame', strokeWidth: 2, cornerRadius: 8 },
      image: { ...base, type: 'image', name: 'New Image', fit: 'cover', cornerRadius: 0 },
      emoji: { ...base, type: 'emoji', name: 'Emoji', emoji: '⭐', fontSize: 32 },
    }
    const item = items[itemType]
    if (selectedKind === 'item' && selectedNodeId) { const loc = findNodeLocation(t.root, selectedNodeId, 'item'); if (loc) loc.list.splice(loc.index + 1, 0, item); else parent.items.push(item) }
    else parent.items.push(item)
    handleLayoutSave(t)
    setSelectedNodeId(item.id)
  }

  const handleDeleteNode = () => {
    if (!selectedNodeId || !selectedKind || isRoot || !game?.layout) return
    const t = JSON.parse(JSON.stringify(game.layout))
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
                await storage.updateGame(gameId, { name })
                setGame({ ...game, name })
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
      </>}
      status={status}
      errorDetail={errorDetail}
      onDismissError={clearError}
    >
        <Tabs defaultValue={localStorage.getItem(`editor:${gameId}:tab`) || 'cards'} onValueChange={(v) => localStorage.setItem(`editor:${gameId}:tab`, v)} className="w-full">
          <TabsList className="mb-4">
            <TabsTrigger value="cards">Cards</TabsTrigger>
            <TabsTrigger value="layout">Layout</TabsTrigger>
            <TabsTrigger value="back">Back</TabsTrigger>
            <TabsTrigger value="data">Files</TabsTrigger>
          </TabsList>

          <TabsContent value="cards">
            <div className="grid grid-cols-1 md:grid-cols-[320px_1fr_1fr] gap-4 items-start">
              <Card>
                <CardHeader className="flex flex-row items-center justify-between space-y-0">
                  <CardTitle className="text-base">Cards</CardTitle>
                  <div className="flex items-center gap-1">
                    <Button size="sm" variant="ghost" onClick={() => setDetailedView(!detailedView)} title={detailedView ? 'Compact view' : 'Detailed view'}>
                      {detailedView ? <List className="h-4 w-4" /> : <LayoutGrid className="h-4 w-4" />}
                    </Button>
                    <Button size="sm" variant="ghost" onClick={handleCreateCard} title="New card">
                      <Plus className="h-4 w-4" />
                    </Button>
                  </div>
                </CardHeader>
                <CardContent className="space-y-2 overflow-y-auto max-h-[60vh]">
                  {cards.map((card) => (
                    <ListItem
                      key={card.id}
                      selected={selectedCard?.id === card.id}
                      onClick={() => selectCard(storage, card.id)}
                      actions={<>
                        <Button size="sm" variant="outline" onClick={handleSaveCard} disabled={!isCardDirty} title="Save">
                          <Save className="h-4 w-4" />
                        </Button>
                        <Button size="sm" variant="outline" onClick={async () => {
                          const opt = { ...card, id: `temp-${Date.now()}`, name: `New Card ${cards.length + 1}` }
                          setCards(prev => [...prev, opt])
                          setSelectedCard(opt)
                          setSavedCardJson(JSON.stringify(opt))
                          try {
                            const copy = await storage.copyCard(gameId, collectionId, card.id)
                            setCards(prev => prev.map(c => c.id === opt.id ? copy : c))
                            setSelectedCard(copy)
                            setSavedCardJson(JSON.stringify(copy))
                          } catch { setCards(prev => prev.filter(c => c.id !== opt.id)); setStatus('Error copying card.') }
                        }}>
                          <Copy className="h-4 w-4" />
                        </Button>
                        <ConfirmButton onConfirm={handleDeleteCard} />
                      </>}
                    >
                      <div className={detailedView ? 'flex items-center gap-3' : ''}>
                        {detailedView && cardThumbnails[card.id] && (
                          <img src={cardThumbnails[card.id]} alt="" className="h-16 w-auto rounded border object-contain shrink-0 bg-white" />
                        )}
                        <span className="text-sm font-medium">{card.name}</span>
                      </div>
                    </ListItem>
                  ))}
                </CardContent>
              </Card>

              {selectedCard ? (
                <Card>
                  <CardContent className="pt-6">
                      <div className="space-y-4">
                        <div className="space-y-2">
                          <Label>Name</Label>
                          <Input
                            value={selectedCard.name || ''}
                            onChange={(e) => updateCardField('name', e.target.value)}
                          />
                        </div>

                        {game?.layout?.root && (() => {
                          // Discover fields from bindings, keyed by field\0property
                          const bm = game.layout.bindingMeta ?? {}
                          const fieldMap = new Map<string, { field: string; property: string; itemType: string; values?: string[] }>()
                          const addBindings = (bindings: Record<string, { field: string }> | undefined, nodeType: string) => {
                            if (!bindings) return
                            for (const [prop, binding] of Object.entries(bindings)) {
                              if (binding.field === 'name') continue
                              const key = `${binding.field}\0${prop}`
                              if (fieldMap.has(key)) continue
                              fieldMap.set(key, {
                                field: binding.field,
                                property: prop,
                                itemType: nodeType,
                                values: bm[`${prop}:${binding.field}`]?.values,
                              })
                            }
                          }
                          const collectBindings = (section: any) => {
                            addBindings(section.bindings, 'section')
                            section.items?.forEach((item: any) => addBindings(item.bindings, item.type ?? 'text'))
                            section.children?.forEach(collectBindings)
                          }
                          collectBindings(game.layout.root)
                          if (fieldMap.size === 0) return null

                          const setField = (fieldKey: string, val: string) =>
                            setSelectedCard((prev: any) => ({ ...prev, fields: { ...prev.fields, [fieldKey]: val } }))

                          // Resolve the card field value: scoped key → plain key → binding default
                          const getField = (property: string, field: string) =>
                            selectedCard.fields?.[`${property}:${field}`] ?? selectedCard.fields?.[field] ?? bm[`${property}:${field}`]?.default ?? ''

                          return (
                            <div className="space-y-3">
                              {[...fieldMap.entries()].map(([key, { field, property, itemType, values }]) => {
                                const fieldKey = `${property}:${field}`
                                const val = getField(property, field)
                                return (
                                <div key={key} className="space-y-1">
                                  <Label className="text-sm">{field}</Label>
                                  {values ? (
                                    <select
                                      value={val}
                                      onChange={(e) => setField(fieldKey, e.target.value)}
                                      className="w-full rounded-md border bg-background pl-3 pr-8 py-2 text-sm"
                                    >
                                      {values.map((v: string) => <option key={v} value={v}>{v}</option>)}
                                    </select>
                                  ) : (
                                    <ValueItemEditor
                                      property={property}
                                      itemType={itemType}
                                      value={val}
                                      onChange={(v) => setField(fieldKey, v)}
                                      layout={game.layout}
                                      gameImages={gameImages}
                                      onUploadFile={async (file) => {
                                        const url = await storage.uploadImage(gameId, file)
                                        const imgs = await storage.listImages?.(gameId).catch(() => []) ?? []
                                        setGameImages(imgs)
                                        return url
                                      }}
                                    />
                                  )}
                                </div>
                                )
                              })}
                            </div>
                          )
                        })()}

                      </div>
                  </CardContent>
                </Card>
              ) : (
                <div className="flex items-center justify-center rounded-lg border bg-card p-8">
                  <p className="text-sm text-muted-foreground">Select a card or create a new one to start editing</p>
                </div>
              )}

              <div className="flex items-start justify-center">
                {cardPreview && (
                  <ZoomablePreview src={cardPreview} alt="Card preview" backImage={collection?.back} backFit={collection?.backFit} />
                )}
              </div>
            </div>
          </TabsContent>

          <TabsContent value="layout">
            <div className="grid grid-cols-1 md:grid-cols-[320px_1fr_1fr] gap-4 items-start">
              {game.layout?.root && (
                <div className="overflow-y-auto max-h-[60vh] rounded-lg border bg-card overflow-hidden">
                  <NodeTree
                    root={game.layout.root}
                    selectedNodeId={selectedNodeId}
                    onSelectNode={handleNodeSelect}
                    onDrop={(dragId, dragKind, dropTargetId, position) => {
                      const t = JSON.parse(JSON.stringify(game.layout))
                      if (moveNode(t.root, dragId, dragKind, dropTargetId, position)) {
                        handleLayoutSave(t)
                      }
                    }}
                    onAddSection={handleAddSection}
                    onAddItem={handleAddItem}
                    onDelete={handleDeleteNode}
                    canDelete={!!selectedNodeId && !isRoot}
                  />
                </div>
              )}
              {selectedNodeId ? (
                <Card>
                  <CardContent className="pt-4">
                    <PropertyPanel
                      layout={game.layout}
                      gameFonts={gameFonts}
                      gameImages={gameImages}
                      onUploadFile={async (file) => {
                        const url = await storage.uploadImage(gameId, file)
                        const imgs = await storage.listImages?.(gameId).catch(() => []) ?? []
                        setGameImages(imgs)
                        return url
                      }}
                      selectedNodeId={selectedNodeId}
                      selectedProperty={selectedProperty}
                      onSelectProperty={(prop) => {
                        setSelectedProperty(prop)
                        if (selectedNodeId) {
                          setPropertyByType(prev => ({ ...prev, [getNodeTypeKey(selectedNodeId)]: prop }))
                        }
                      }}
                      onPropertyChange={handlePropertyChange}
                    />
                  </CardContent>
                </Card>
              ) : <div />}
              {game.layout && (
                <LayoutPreview
                  layout={game.layout}
                  gameId={gameId!}
                  cards={cards}
                  back={collection?.back}
                  gameFonts={gameFonts}
                  selectedNodeId={selectedNodeId}
                  onNodeClick={handleNodeSelect}
                />
              )}
            </div>
          </TabsContent>

          <TabsContent value="back">
            {collection?.back && game?.layout && (
              <div className="flex justify-center mb-4 p-4 rounded-lg" style={{ backgroundImage: 'repeating-conic-gradient(#e5e5e5 0% 25%, transparent 0% 50%)', backgroundSize: '16px 16px' }}>
                <div
                  className="relative overflow-hidden drop-shadow-lg"
                  style={{
                    width: 200,
                    height: 200 * (game.layout.height / game.layout.width),
                    borderRadius: `${game.layout.radius / game.layout.width * 200}px`,
                    background: '#ffffff',
                  }}
                >
                  <img
                    src={collection.back}
                    alt="Back preview"
                    className="w-full h-full"
                    style={{
                      objectFit: collection.backFit === 'contain' ? 'contain' : collection.backFit === 'fill' ? 'fill' : 'cover',
                    }}
                  />
                </div>
              </div>
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
                      const url = await storage.uploadImage(gameId, file)
                      const imgs = await storage.listImages?.(gameId).catch(() => []) ?? []
                      setGameImages(imgs)
                      return url
                    }}
                    onChange={async (v) => {
                      setCollection((prev: any) => ({ ...prev, back: v || undefined }))
                      try { await storage.updateCollection(gameId, collectionId, { back: v || undefined }) }
                      catch { setStatus('Error saving back.') }
                    }}
                  />
                </div>
                {collection?.back && (
                  <div className="space-y-2">
                    <Label>Fit Mode</Label>
                    <select
                      value={collection?.backFit || 'cover'}
                      onChange={async (e) => {
                        const fit = e.target.value as 'cover' | 'contain' | 'fill'
                        setCollection((prev: any) => ({ ...prev, backFit: fit }))
                        try { await storage.updateCollection(gameId, collectionId, { backFit: fit }) }
                        catch { setStatus('Error saving back fit.') }
                      }}
                      className="w-full rounded-md border bg-background pl-3 pr-8 py-2 text-sm"
                    >
                      <option value="cover">Cover</option>
                      <option value="contain">Contain</option>
                      <option value="fill">Fill</option>
                    </select>
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="data">
            <FilesPanel
              gameId={gameId!}
              collectionId={collectionId}
              gameName={game?.name}
              collectionName={collection?.name}
              cards={cards}
              layout={game?.layout}
              gameFonts={gameFonts}
              storage={storage}
              onStatusChange={setStatus}
              onCardsChange={() => loadGame(storage)}
            />
          </TabsContent>
        </Tabs>
    </PageLayout>
  )
}
