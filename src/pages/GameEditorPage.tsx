import { useState, useEffect } from 'react'
import { Eye, Upload, ArrowLeft, Copy, Save, Plus, LayoutGrid, Layers, Type, Image, Smile } from 'lucide-react'
import { useParams, useNavigate } from 'react-router-dom'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import NodeTree from '@/components/layout/NodeTree'
import PropertyPanel from '@/components/layout/PropertyPanel'
import { getNodeKind, moveNode, findSectionById, findNodeLocation, findParentSection, findItemById } from '@/components/layout/layoutHelpers'
import ZoomablePreview from '@/components/ZoomablePreview'
import ConfirmButton from '@/components/ConfirmButton'
import RichTextField from '@/components/RichTextField'
import ListItem from '@/components/ListItem'
import LoadingImg from '@/components/LoadingImg'
import PageLayout from '@/components/PageLayout'
import useStorage from '../hooks/useStorage'

export default function GameEditorPage() {
  const { gameId, collectionId } = useParams<{ gameId: string; collectionId: string }>()
  const navigate = useNavigate()
  const { storage, status, setStatus, setError, errorDetail, clearError } = useStorage()
  const [game, setGame] = useState<any>(null)
  const [collection, setCollection] = useState<any>(null)
  const [cards, setCards] = useState<any[]>([])
  const [selectedCard, setSelectedCard] = useState<any>(null)
  const [cardPreview, setCardPreview] = useState<string>('')
  const [expandedImages, setExpandedImages] = useState<Set<string>>(new Set())
  const [editingName, setEditingName] = useState(false)
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null)
  const [selectedProperty, setSelectedProperty] = useState<string | null>(null)
  const [propertyByType, setPropertyByType] = useState<Record<string, string>>({})
  const [layoutPreview, setLayoutPreview] = useState<string>('')
  const [layoutHitAreas, setLayoutHitAreas] = useState<{ id: string; x: number; y: number; width: number; height: number }[]>([])
  const [showSections, setShowSections] = useState(true)
  const [showItemWires, setShowItemWires] = useState(true)
  const [savedCardJson, setSavedCardJson] = useState('')
  const isCardDirty = selectedCard && JSON.stringify(selectedCard) !== savedCardJson

  useEffect(() => {
    if (!storage || !gameId) return
    loadGame(storage)
  }, [storage, gameId])

  useEffect(() => {
    if (!game?.layout?.fonts) return
    const styleId = 'game-fonts-style'
    let style = document.getElementById(styleId) as HTMLStyleElement | null
    if (!style) {
      style = document.createElement('style')
      style.id = styleId
      document.head.appendChild(style)
    }
    const rules = Object.values(game.layout.fonts)
      .filter((f: any) => f.file)
      .map((f: any) => `@font-face { font-family: '${f.name}'; src: url('/api/games/${gameId}/fonts/${f.file}'); }`)
      .join('\n')
    style.textContent = rules
    return () => { if (style) style.textContent = '' }
  }, [game?.layout?.fonts])

  useEffect(() => {
    if (!selectedCard || !game?.layout || !gameId) return
    const timer = setTimeout(async () => {
      try {
        const { renderCardSvg, embedFontsInSvg, embedImagesInSvg } = await import('../render')
        let svg = renderCardSvg(selectedCard, game.layout)
        svg = await embedFontsInSvg(svg, game.layout, gameId)
        svg = await embedImagesInSvg(svg)
        const blob = new Blob([svg], { type: 'image/svg+xml' })
        const blobUrl = URL.createObjectURL(blob)
        setCardPreview((prev) => { if (prev) URL.revokeObjectURL(prev); return blobUrl })
      } catch (error) {
        console.error('Error updating card preview:', error)
      }
    }, 300)
    return () => clearTimeout(timer)
  }, [selectedCard, game?.layout, gameId])

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

      const layout = await s.getLayout(gameId, col.layoutId)
      gameData.layout = layout
      setGame(gameData)
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
    setSelectedCard({ ...selectedCard, [field]: value })
  }

  // Layout preview
  useEffect(() => {
    if (!game?.layout) { setLayoutPreview(''); return }
    const updatePreview = async () => {
      const { renderLayoutSvg, computeLayout, embedFontsInSvg, embedImagesInSvg } = await import('../render')
      let svg = renderLayoutSvg(game.layout, { showSections, showItems: showItemWires, selectedNodeId })
      svg = await embedFontsInSvg(svg, game.layout, gameId!)
      svg = await embedImagesInSvg(svg)
      const layout = computeLayout(game.layout)
      setLayoutHitAreas([
        ...Array.from(layout.sections.entries()).map(([id, r]: [string, any]) => ({ id, ...r })),
        ...Array.from(layout.items.entries()).map(([id, r]: [string, any]) => ({ id, ...r })),
      ])
      const blob = new Blob([svg], { type: 'image/svg+xml' })
      const url = URL.createObjectURL(blob)
      setLayoutPreview(prev => { if (prev) URL.revokeObjectURL(prev); return url })
    }
    updatePreview()
  }, [game?.layout, showSections, showItemWires, selectedNodeId])

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
    const defaults: Record<string, string> = { section: 'layout', text: 'fieldId', frame: 'fillColor', image: 'fieldId', emoji: 'emoji' }
    setSelectedProperty(propertyByType[newTypeKey] ?? defaults[newTypeKey] ?? 'name')
  }

  const handlePropertyChange = (property: string, value: unknown) => {
    if (!game?.layout || !selectedNodeId) return
    const t = JSON.parse(JSON.stringify(game.layout))
    const kind = getNodeKind(t.root, selectedNodeId)
    if (!kind) return
    let node: any
    if (kind === 'section') {
      const find = (s: any): any => { if (s.id === selectedNodeId) return s; for (const c of s.children) { const f = find(c); if (f) return f } return null }
      node = find(t.root)
    } else {
      const find = (s: any): any => { const i = s.items.find((i: any) => i.id === selectedNodeId); if (i) return i; for (const c of s.children) { const f = find(c); if (f) return f } return null }
      node = find(t.root)
    }
    if (!node) return
    const TEMPLATE_KEYS = new Set(['width', 'height', 'radius', 'bleed'])
    if (TEMPLATE_KEYS.has(property)) { (t as any)[property] = value }
    else if (property === 'attachAnchor') { if (!node.attach) node.attach = { targetType: 'section', targetId: '', anchor: { x: 0, y: 0 } }; node.attach.anchor = value }
    else if (property === 'attachTargetId') { if (!node.attach) node.attach = { targetType: 'section', targetId: '', anchor: { x: 0, y: 0 } }; node.attach.targetId = value; node.attach.targetType = getNodeKind(t.root, value as string) ?? 'section' }
    else node[property] = value
    handleLayoutSave(t)
  }

  const selectedKind = selectedNodeId && game?.layout?.root ? getNodeKind(game.layout.root, selectedNodeId) : null
  const isRoot = selectedNodeId === game?.layout?.root?.id

  const handleAddSection = () => {
    if (!game?.layout) return
    const t = JSON.parse(JSON.stringify(game.layout))
    const parentId = selectedKind === 'section' && selectedNodeId ? selectedNodeId : t.root.id
    const parent = findSectionById(t.root, parentId)
    if (!parent) return
    const section = { id: crypto.randomUUID(), name: 'New Section', layout: 'stack' as const, sizePct: 100, gap: 0, children: [] as any[], items: [] as any[] }
    parent.children.push(section)
    handleLayoutSave(t)
    setSelectedNodeId(section.id)
  }

  const handleAddItem = (itemType: 'text' | 'frame' | 'image' | 'emoji') => {
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
      text: { ...base, type: 'text', name: 'New Text', fieldId: 'field', fontSize: 20, align: 'left', anchor: { x: 0, y: 0 }, attach: { ...base.attach, anchor: { x: 0, y: 0 } } },
      frame: { ...base, type: 'frame', name: 'New Frame', strokeWidth: 2, cornerRadius: 8 },
      image: { ...base, type: 'image', name: 'New Image', fieldId: 'image', fit: 'cover', cornerRadius: 0 },
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
          </TabsList>

          <TabsContent value="cards">
            <div className="grid grid-cols-1 md:grid-cols-[320px_1fr_1fr] gap-4 items-start">
              <Card>
                <CardHeader className="flex flex-row items-center justify-between space-y-0">
                  <CardTitle className="text-base">Cards</CardTitle>
                  <Button size="sm" variant="ghost" onClick={handleCreateCard} title="New card">
                    <Plus className="h-4 w-4" />
                  </Button>
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
                      <span className="text-sm font-medium">{card.name}</span>
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
                          const fields: { fieldId: string; itemName: string; itemType: string; values?: string[] }[] = []
                          const seen = new Set<string>()
                          const collectFields = (section: any) => {
                            section.items?.forEach((item: any) => {
                              const type = item.type ?? 'text'
                              if ((type === 'text' || type === 'image' || type === 'emoji') && item.fieldId && item.fieldId !== 'name' && !seen.has(item.fieldId)) {
                                seen.add(item.fieldId)
                                fields.push({ fieldId: item.fieldId, itemName: item.name, itemType: type, values: Array.isArray(item.values) && item.values.length > 0 ? item.values : undefined })
                              }
                            })
                            section.children?.forEach(collectFields)
                          }
                          collectFields(game.layout.root)
                          if (fields.length === 0) return null
                          return (
                            <div className="space-y-3">
                              {fields.map(({ fieldId, itemType, values }) => (
                                <div key={fieldId} className="space-y-1">
                                  <Label className="text-sm flex items-center gap-1.5">{{ text: <Type className="h-3.5 w-3.5 text-muted-foreground" />, image: <Image className="h-3.5 w-3.5 text-muted-foreground" />, emoji: <Smile className="h-3.5 w-3.5 text-muted-foreground" /> }[itemType]} {fieldId}</Label>
                                  {values ? (
                                    <select
                                      value={selectedCard.fields?.[fieldId] ?? ''}
                                      onChange={(e) => setSelectedCard({ ...selectedCard, fields: { ...selectedCard.fields, [fieldId]: e.target.value } })}
                                      className="w-full rounded-md border bg-background px-3 py-2 text-sm"
                                    >
                                      <option value="">— select —</option>
                                      {values.map((v: string) => <option key={v} value={v}>{v}</option>)}
                                    </select>
                                  ) : itemType === 'image' ? (
                                    <div className="space-y-2">
                                      <div className="relative">
                                        <Input
                                          value={selectedCard.fields?.[fieldId] ?? ''}
                                          onChange={(e) => setSelectedCard({ ...selectedCard, fields: { ...selectedCard.fields, [fieldId]: e.target.value } })}
                                          placeholder="Image URL"
                                          className="pr-16"
                                        />
                                        <div className="absolute right-0 top-0 h-full flex items-center gap-0.5 pr-1">
                                          {selectedCard.fields?.[fieldId] && (
                                            <button
                                              type="button"
                                              className="text-muted-foreground hover:text-foreground p-1 rounded-sm"
                                              onClick={() => setExpandedImages(prev => {
                                                const next = new Set(prev)
                                                next.has(fieldId) ? next.delete(fieldId) : next.add(fieldId)
                                                return next
                                              })}
                                              title="Preview image"
                                            >
                                              <Eye className="h-4 w-4" />
                                            </button>
                                          )}
                                          <button
                                            type="button"
                                            className="text-muted-foreground hover:text-foreground p-1 rounded-sm"
                                            title="Upload image"
                                            onClick={() => {
                                              const input = document.createElement('input')
                                              input.type = 'file'
                                              input.accept = 'image/*'
                                              input.onchange = async () => {
                                                const file = input.files?.[0]
                                                if (!file) return
                                                try {
                                                  setStatus('Uploading image...')
                                                  let url: string
                                                  try {
                                                    url = await storage.uploadImage(gameId, file)
                                                  } catch {
                                                    // Fallback to data URI if storage upload fails
                                                    url = await new Promise<string>(r => { const reader = new FileReader(); reader.onload = () => r(reader.result as string); reader.readAsDataURL(file) })
                                                  }
                                                  setSelectedCard((prev: any) => ({ ...prev, fields: { ...prev.fields, [fieldId]: url } }))
                                                  setStatus('Image uploaded.')
                                                } catch (err: any) {
                                                  setStatus(`Error: ${err.message || 'Upload failed'}`)
                                                }
                                              }
                                              input.click()
                                            }}
                                          >
                                            <Upload className="h-4 w-4" />
                                          </button>
                                        </div>
                                      </div>
                                      {expandedImages.has(fieldId) && selectedCard.fields?.[fieldId] && (
                                        <LoadingImg
                                          src={selectedCard.fields[fieldId]}
                                          alt={fieldId}
                                          className="max-h-32 rounded border object-contain"
                                        />
                                      )}
                                    </div>
                                  ) : (
                                    <RichTextField
                                      value={selectedCard.fields?.[fieldId] ?? ''}
                                      onChange={(html) => setSelectedCard({ ...selectedCard, fields: { ...selectedCard.fields, [fieldId]: html } })}
                                      placeholder={`Enter ${fieldId}`}
                                    />
                                  )}
                                </div>
                              ))}
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
                  <ZoomablePreview src={cardPreview} alt="Card preview" />
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
                    canAddSection={!selectedKind || selectedKind === 'section'}
                    canAddItem={!selectedKind || selectedKind === 'section'}
                    canDelete={!!selectedNodeId && !isRoot}
                  />
                </div>
              )}
              {selectedNodeId ? (
                <Card>
                  <CardContent className="pt-4">
                    <PropertyPanel
                      layout={game.layout}
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
              {layoutPreview && (
                <ZoomablePreview
                  src={layoutPreview}
                  alt="Layout preview"
                  svgWidth={game.layout.width}
                  svgHeight={game.layout.height}
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
            </div>
          </TabsContent>
        </Tabs>
    </PageLayout>
  )
}
