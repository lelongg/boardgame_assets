import { useState, useEffect } from 'react'
import { Eye, Upload, ArrowLeft, Copy, Save, Plus, LayoutGrid, Layers } from 'lucide-react'
import { useParams, useNavigate } from 'react-router-dom'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import NodeTree from '@/components/layout/NodeTree'
import PropertyPanel from '@/components/layout/PropertyPanel'
import { getNodeKind, moveNode, findSectionById, findNodeLocation, findParentSection, findItemById } from '@/components/layout/templateHelpers'
import ZoomablePreview from '@/components/ZoomablePreview'
import ConfirmButton from '@/components/ConfirmButton'
import RichTextField from '@/components/RichTextField'
import ListItem from '@/components/ListItem'
import PageLayout from '@/components/PageLayout'
import useStorage from '../hooks/useStorage'

export default function GameEditorPage() {
  const { gameId, collectionId } = useParams<{ gameId: string; collectionId: string }>()
  const navigate = useNavigate()
  const { storage, status, setStatus } = useStorage()
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
  const [templatePreview, setTemplatePreview] = useState<string>('')
  const [templateHitAreas, setTemplateHitAreas] = useState<{ id: string; x: number; y: number; width: number; height: number }[]>([])
  const [showSections, setShowSections] = useState(true)
  const [showItemWires, setShowItemWires] = useState(true)
  const [savedCardJson, setSavedCardJson] = useState('')
  const isCardDirty = selectedCard && JSON.stringify(selectedCard) !== savedCardJson

  useEffect(() => {
    if (!storage || !gameId) return
    loadGame(storage)
  }, [storage, gameId])

  useEffect(() => {
    if (!game?.template?.fonts) return
    const styleId = 'game-fonts-style'
    let style = document.getElementById(styleId) as HTMLStyleElement | null
    if (!style) {
      style = document.createElement('style')
      style.id = styleId
      document.head.appendChild(style)
    }
    const rules = Object.values(game.template.fonts)
      .filter((f: any) => f.file)
      .map((f: any) => `@font-face { font-family: '${f.name}'; src: url('/api/games/${gameId}/fonts/${f.file}'); }`)
      .join('\n')
    style.textContent = rules
    return () => { if (style) style.textContent = '' }
  }, [game?.template?.fonts])

  useEffect(() => {
    if (!selectedCard || !game?.template || !gameId) return
    const timer = setTimeout(async () => {
      try {
        const { renderCardSvg, embedFontsInSvg, embedImagesInSvg } = await import('../render')
        let svg = renderCardSvg(selectedCard, game.template)
        svg = await embedFontsInSvg(svg, game.template, gameId)
        svg = await embedImagesInSvg(svg)
        const blob = new Blob([svg], { type: 'image/svg+xml' })
        const blobUrl = URL.createObjectURL(blob)
        setCardPreview((prev) => { if (prev) URL.revokeObjectURL(prev); return blobUrl })
      } catch (error) {
        console.error('Error updating card preview:', error)
      }
    }, 300)
    return () => clearTimeout(timer)
  }, [selectedCard, game?.template, gameId])

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

      const template = await s.getTemplate(gameId, col.templateId)
      gameData.template = template
      setGame(gameData)

      const cardList = await s.listCards(gameId, collectionId)
      setCards(cardList)

      if (cardList.length > 0) {
        const savedCardId = localStorage.getItem(`editor:${gameId}:${collectionId}:selectedCard`)
        const cardToSelect = savedCardId && cardList.some((c: any) => c.id === savedCardId) ? savedCardId : cardList[0].id
        await selectCard(s, cardToSelect)
      }

      setStatus('Ready.')
    } catch (error) {
      setStatus('Error loading game.')
      console.error(error)
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
      setStatus('Error saving card.')
      console.error(error)
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

  // Template preview
  useEffect(() => {
    if (!game?.template) { setTemplatePreview(''); return }
    const updatePreview = async () => {
      const { renderTemplateSvg, computeLayout, embedFontsInSvg, embedImagesInSvg } = await import('../render')
      let svg = renderTemplateSvg(game.template, { showSections, showItems: showItemWires, selectedNodeId })
      svg = await embedFontsInSvg(svg, game.template, gameId!)
      svg = await embedImagesInSvg(svg)
      const layout = computeLayout(game.template)
      setTemplateHitAreas([
        ...Array.from(layout.sections.entries()).map(([id, r]: [string, any]) => ({ id, ...r })),
        ...Array.from(layout.items.entries()).map(([id, r]: [string, any]) => ({ id, ...r })),
      ])
      const blob = new Blob([svg], { type: 'image/svg+xml' })
      const url = URL.createObjectURL(blob)
      setTemplatePreview(prev => { if (prev) URL.revokeObjectURL(prev); return url })
    }
    updatePreview()
  }, [game?.template, showSections, showItemWires, selectedNodeId])

  // Layout handlers
  const handleTemplateSave = async (updatedTemplate: any) => {
    if (!gameId || !game || !collection) return
    try {
      await storage.saveTemplate(gameId, collection.templateId, updatedTemplate)
      setGame({ ...game, template: updatedTemplate })
    } catch { setStatus('Error saving template.') }
  }

  const getNodeTypeKey = (id: string): string => {
    if (!game?.template?.root) return 'unknown'
    const kind = getNodeKind(game.template.root, id)
    if (kind === 'section') return 'section'
    const item = findItemById(game.template.root, id)
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
    if (!game?.template || !selectedNodeId) return
    const t = JSON.parse(JSON.stringify(game.template))
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
    handleTemplateSave(t)
  }

  const selectedKind = selectedNodeId && game?.template?.root ? getNodeKind(game.template.root, selectedNodeId) : null
  const isRoot = selectedNodeId === game?.template?.root?.id

  const handleAddSection = () => {
    if (!game?.template) return
    const t = JSON.parse(JSON.stringify(game.template))
    const parentId = selectedKind === 'section' && selectedNodeId ? selectedNodeId : t.root.id
    const parent = findSectionById(t.root, parentId)
    if (!parent) return
    const section = { id: crypto.randomUUID(), name: 'New Section', layout: 'stack' as const, sizePct: 100, gap: 0, children: [] as any[], items: [] as any[] }
    parent.children.push(section)
    handleTemplateSave(t)
    setSelectedNodeId(section.id)
  }

  const handleAddItem = (itemType: 'text' | 'frame' | 'image' | 'emoji') => {
    if (!game?.template) return
    const t = JSON.parse(JSON.stringify(game.template))
    let parentId: string
    if (selectedKind === 'section' && selectedNodeId) parentId = selectedNodeId
    else if (selectedKind === 'item' && selectedNodeId) { const p = findParentSection(t.root, selectedNodeId, 'item'); parentId = p?.id ?? t.root.id }
    else parentId = t.root.id
    const parent = findSectionById(t.root, parentId)
    if (!parent) return
    const base = { id: crypto.randomUUID(), anchor: { x: 0.5, y: 0.5 }, attach: { targetType: 'section', targetId: parentId, anchor: { x: 0.5, y: 0.5 } }, widthPct: 80, heightPct: 20 }
    const items: Record<string, any> = {
      text: { ...base, type: 'text', name: 'New Text', fieldId: 'field', fontSize: 20, align: 'left', anchor: { x: 0, y: 0 }, attach: { ...base.attach, anchor: { x: 0, y: 0 } } },
      frame: { ...base, type: 'frame', name: 'New Frame', heightPct: 90, widthPct: 90, strokeWidth: 2, cornerRadius: 8 },
      image: { ...base, type: 'image', name: 'New Image', fieldId: 'image', heightPct: 60, fit: 'cover', cornerRadius: 0 },
      emoji: { ...base, type: 'emoji', name: 'Emoji', emoji: '⭐', fontSize: 32 },
    }
    const item = items[itemType]
    if (selectedKind === 'item' && selectedNodeId) { const loc = findNodeLocation(t.root, selectedNodeId, 'item'); if (loc) loc.list.splice(loc.index + 1, 0, item); else parent.items.push(item) }
    else parent.items.push(item)
    handleTemplateSave(t)
    setSelectedNodeId(item.id)
  }

  const handleDeleteNode = () => {
    if (!selectedNodeId || !selectedKind || isRoot || !game?.template) return
    const t = JSON.parse(JSON.stringify(game.template))
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
    >
        <Tabs defaultValue={localStorage.getItem(`editor:${gameId}:tab`) || 'cards'} onValueChange={(v) => localStorage.setItem(`editor:${gameId}:tab`, v)} className="w-full">
          <TabsList className="mb-4">
            <TabsTrigger value="cards">Cards</TabsTrigger>
            <TabsTrigger value="layout">Layout</TabsTrigger>
          </TabsList>

          <TabsContent value="cards">
            <div className="grid grid-cols-1 md:grid-cols-[320px_1fr_360px] gap-6 items-start">
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

                        {game?.template?.root && (() => {
                          const fields: { fieldId: string; itemName: string; itemType: string }[] = []
                          const seen = new Set<string>()
                          const collectFields = (section: any) => {
                            section.items?.forEach((item: any) => {
                              const type = item.type ?? 'text'
                              if ((type === 'text' || type === 'image') && item.fieldId && item.fieldId !== 'name' && !seen.has(item.fieldId)) {
                                seen.add(item.fieldId)
                                fields.push({ fieldId: item.fieldId, itemName: item.name, itemType: type })
                              }
                            })
                            section.children?.forEach(collectFields)
                          }
                          collectFields(game.template.root)
                          if (fields.length === 0) return null
                          return (
                            <div className="space-y-3">
                              {fields.map(({ fieldId, itemName, itemType }) => (
                                <div key={fieldId} className="space-y-1">
                                  <Label className="text-sm">{itemName} <span className="text-muted-foreground font-normal">({fieldId})</span></Label>
                                  {itemType === 'image' ? (
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
                                        <img
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
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 items-start">
              {game.template?.root && (
                <div className="overflow-y-auto max-h-[60vh] rounded-md border p-2">
                  <NodeTree
                    root={game.template.root}
                    selectedNodeId={selectedNodeId}
                    onSelectNode={handleNodeSelect}
                    onDrop={(dragId, dragKind, dropTargetId, position) => {
                      const t = JSON.parse(JSON.stringify(game.template))
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
              )}
              {selectedNodeId ? (
                <Card>
                  <CardContent className="pt-4">
                    <PropertyPanel
                      template={game.template}
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
              {templatePreview && (
                <ZoomablePreview
                  src={templatePreview}
                  alt="Template preview"
                  svgWidth={game.template.width}
                  svgHeight={game.template.height}
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
            </div>
          </TabsContent>
        </Tabs>
    </PageLayout>
  )
}
