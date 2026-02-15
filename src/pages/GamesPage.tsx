import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { createStorage } from '../storage'

export default function GamesPage() {
  const [games, setGames] = useState<any[]>([])
  const [newGameName, setNewGameName] = useState('')
  const [status, setStatus] = useState('Ready.')
  const [storage, setStorage] = useState<any>(null)
  const [isAuthorized, setIsAuthorized] = useState(false)
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
    if (!newGameName.trim()) return
    if (!storage) {
      setStatus('Storage not initialized.')
      return
    }
    try {
      setStatus('Creating game...')
      await storage.createGame(newGameName.trim())
      setNewGameName('')
      await loadGames(storage)
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
          <CardHeader>
            <CardTitle>Games</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              {games.map((game) => (
                <button
                  key={game.id}
                  onClick={() => navigate(`/game/${game.id}`)}
                  className="w-full rounded-lg border bg-card px-3 py-2.5 text-left font-medium transition-colors hover:bg-accent hover:text-accent-foreground"
                >
                  {game.name}
                </button>
              ))}
              {games.length === 0 && (
                <p className="text-sm text-muted-foreground">No games yet. Create one below!</p>
              )}
            </div>
            <div className="flex gap-2">
              <Input
                value={newGameName}
                onChange={(e) => setNewGameName(e.target.value)}
                placeholder="New game name"
                onKeyDown={(e) => e.key === 'Enter' && handleCreateGame()}
              />
              <Button onClick={handleCreateGame}>Create</Button>
            </div>
          </CardContent>
        </Card>
      </main>
    </div>
  )
}
