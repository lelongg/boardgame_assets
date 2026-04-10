import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { Pencil, Plus, Printer, Download, Upload, Archive } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import ConfirmButton from '@/components/ConfirmButton'
import ListItem from '@/components/ListItem'
import PageLayout from '@/components/PageLayout'
import useStorage from '../hooks/useStorage'
import { exportGameZip, importGameZip } from '../gameZip'

export default function GamesPage() {
  const [games, setGames] = useState<any[]>([])
  const [expandedGame, _setExpandedGame] = useState<string | null>(() => localStorage.getItem('games:selectedGame'))
  const setExpandedGame = (id: string | null) => { _setExpandedGame(id); if (id) localStorage.setItem('games:selectedGame', id); else localStorage.removeItem('games:selectedGame') }
  const navigate = useNavigate()
  const { storage, status, setStatus, setError, errorDetail, clearError } = useStorage()

  useEffect(() => {
    if (!storage) return
    loadGames(storage)
  }, [storage])

  const loadGames = async (s: any) => {
    try {
      setStatus('Loading games...')
      const gameList = await s.listGames()
      setGames(gameList)
      if (gameList.length > 0 && (!expandedGame || !gameList.some((g: any) => g.id === expandedGame))) {
        setExpandedGame(gameList[0].id)
      }
      setStatus(`Loaded ${gameList.length} games.`)
    } catch (error) {
      setError('Error loading games', error)
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
      setError('Error creating game', error)
    }
  }

  const handleExport = async (gameId: string) => {
    if (!storage) return
    setStatus('Exporting...')
    try {
      const blob = await exportGameZip(storage, gameId, setStatus)
      const game = games.find(g => g.id === gameId)
      const a = document.createElement('a')
      a.href = URL.createObjectURL(blob)
      a.download = `${game?.name ?? gameId}.zip`
      a.click()
      URL.revokeObjectURL(a.href)
      setStatus('Export complete.')
    } catch (err) {
      setError('Export error', err)
    }
  }

  const handleImport = () => {
    if (!storage) return
    const input = document.createElement('input')
    input.type = 'file'
    input.accept = '.zip'
    input.onchange = async () => {
      const file = input.files?.[0]
      if (!file) return
      setStatus('Importing...')
      try {
        await importGameZip(storage, file, setStatus)
        await loadGames(storage)
        setStatus('Import complete.')
      } catch (err) {
        setError('Import error', err)
      }
    }
    input.click()
  }

  return (
    <PageLayout
      header={<>
        <h1 className="text-lg font-semibold">Boardgame Studio</h1>
        <div className="ml-auto flex items-center gap-2">
          <span className="text-sm text-muted-foreground hidden sm:inline">{status}</span>
          <Button size="sm" variant="outline" onClick={() => navigate('/settings')}>
            Settings
          </Button>
        </div>
      </>}
      errorDetail={errorDetail}
      onDismissError={clearError}
      maxWidth="max-w-4xl"
    >
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0">
            <CardTitle>Games</CardTitle>
            <div className="flex gap-1">
              <Button size="sm" variant="ghost" onClick={handleImport} title="Import zip">
                <Upload className="h-4 w-4" />
              </Button>
              <Button size="sm" variant="ghost" onClick={handleCreateGame} title="New game">
                <Plus className="h-4 w-4" />
              </Button>
            </div>
          </CardHeader>
          <CardContent className="space-y-4 overflow-y-auto max-h-[60vh]">
            <div className="space-y-2">
              {games.map((game) => (
                <ListItem
                  key={game.id}
                  selected={expandedGame === game.id}
                  onClick={() => setExpandedGame(expandedGame === game.id ? null : game.id)}
                  actions={<>
                    <Button size="sm" variant="outline" onClick={() => navigate(`/game/${game.id}`)} title="Edit">
                      <Pencil className="h-4 w-4" />
                    </Button>
                    <Button size="sm" variant="outline" onClick={() => navigate(`/game/${game.id}/print`)} title="Print all">
                      <Printer className="h-4 w-4" />
                    </Button>
                    <Button size="sm" variant="outline" onClick={() => navigate(`/game/${game.id}/export/tts`)} title="Export for Tabletop Simulator">
                      <Download className="h-4 w-4" />
                    </Button>
                    <Button size="sm" variant="outline" onClick={() => handleExport(game.id)} title="Download zip">
                      <Archive className="h-4 w-4" />
                    </Button>
                    <ConfirmButton onConfirm={async () => {
                      const prev = games
                      setGames(games.filter(g => g.id !== game.id))
                      setExpandedGame(null)
                      try {
                        await storage.deleteGame(game.id)
                      } catch (err) {
                        setGames(prev)
                        setError('Error deleting game', err)
                      }
                    }} />
                  </>}
                >
                  <span className="font-medium">{game.name}</span>
                </ListItem>
              ))}
              {games.length === 0 && (
                <p className="text-sm text-muted-foreground">No games yet. Create one below!</p>
              )}
            </div>
          </CardContent>
        </Card>
    </PageLayout>
  )
}
