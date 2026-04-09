import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { Pencil, Plus, Printer, Download } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import ConfirmButton from '@/components/ConfirmButton'

import { createStorage } from '../storage'

export default function GamesPage() {
  const [games, setGames] = useState<any[]>([])
  const [status, setStatus] = useState('Ready.')
  const [storage, setStorage] = useState<any>(null)
  const [isAuthorized, setIsAuthorized] = useState(false)
  const [expandedGame, setExpandedGame] = useState<string | null>(null)
  const navigate = useNavigate()

  useEffect(() => {
    const initStorage = async () => {
      try {
        const s = await createStorage()
        setStorage(s)
        setIsAuthorized(s.isAuthorized())
        loadGames(s)
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
            <Button size="sm" variant="outline" onClick={() => navigate('/settings')}>
              Settings
            </Button>
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
                      <Button size="sm" variant="outline" onClick={() => navigate(`/game/${game.id}/print`)} title="Print all">
                        <Printer className="h-4 w-4" />
                      </Button>
                      <Button size="sm" variant="outline" onClick={() => navigate(`/game/${game.id}/export/tts`)} title="Export for Tabletop Simulator">
                        <Download className="h-4 w-4" />
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
      </main>
    </div>
  )
}
