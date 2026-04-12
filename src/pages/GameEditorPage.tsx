import { useState, useEffect } from 'react'
import { ArrowLeft, Copy, Plus, Check } from 'lucide-react'
import { useParams, useNavigate } from 'react-router-dom'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { ValueItemEditor, getEditorType } from '@/components/layout/ControlPanel'
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
import FilesPanel from '@/components/FilesPanel'
import ImportPanel from '@/components/ImportPanel'
import ZipMergePanel from '@/components/ZipMergePanel'
import CollapsibleHeader, { useCollapsible } from '@/components/ui/CollapsibleHeader'

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
  const [editingColName, setEditingColName] = useState(false)
  const [savedCardJson, setSavedCardJson] = useState('')
  const [gameFonts, setGameFonts] = useState<Record<string, { name: string; file: string }>>({})
  const [gameImages, setGameImages] = useState<{ file: string; url: string; name: string }[]>([])
  const [allLayouts, setAllLayouts] = useState<any[]>([])
  const [cardThumbnails, setCardThumbnails] = useState<Record<string, string>>({})
  const [showCreateForm, setShowCreateForm] = useState(false)
  const [newCardName, setNewCardName] = useState('')
  const cardEditor = useCollapsible()
  const lsKey = (suffix: string) => `editor:${gameId}:${collectionId}:${suffix}`
  const loadSet = (suffix: string) => { try { const v = localStorage.getItem(lsKey(suffix)); return v ? new Set<string>(JSON.parse(v)) : new Set<string>() } catch { return new Set<string>() } }
  const [cardSelection, _setCardSelection] = useState<Set<string>>(() => loadSet('cardSel'))

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
        setCardPreview((prev) => { if (prev) URL.revokeObjectURL(prev); return blobUrl })
      } catch (error) {
        if (!cancelled) console.error('Error updating card preview:', error)
      }
    }, 100)
    return () => { cancelled = true; clearTimeout(timer) }
  }, [selectedCard, game?.layout, gameId, collection?.back])

  // Generate thumbnails for detailed/gallery views
  useEffect(() => {
    if (!game?.layout || !gameId || cards.length === 0) return
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
  }, [cards, game?.layout, gameId])

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

      const [layout, fonts, images, layouts] = await Promise.all([
        s.getLayout(gameId, col.layoutId),
        s.listFonts(gameId),
        s.listImages?.(gameId).catch(() => []) ?? [],
        s.listLayouts(gameId),
      ])
      gameData.layout = layout
      setGame(gameData)
      setGameFonts(fonts)
      setGameImages(images)
      setAllLayouts(layouts)
      // selectedNodeId is now managed inside LayoutEditorPanel

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

  const handleCreateCard = async (name?: string) => {
    if (!gameId || !collectionId) return
    const cardName = name?.trim() || `New Card ${cards.length + 1}`
    const newCard = { id: crypto.randomUUID(), name: cardName, fields: {} }
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
                await storage.updateCollection(gameId, collectionId, { name })
                setCollection((prev: any) => ({ ...prev, name }))
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
        <Tabs defaultValue={localStorage.getItem(`editor:${gameId}:tab`) || 'cards'} onValueChange={(v) => localStorage.setItem(`editor:${gameId}:tab`, v)} className="w-full">
          <TabsList className="mb-4">
            <TabsTrigger value="cards">Cards</TabsTrigger>
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
                selectedKey={selectedCard?.id ?? null}
                onSelect={(key) => { if (key) selectCard(storage, key); else setSelectedCard(null) }}
                actions={selectedCard && (<>
                  <button className="rounded p-1 text-muted-foreground hover:text-primary transition-colors" title="Copy" onClick={async () => {
                    const card = selectedCard
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
                  </button>
                  <ConfirmButton iconOnly onConfirm={handleDeleteCard} />
                </>)}
                toolbar={
                  <Button size="sm" variant="ghost" onClick={() => { setShowCreateForm(v => { if (!v) setNewCardName(`Card ${cards.length + 1}`); else setNewCardName(''); return !v }) }} title={showCreateForm ? 'Cancel' : 'New card'}>
                    <Plus className={`h-4 w-4 transition-transform ${showCreateForm ? 'rotate-45' : ''}`} />
                  </Button>
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
                renderItem={(card: any, vm) => vm === 'gallery' ? (
                  <CardThumbnail
                    src={cardThumbnails[card.id] ?? ''}
                    name={card.name ?? ''}
                    selected={selectedCard?.id === card.id}
                    onClick={() => selectCard(storage, card.id)}
                  />
                ) : (
                  <ListItem
                    selected={selectedCard?.id === card.id}
                    onClick={() => selectCard(storage, card.id)}
                  >
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
                        onChange={(e) => updateCardField('name', e.target.value)}
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
                          setSelectedCard((prev: any) => ({ ...prev, fields: { ...prev.fields, [fieldKey]: val } }))

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
                                        const url = await storage.uploadImage(gameId, file)
                                        const imgs = await storage.listImages?.(gameId).catch(() => []) ?? []
                                        setGameImages(imgs)
                                        return url
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

          <TabsContent value="layout">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 items-start">
              {game.layout?.root && allLayouts.length > 0 && (
                <div className="px-2 py-1.5">
                  <select
                    value={collection?.layoutId ?? ''}
                    onChange={async (e) => {
                      const newLayoutId = e.target.value
                      if (!gameId || !collectionId || newLayoutId === collection?.layoutId) return
                      const prevCollection = collection
                      const prevGame = game
                      setCollection((prev: any) => ({ ...prev, layoutId: newLayoutId }))
                      try {
                        await storage.updateCollection(gameId, collectionId, { layoutId: newLayoutId })
                        const newLayout = await storage.getLayout(gameId, newLayoutId)
                        setGame((prev: any) => ({ ...prev, layout: newLayout }))
                      } catch {
                        setCollection(prevCollection)
                        setGame(prevGame)
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
                    const url = await storage.uploadImage(gameId, file)
                    const imgs = await storage.listImages?.(gameId).catch(() => []) ?? []
                    setGameImages(imgs)
                    return url
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
                    <FloatingSelect
                      label="Fit Mode"
                      value={collection?.backFit || 'cover'}
                      onValueChange={async (fit) => {
                        setCollection((prev: any) => ({ ...prev, backFit: fit }))
                        try { await storage.updateCollection(gameId, collectionId, { backFit: fit }) }
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
              <div>
                <Label className="text-sm font-medium">Merge from zip</Label>
                <p className="text-xs text-muted-foreground mb-2">Load a zip to preview and selectively merge layouts, collections, cards, fonts, and images.</p>
                <ZipMergePanel
                  gameId={gameId!}
                  storage={storage}
                  layouts={game?.layout ? [game.layout] : []}
                  collections={collection ? [collection] : []}
                  gameFonts={gameFonts}
                  gameImages={gameImages}
                  onStatusChange={setStatus}
                  onComplete={() => loadGame(storage)}
                />
              </div>
              <div className="border-t pt-4">
                <Label className="text-sm font-medium">Import cards from CSV</Label>
                <p className="text-xs text-muted-foreground mb-2">Load a CSV to preview and selectively import cards.</p>
                <ImportPanel
                  gameId={gameId!}
                  collectionId={collectionId}
                  cards={cards}
                  layout={game?.layout}
                  gameFonts={gameFonts}
                  storage={storage}
                  collections={collection ? [collection] : []}
                  onStatusChange={setStatus}
                  onCardsChange={() => loadGame(storage)}
                />
              </div>
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
              storage={storage}
              back={collection?.back}
              backFit={collection?.backFit}
              onStatusChange={setStatus}
              onCardsChange={() => loadGame(storage)}
            />
          </TabsContent>
        </Tabs>
    </PageLayout>
  )
}
