import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
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
      <header className="border-b bg-background px-7 py-5">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-xs font-medium uppercase tracking-[3px] text-muted-foreground">
              Boardgame Studio
            </p>
            <h1 className="mt-1.5 font-['Fraunces'] text-3xl font-bold">
              Asset Editor
            </h1>
          </div>
          <div className="flex items-center gap-3">
            <div className="text-sm text-muted-foreground">{status}</div>
            <div className="flex gap-2">
              {!isAuthorized ? (
                <Button variant="outline" onClick={handleConnectDrive}>
                  Connect Drive
                </Button>
              ) : (
                <Button variant="outline" onClick={handleDisconnect}>
                  Disconnect
                </Button>
              )}
            </div>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-4xl px-7 py-6">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0">
            <CardTitle>Games</CardTitle>
            <Button size="sm" onClick={handleCreateGame}>
              New
            </Button>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              {games.map((game) => (
                <div
                  key={game.id}
                  className={`rounded-lg border bg-card cursor-pointer ${expandedGame === game.id ? 'ring-1 ring-primary' : ''}`}
                  onClick={() => setExpandedGame(expandedGame === game.id ? null : game.id)}
                >
                  <div className="px-3 py-2.5 font-medium">
                    {game.name}
                  </div>
                  {expandedGame === game.id && (
                    <div className="flex gap-2 border-t px-3 py-2" onClick={(e) => e.stopPropagation()}>
                      <Button size="sm" onClick={() => navigate(`/game/${game.id}`)}>
                        Edit
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => window.open(`/print/${game.id}`, '_blank')}
                      >
                        Print
                      </Button>
                      <ConfirmButton onConfirm={async () => {
                        try {
                          await storage.deleteGame(game.id)
                          await loadGames(storage)
                          setStatus('Game deleted.')
                        } catch {
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
