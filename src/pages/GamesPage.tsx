import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { Pencil, Plus, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import ConfirmButton from '@/components/ConfirmButton'
import FontManager, { FontPreview, FontPreviewEditor, defaultPreviewText } from '@/components/FontManager'

import { createStorage } from '../storage'

export default function GamesPage() {
  const [games, setGames] = useState<any[]>([])
  const [status, setStatus] = useState('Ready.')
  const [storage, setStorage] = useState<any>(null)
  const [isAuthorized, setIsAuthorized] = useState(false)
  const [expandedGame, setExpandedGame] = useState<string | null>(null)
  const [fonts, setFonts] = useState<Record<string, any>>({})
  const [showAddFont, setShowAddFont] = useState(false)
  const [selectedFont, setSelectedFont] = useState<string | null>(null)
  const [previewText, setPreviewText] = useState(defaultPreviewText)
  const navigate = useNavigate()

  useEffect(() => {
    const initStorage = async () => {
      try {
        const s = await createStorage()
        setStorage(s)
        setIsAuthorized(s.isAuthorized())
        loadGames(s)
        fetch('/api/fonts').then(r => r.json()).then(setFonts).catch(() => {})
      } catch (error) {
        setStatus('Error initializing storage.')
        console.error('Storage initialization failed:', error)
      }
    }
    initStorage()
  }, [])

  const loadGames = async (s: any) => {
    try {
      setStatus('Loading games...')
      const gameList = await s.listGames()
      setGames(gameList)
      setStatus(`Loaded ${gameList.length} games.`)
    } catch (error) {
      setStatus('Error loading games.')
      console.error(error)
    }
  }

  const handleCreateGame = async () => {
    if (!storage) {
      setStatus('Storage not initialized.')
      return
    }
    try {
      setStatus('Creating game...')
      const name = `Game ${games.length + 1}`
      const created = await storage.createGame(name)
      navigate(`/game/${created.id}`)
    } catch (error) {
      setStatus('Error creating game.')
      console.error(error)
    }
  }

  const handleConnectDrive = async () => {
    if (!storage) {
      setStatus('Storage not initialized.')
      return
    }
    try {
      await storage.signIn()
      setIsAuthorized(storage.isAuthorized())
      await loadGames(storage)
    } catch (error) {
      setStatus('Error connecting to Drive.')
      console.error(error)
    }
  }

  const handleDisconnect = async () => {
    if (!storage) return
    try {
      await storage.signOut()
      setIsAuthorized(false)
      setGames([])
      setStatus('Disconnected.')
    } catch (error) {
      console.error(error)
    }
  }

  return (
    <div className="min-h-screen">
      <header className="border-b bg-background px-4 py-2 md:px-7">
        <div className="flex items-center gap-3">
          <h1 className="text-lg font-semibold">Boardgame Studio</h1>
          <div className="ml-auto flex items-center gap-2">
            <span className="text-sm text-muted-foreground hidden sm:inline">{status}</span>
            {!isAuthorized ? (
              <Button size="sm" variant="outline" onClick={handleConnectDrive}>
                Connect Drive
              </Button>
            ) : (
              <Button size="sm" variant="outline" onClick={handleDisconnect}>
                Disconnect
              </Button>
            )}
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-4xl px-7 py-6">
        <Tabs defaultValue={localStorage.getItem('gamesPage:tab') || 'games'} onValueChange={(v) => localStorage.setItem('gamesPage:tab', v)} className="w-full">
          <TabsList className="mb-4">
            <TabsTrigger value="games">Games</TabsTrigger>
            <TabsTrigger value="fonts">Fonts</TabsTrigger>
          </TabsList>

          <TabsContent value="games">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0">
            <CardTitle>Games</CardTitle>
            <Button size="sm" variant="ghost" onClick={handleCreateGame} title="New game">
              <Plus className="h-4 w-4" />
            </Button>
          </CardHeader>
          <CardContent className="space-y-4 overflow-y-auto max-h-[60vh]">
            <div className="space-y-2">
              {games.map((game) => (
                <div
                  key={game.id}
                  className={`rounded-lg border bg-card cursor-pointer ${expandedGame === game.id ? 'ring-2 ring-inset ring-primary' : ''}`}
                  onClick={() => setExpandedGame(expandedGame === game.id ? null : game.id)}
                >
                  <div className="px-3 py-2.5 font-medium">
                    {game.name}
                  </div>
                  {expandedGame === game.id && (
                    <div className="flex gap-2 border-t px-3 py-2" onClick={(e) => e.stopPropagation()}>
                      <Button size="sm" variant="outline" onClick={() => navigate(`/game/${game.id}`)} title="Edit">
                        <Pencil className="h-4 w-4" />
                      </Button>
                      <ConfirmButton onConfirm={async () => {
                        const prev = games
                        setGames(games.filter(g => g.id !== game.id))
                        setExpandedGame(null)
                        try {
                          await storage.deleteGame(game.id)
                        } catch {
                          setGames(prev)
                          setStatus('Error deleting game.')
                        }
                      }} />
                    </div>
                  )}
                </div>
              ))}
              {games.length === 0 && (
                <p className="text-sm text-muted-foreground">No games yet. Create one below!</p>
              )}
            </div>
          </CardContent>
        </Card>
          </TabsContent>

          <TabsContent value="fonts">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              <Card>
                <CardHeader className="flex flex-row items-center justify-between space-y-0">
                  <CardTitle>Fonts</CardTitle>
                  <Button size="sm" variant="ghost" onClick={() => setShowAddFont(!showAddFont)} title={showAddFont ? 'Cancel' : 'New font'}>
                    {showAddFont ? <X className="h-4 w-4" /> : <Plus className="h-4 w-4" />}
                  </Button>
                </CardHeader>
                <CardContent>
                  <FontManager
                    fonts={fonts}
                    onFontsChange={setFonts}
                    onStatus={setStatus}
                    showAdd={showAddFont}
                    onToggleAdd={() => setShowAddFont(!showAddFont)}
                    selectedFont={selectedFont}
                    onSelectFont={setSelectedFont}
                  />
                </CardContent>
              </Card>
              <FontPreviewEditor previewText={previewText} onChangePreviewText={setPreviewText} />
              <FontPreview fonts={fonts} selectedFont={selectedFont} previewText={previewText} />
            </div>
          </TabsContent>
        </Tabs>
      </main>
    </div>
  )
}
