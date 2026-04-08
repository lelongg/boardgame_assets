import { useState, useEffect } from 'react'
import { Eye, Upload, ArrowLeft } from 'lucide-react'
import { useParams, useNavigate } from 'react-router-dom'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { createStorage } from '../storage'
import FontManager from '@/components/FontManager'
import NodeTree from '@/components/layout/NodeTree'
import PropertyPanel from '@/components/layout/PropertyPanel'
import { findSectionById, findNodeLocation, findParentSection } from '@/components/layout/templateHelpers'
import { getNodeKind, moveNode, findItemById } from '@/components/layout/templateHelpers'
import ZoomablePreview from '@/components/ZoomablePreview'
import ConfirmButton from '@/components/ConfirmButton'
import RichTextField from '@/components/RichTextField'

export default function GameEditorPage() {
  const { gameId } = useParams<{ gameId: string }>()
  const navigate = useNavigate()
  const [status, setStatus] = useState('Loading...')
  const [storage, setStorage] = useState<any>(null)
  const [game, setGame] = useState<any>(null)
  const [cards, setCards] = useState<any[]>([])
  const [selectedCard, setSelectedCard] = useState<any>(null)
  const [cardPreview, setCardPreview] = useState<string>('')
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(() => {
    try { return localStorage.getItem(`editor:${gameId}:selectedNode`) } catch { return null }
  })
  const [selectedProperty, setSelectedProperty] = useState<string | null>(null)
  const [propertyByType, setPropertyByType] = useState<Record<string, string>>({})
  const [templatePreview, setTemplatePreview] = useState<string>('')
  const [templateHitAreas, setTemplateHitAreas] = useState<{ id: string; x: number; y: number; width: number; height: number }[]>([])
  const [showWireframes, setShowWireframes] = useState(true)
  const [expandedImages, setExpandedImages] = useState<Set<string>>(new Set())
  const [editingName, setEditingName] = useState(false)
  const [savedCardJson, setSavedCardJson] = useState('')
  const isCardDirty = selectedCard && JSON.stringify(selectedCard) !== savedCardJson

  useEffect(() => {
    const initStorage = async () => {
      const s = await createStorage()
      setStorage(s)
      await loadGame(s)
    }
    initStorage()
  }, [gameId])

  useEffect(() => {
    if (!game?.template?.fonts || !gameId) return
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
  }, [game?.template?.fonts, gameId])

  useEffect(() => {
    if (!game?.template) return
    const updatePreview = async () => {
      const { renderTemplateSvg, computeLayout } = await import('../render')
      const svg = renderTemplateSvg(game.template, { showWireframes, selectedNodeId })
      const layout = computeLayout(game.template)
      const areas = [
        ...Array.from(layout.sections.entries()).map(([id, r]: [string, any]) => ({ id, ...r })),
        ...Array.from(layout.items.entries()).map(([id, r]: [string, any]) => ({ id, ...r })),
      ]
      setTemplateHitAreas(areas)
      const blob = new Blob([svg], { type: 'image/svg+xml' })
      const url = URL.createObjectURL(blob)
      setTemplatePreview((prev) => { if (prev) URL.revokeObjectURL(prev); return url })
    }
    updatePreview()
  }, [game?.template, showWireframes, selectedNodeId])

  useEffect(() => {
    if (!selectedCard || !game?.template || !gameId) return
    const timer = setTimeout(async () => {
      try {
        const res = await fetch(`/api/games/${gameId}/render`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ card: selectedCard, template: game.template }),
        })
        if (res.ok) {
          const svg = await res.text()
          const blob = new Blob([svg], { type: 'image/svg+xml' })
          const url = URL.createObjectURL(blob)
          setCardPreview((prev) => { if (prev) URL.revokeObjectURL(prev); return url })
        }
      } catch (error) {
        console.error('Error updating card preview:', error)
      }
    }, 300)
    return () => clearTimeout(timer)
  }, [selectedCard, game?.template, gameId])

  // Auto-save card
  useEffect(() => {
    if (!selectedCard || !gameId || !storage) return
    if (JSON.stringify(selectedCard) === savedCardJson) return
    const timer = setTimeout(async () => {
      try {
        await storage.saveCard(gameId, selectedCard.id, selectedCard)
        setSavedCardJson(JSON.stringify(selectedCard))
      } catch (error) {
        console.error('Auto-save failed:', error)
      }
    }, 2000)
    return () => clearTimeout(timer)
  }, [selectedCard, gameId, storage])

  const selectCard = async (s: any, cardId: string) => {
    try {
      if (!gameId) return
      const cardData = await s.getCard(gameId, cardId)
      setSavedCardJson(JSON.stringify(cardData))
      setSelectedCard(cardData)
      localStorage.setItem(`editor:${gameId}:selectedCard`, cardId)
    } catch (error) {
      console.error('Error loading card:', error)
    }
  }

  const loadGame = async (s: any) => {
    try {
      if (!gameId) return
      setStatus('Loading game...')
      const gameData = await s.getGame(gameId)
      
      // Load template separately
      const template = await s.loadTemplate(gameId)
      gameData.template = template
      
      setGame(gameData)
      
      const cardList = await s.listCards(gameId)
      setCards(cardList)
      
      if (cardList.length > 0) {
        const savedCardId = localStorage.getItem(`editor:${gameId}:selectedCard`)
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
      if (!gameId || !selectedCard) return
      setStatus('Saving card...')
      await storage.saveCard(gameId, selectedCard.id, selectedCard)
      setSavedCardJson(JSON.stringify(selectedCard))
      setStatus('Card saved.')
      await loadGame(storage)
    } catch (error) {
      setStatus('Error saving card.')
      console.error(error)
    }
  }

  const handleCreateCard = async () => {
    try {
      if (!gameId) return
      setStatus('Creating card...')
      const newCard = {
        id: crypto.randomUUID(),
        name: 'New Card',
        fields: {}
      }
      await storage.saveCard(gameId, newCard.id, newCard)
      await loadGame(storage)
      await selectCard(storage, newCard.id)
      setStatus('Card created.')
    } catch (error) {
      setStatus('Error creating card.')
      console.error(error)
    }
  }

  const handleDeleteCard = async () => {
    try {
      if (!gameId || !selectedCard) return
      setStatus('Deleting card...')
      await storage.deleteCard(gameId, selectedCard.id)
      
      const updatedCards = cards.filter(c => c.id !== selectedCard.id)
      setCards(updatedCards)
      
      if (updatedCards.length > 0) {
        await selectCard(storage, updatedCards[0].id)
      } else {
        setSelectedCard(null)
        setCardPreview('')
      }
      
      setStatus('Card deleted.')
    } catch (error) {
      setStatus('Error deleting card.')
      console.error(error)
    }
  }

  const updateCardField = (field: string, value: any) => {
    setSelectedCard({
      ...selectedCard,
      [field]: value
    })
  }

  const handleFontsChange = (newFonts: Record<string, any>) => {
    if (!game) return
    setGame({ ...game, template: { ...game.template, fonts: newFonts } })
  }

  const handleTemplateSave = async (updatedTemplate: any) => {
    if (!gameId || !game) return
    try {
      setStatus('Saving template...')
      await storage.saveTemplate(gameId, updatedTemplate)
      setGame({ ...game, template: updatedTemplate })
      setStatus('Template saved.')
    } catch (error) {
      setStatus('Error saving template.')
      console.error(error)
    }
  }

  const getNodeTypeKey = (id: string): string => {
    if (!game?.template?.root) return 'unknown'
    const kind = getNodeKind(game.template.root, id)
    if (kind === 'section') return 'section'
    const item = findItemById(game.template.root, id)
    return (item as any)?.type ?? 'text'
  }

  const handleNodeSelect = (id: string) => {
    // Save current property for current node's type
    if (selectedNodeId && selectedProperty) {
      const typeKey = getNodeTypeKey(selectedNodeId)
      setPropertyByType(prev => ({ ...prev, [typeKey]: selectedProperty }))
    }
    setSelectedNodeId(id)
    if (gameId) localStorage.setItem(`editor:${gameId}:selectedNode`, id)
    // Restore property for new node's type
    const newTypeKey = getNodeTypeKey(id)
    const defaults: Record<string, string> = { section: 'layout', text: 'fieldId', frame: 'fillColor', image: 'fieldId' }
    setSelectedProperty(propertyByType[newTypeKey] ?? defaults[newTypeKey] ?? 'name')
  }

  const handlePropertyChange = (property: string, value: unknown) => {
    if (!game?.template || !selectedNodeId) return
    const t = JSON.parse(JSON.stringify(game.template))
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
      // Auto-detect target type from the ID
      node.attach.targetType = getNodeKind(t.root, value as string) ?? 'section'
    } else {
      node[property] = value
    }

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
    const section = { id: crypto.randomUUID(), name: 'New Section', layout: 'stack', sizePct: 100, gap: 0, children: [], items: [] }
    parent.children.push(section)
    handleTemplateSave(t)
    setSelectedNodeId(section.id)
  }

  const handleAddItem = (itemType: 'text' | 'frame' | 'image') => {
    if (!game?.template) return
    const t = JSON.parse(JSON.stringify(game.template))
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
                if (e.key === 'Escape') { setEditingName(false) }
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

      <main className="mx-auto max-w-7xl px-4 py-4 md:px-7 md:py-4">
        <Tabs defaultValue="cards" className="w-full">
          <TabsList className="mb-4">
            <TabsTrigger value="cards">Cards</TabsTrigger>
            <TabsTrigger value="layout">Layout</TabsTrigger>
            <TabsTrigger value="fonts">Fonts</TabsTrigger>
          </TabsList>

          <TabsContent value="cards">
            <div className="grid grid-cols-1 md:grid-cols-[240px_1fr] gap-6">
              <Card>
                <CardHeader className="flex flex-row items-center justify-between space-y-0">
                  <CardTitle className="text-base">Cards</CardTitle>
                  <Button size="sm" onClick={handleCreateCard}>
                    New
                  </Button>
                </CardHeader>
                <CardContent className="space-y-2">
                  {cards.map((card) => (
                    <div key={card.id} className={`rounded-lg border bg-card cursor-pointer ${
                      selectedCard?.id === card.id ? 'ring-1 ring-primary' : ''
                    }`}>
                      <button
                        onClick={() => selectCard(storage, card.id)}
                        className="w-full px-3 py-2.5 text-left text-sm font-medium"
                      >
                        {card.name}
                      </button>
                      {selectedCard?.id === card.id && (
                        <div className="flex gap-2 border-t px-3 py-2">
                          <Button size="sm" onClick={handleSaveCard} disabled={!isCardDirty}>Save</Button>
                          <ConfirmButton onConfirm={handleDeleteCard} />
                        </div>
                      )}
                    </div>
                  ))}
                </CardContent>
              </Card>

              {selectedCard ? (
                <Card>
                  <CardContent className="pt-6">
                    <div className="grid grid-cols-1 lg:grid-cols-[1fr_360px] gap-6">
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
                                                if (!file || !gameId) return
                                                try {
                                                  setStatus('Uploading image...')
                                                  const res = await fetch(`/api/games/${gameId}/images/upload`, {
                                                    method: 'POST',
                                                    headers: { 'Content-Disposition': `attachment; filename="${file.name}"` },
                                                    body: await file.arrayBuffer(),
                                                  })
                                                  if (!res.ok) throw new Error('Upload failed')
                                                  const { url } = await res.json()
                                                  setSelectedCard((prev: any) => ({ ...prev, fields: { ...prev.fields, [fieldId]: url } }))
                                                  setStatus('Image uploaded.')
                                                } catch {
                                                  setStatus('Error uploading image.')
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

                      <div className="flex items-start justify-center">
                        {cardPreview && (
                          <ZoomablePreview src={cardPreview} alt="Card preview" />
                        )}
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ) : (
                <Card>
                  <CardContent className="text-center text-muted-foreground py-8">
                    Select a card or create a new one to start editing
                  </CardContent>
                </Card>
              )}
            </div>
          </TabsContent>

          <TabsContent value="layout">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4" style={{ gridTemplateRows: '1fr' }}>
              {game.template?.root && (
                <div className="overflow-y-auto rounded-md border p-2">
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
                          const typeKey = getNodeTypeKey(selectedNodeId)
                          setPropertyByType(prev => ({ ...prev, [typeKey]: prop }))
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
                />
              )}
            </div>
          </TabsContent>

          <TabsContent value="fonts">
            <Card>
            <CardContent className="pt-6">
            <FontManager
              gameId={gameId!}
              fonts={game?.template?.fonts ?? {}}
              onFontsChange={handleFontsChange}
              onStatus={setStatus}
            />
            </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </main>
    </div>
  )
}
