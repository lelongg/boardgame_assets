import { useState, useEffect } from 'react'
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
import TemplateActions from '@/components/layout/TemplateActions'
import { getNodeKind } from '@/components/layout/templateHelpers'

export default function GameEditorPage() {
  const { gameId } = useParams<{ gameId: string }>()
  const navigate = useNavigate()
  const [status, setStatus] = useState('Loading...')
  const [storage, setStorage] = useState<any>(null)
  const [game, setGame] = useState<any>(null)
  const [cards, setCards] = useState<any[]>([])
  const [selectedCard, setSelectedCard] = useState<any>(null)
  const [cardPreview, setCardPreview] = useState<string>('')
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null)
  const [selectedProperty, setSelectedProperty] = useState<string | null>(null)
  const [templatePreview, setTemplatePreview] = useState<string>('')

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
    if (!gameId) return
    const url = `/api/games/${gameId}/template.svg?t=${Date.now()}`
    setTemplatePreview(url)
  }, [game?.template, gameId])

  const selectCard = async (s: any, cardId: string, gameWithTemplate?: any) => {
    try {
      if (!gameId) return
      const cardData = await s.getCard(gameId, cardId)
      setSelectedCard(cardData)
      
      // Use the provided game object or the state
      const currentGame = gameWithTemplate || game
      
      // Generate preview only if we have a template
      if (currentGame?.template) {
        const { renderCardSvg } = await import('../render')
        const svg = renderCardSvg(cardData, currentGame.template)
        const blob = new Blob([svg], { type: 'image/svg+xml' })
        const url = URL.createObjectURL(blob)
        setCardPreview(url)
      }
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
        await selectCard(s, cardList[0].id, gameData)
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
      if (!confirm(`Delete card "${selectedCard.name}"?`)) return
      
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

  const handleFontsChange = async (newFonts: Record<string, any>) => {
    if (!gameId || !game) return
    const updatedTemplate = { ...game.template, fonts: newFonts }
    try {
      setStatus('Saving fonts...')
      await storage.saveTemplate(gameId, updatedTemplate)
      setGame({ ...game, template: updatedTemplate })
      setStatus('Fonts saved.')
    } catch (error) {
      setStatus('Error saving fonts.')
      console.error(error)
    }
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

  const handleNodeSelect = (id: string) => {
    setSelectedNodeId(id)
    setSelectedProperty(null)
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
    } else if (property === 'attachTargetType') {
      if (!node.attach) node.attach = { targetType: 'section', targetId: '', anchor: { x: 0, y: 0 } }
      node.attach.targetType = value
    } else if (property === 'attachTargetId') {
      if (!node.attach) node.attach = { targetType: 'section', targetId: '', anchor: { x: 0, y: 0 } }
      node.attach.targetId = value
    } else {
      node[property] = value
    }

    handleTemplateSave(t)
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
      <header className="border-b bg-background px-7 py-5">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-xs font-medium uppercase tracking-[3px] text-muted-foreground">
              Boardgame Studio
            </p>
            <h1 className="mt-1.5 font-['Fraunces'] text-3xl font-bold">
              {game.name}
            </h1>
          </div>
          <div className="flex items-center gap-3">
            <div className="text-sm text-muted-foreground">{status}</div>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-7xl px-7 py-6">
        <Card className="mb-4">
          <CardContent className="flex gap-2 pt-6">
            <Button variant="outline" onClick={() => navigate('/')}>
              Back to Games
            </Button>
            <Button variant="outline" disabled>
              Rename Game
            </Button>
            <Button variant="destructive" disabled>
              Delete Game
            </Button>
            <Button variant="outline" disabled>
              Print Sheets
            </Button>
          </CardContent>
        </Card>

        <div className="grid grid-cols-[240px_1fr] gap-6">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0">
              <CardTitle className="text-base">Cards</CardTitle>
              <Button size="sm" onClick={handleCreateCard}>
                New
              </Button>
            </CardHeader>
            <CardContent className="space-y-2">
              {cards.map((card) => (
                <button
                  key={card.id}
                  onClick={() => selectCard(storage, card.id)}
                  className={`w-full rounded-lg border px-3 py-2.5 text-left text-sm font-medium transition-colors ${
                    selectedCard?.id === card.id
                      ? 'bg-accent text-accent-foreground'
                      : 'bg-card hover:bg-accent/50'
                  }`}
                >
                  {card.name}
                </button>
              ))}
            </CardContent>
          </Card>

          <div className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle>Card Editor</CardTitle>
              </CardHeader>
              <CardContent>
                {selectedCard && (
                  <Tabs defaultValue="card" className="w-full">
                    <TabsList className="mb-4">
                      <TabsTrigger value="card">Edit Card Data</TabsTrigger>
                      <TabsTrigger value="layout">Edit Layout</TabsTrigger>
                    </TabsList>
                    
                    <TabsContent value="card">
                      <div className="grid grid-cols-[1fr_360px] gap-6">
                        <div className="space-y-4">
                          <div className="space-y-2">
                            <Label>Name</Label>
                            <Input
                              value={selectedCard.name || ''}
                              onChange={(e) => updateCardField('name', e.target.value)}
                            />
                          </div>
                          
                          {game?.template?.root && (() => {
                            const textItems: any[] = []
                            const collectTextItems = (section: any) => {
                              section.items?.forEach((item: any) => {
                                if (!item.type || item.type === 'text') textItems.push(item)
                              })
                              section.children?.forEach(collectTextItems)
                            }
                            collectTextItems(game.template.root)
                            const fontSlots = Object.keys(game.template.fonts ?? {})
                            if (textItems.length === 0 || fontSlots.length === 0) return null
                            return (
                              <div className="space-y-2 mt-4">
                                <Label>Text Item Fonts</Label>
                                {textItems.map((item: any) => (
                                  <div key={item.id} className="flex items-center gap-2 text-sm">
                                    <span className="w-24 truncate text-muted-foreground">{item.name}</span>
                                    <select
                                      value={item.font ?? fontSlots[0] ?? ''}
                                      onChange={(e) => {
                                        const updatedTemplate = JSON.parse(JSON.stringify(game.template))
                                        const findAndUpdate = (section: any) => {
                                          section.items?.forEach((i: any) => {
                                            if (i.id === item.id) i.font = e.target.value
                                          })
                                          section.children?.forEach(findAndUpdate)
                                        }
                                        findAndUpdate(updatedTemplate.root)
                                        handleTemplateSave(updatedTemplate)
                                      }}
                                      className="rounded-md border bg-background px-2 py-1 text-sm"
                                    >
                                      {fontSlots.map((slot) => (
                                        <option key={slot} value={slot}>{slot} ({game.template.fonts[slot]?.name})</option>
                                      ))}
                                    </select>
                                  </div>
                                ))}
                              </div>
                            )
                          })()}

                          <div className="flex gap-2">
                            <Button onClick={handleSaveCard}>Save Card</Button>
                            <Button variant="destructive" onClick={handleDeleteCard}>
                              Delete Card
                            </Button>
                          </div>
                        </div>

                        <div className="flex items-start justify-center">
                          <div className="rounded-lg border bg-card p-3 shadow-inner">
                            {cardPreview && (
                              <img
                                src={cardPreview}
                                alt="Card preview"
                                className="max-w-full"
                              />
                            )}
                          </div>
                        </div>
                      </div>
                    </TabsContent>
                    
                    <TabsContent value="layout">
                      <div className="space-y-6">
                        <FontManager
                          gameId={gameId!}
                          fonts={game?.template?.fonts ?? {}}
                          onFontsChange={handleFontsChange}
                        />
                        <hr className="border-border" />
                        <div className="grid grid-cols-[1fr_360px] gap-6">
                          <div className="space-y-4">
                            <TemplateActions
                              template={game.template}
                              selectedNodeId={selectedNodeId}
                              onTemplateChange={handleTemplateSave}
                              onSelectNode={setSelectedNodeId}
                            />
                            {game.template?.root && (
                              <NodeTree
                                root={game.template.root}
                                selectedNodeId={selectedNodeId}
                                onSelectNode={handleNodeSelect}
                              />
                            )}
                            {selectedNodeId && (
                              <PropertyPanel
                                template={game.template}
                                selectedNodeId={selectedNodeId}
                                selectedProperty={selectedProperty}
                                onSelectProperty={setSelectedProperty}
                                onPropertyChange={handlePropertyChange}
                              />
                            )}
                          </div>
                          <div className="flex items-start justify-center">
                            <div className="rounded-lg border bg-card p-3 shadow-inner">
                              {templatePreview && (
                                <img
                                  src={templatePreview}
                                  alt="Template preview"
                                  className="max-w-full"
                                />
                              )}
                            </div>
                          </div>
                        </div>
                      </div>
                    </TabsContent>
                  </Tabs>
                )}
                {!selectedCard && (
                  <div className="text-center text-muted-foreground py-8">
                    Select a card or create a new one to start editing
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
        </div>
      </main>
    </div>
  )
}
