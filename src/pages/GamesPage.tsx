import { useState, useEffect } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { useQueryClient } from '@tanstack/react-query'
import { Pencil, Plus, Printer, Upload, Archive, Check, Copy } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Checkbox } from '@/components/ui/checkbox'
import CollapsibleHeader, { useCollapsible } from '@/components/ui/CollapsibleHeader'
import ConfirmButton from '@/components/ConfirmButton'
import ListItem from '@/components/ListItem'
import FilterableList from '@/components/FilterableList'
import PageLayout from '@/components/PageLayout'
import useStorage from '../hooks/useStorage'
import { useGames, useCreateGame, useDeleteGame, queryKeys } from '../hooks/useGameData'
import { exportGameZip, importGameZip } from '../gameZip'
import { getProvider, setProvider, createStorageFor, BACKENDS, type BackendKey } from '../storage'
import { config } from '../config'

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  const { collapsed, toggle } = useCollapsible()
  return (
    <div className="rounded-lg border bg-card">
      <CollapsibleHeader collapsed={collapsed} onToggle={toggle}>
        <span className="text-sm font-semibold">{title}</span>
      </CollapsibleHeader>
      {!collapsed && children}
    </div>
  )
}

export default function GamesPage() {
  const [expandedGame, _setExpandedGame] = useState<string | null>(() => localStorage.getItem('games:selectedGame'))
  const setExpandedGame = (id: string | null) => { _setExpandedGame(id); if (id) localStorage.setItem('games:selectedGame', id); else localStorage.removeItem('games:selectedGame') }
  const navigate = useNavigate()
  const [searchParams, setSearchParams] = useSearchParams()
  const tab = searchParams.get('tab') || 'games'
  const { storage, status, setStatus, setError, errorDetail, clearError } = useStorage()
  const queryClient = useQueryClient()

  const { data: games = [] } = useGames()
  const createGame = useCreateGame()
  const deleteGame = useDeleteGame()

  // Auto-select first game when list loads
  useEffect(() => {
    if (games.length > 0 && (!expandedGame || !games.some((g: any) => g.id === expandedGame))) {
      setExpandedGame(games[0].id)
    }
  }, [games])

  const handleCreateGame = async () => {
    if (!storage) {
      setStatus('Storage not initialized.')
      return
    }
    try {
      setStatus('Creating game...')
      const name = `Game ${games.length + 1}`
      const created = await createGame.mutateAsync(name)
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
      const game = games.find((g: any) => g.id === gameId)
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
        const newGameId = await importGameZip(storage, file, setStatus)
        queryClient.invalidateQueries({ queryKey: queryKeys.games() })
        setExpandedGame(newGameId)
        setStatus('Import complete.')
      } catch (err) {
        setError('Import error', err)
      }
    }
    input.click()
  }

  // Settings state
  const [savedProvider] = useState<string>(getProvider())
  const [selectedProvider, setSelectedProvider] = useState<string>(getProvider())
  const [serverReachable, setServerReachable] = useState<boolean | null>(null)
  const [migrateFrom, setMigrateFrom] = useState<BackendKey>('localFile')
  const [migrateTo, setMigrateTo] = useState<BackendKey>('indexedDB')
  const [fromGames, setFromGames] = useState<any[]>([])
  const [selectedGames, setSelectedGames] = useState<Set<string>>(new Set())
  const [loadingFromGames, setLoadingFromGames] = useState(false)
  const [migrationStatus, setMigrationStatus] = useState<string | null>(null)
  const [migrating, setMigrating] = useState(false)
  const [driveAuthorized, setDriveAuthorized] = useState(false)
  const [driveStorage, setDriveStorage] = useState<any>(null)
  const [s3Config, setS3Config] = useState(() => {
    try { return JSON.parse(localStorage.getItem('boardgame_assets_s3_config') ?? '{}') } catch { return {} }
  })
  const updateS3Field = (field: string, value: string) => {
    const next = { ...s3Config, [field]: value }
    setS3Config(next)
    localStorage.setItem('boardgame_assets_s3_config', JSON.stringify(next))
  }

  useEffect(() => {
    if (selectedProvider !== 'googleDrive') return
    const initDrive = async () => {
      try {
        const s = await createStorageFor('googleDrive')
        setDriveStorage(s)
        setDriveAuthorized(s.isAuthorized())
      } catch { /* skip */ }
    }
    initDrive()
  }, [selectedProvider])

  useEffect(() => {
    fetch('/api/games', { method: 'HEAD' })
      .then(() => setServerReachable(true))
      .catch(() => setServerReachable(false))
    loadFromGames(migrateFrom)
  }, [])

  const handleSelectProvider = (key: string) => {
    if (getBackendStatus(key).unavailable) return
    setSelectedProvider(key)
  }

  const handleApplyProvider = () => {
    setProvider(selectedProvider)
    window.location.reload()
  }

  const providerChanged = selectedProvider !== savedProvider

  const loadFromGames = async (backendKey: BackendKey) => {
    setLoadingFromGames(true)
    setFromGames([])
    setSelectedGames(new Set())
    setMigrationStatus(null)
    try {
      const s = await createStorageFor(backendKey)
      const g = await s.listGames()
      setFromGames(g)
    } catch (err) {
      console.error('Failed to load games from backend:', err)
      setMigrationStatus('Failed to load games from source backend.')
    } finally {
      setLoadingFromGames(false)
    }
  }

  const handleFromChange = (key: BackendKey) => {
    setMigrateFrom(key)
    loadFromGames(key)
  }

  const toggleGame = (id: string) => {
    setSelectedGames(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const handleCopy = async () => {
    if (selectedGames.size === 0) return
    setMigrating(true)
    setMigrationStatus(`Copying ${selectedGames.size} game(s)...`)
    try {
      const srcStorage = await createStorageFor(migrateFrom)
      const dstStorage = await createStorageFor(migrateTo)
      let copied = 0
      for (const gameId of selectedGames) {
        setMigrationStatus(`Exporting game ${copied + 1}/${selectedGames.size}...`)
        const zipBlob = await exportGameZip(srcStorage, gameId, setMigrationStatus)
        setMigrationStatus(`Importing game ${copied + 1}/${selectedGames.size}...`)
        await importGameZip(dstStorage, zipBlob, setMigrationStatus)
        copied++
      }
      setMigrationStatus(`Done. ${copied} game(s) copied to ${BACKENDS.find(b => b.key === migrateTo)?.name}.`)
    } catch (err) {
      console.error('Migration failed:', err)
      setMigrationStatus('Migration failed. Check console for details.')
    } finally {
      setMigrating(false)
    }
  }

  const gdClientId = (config?.storage as any)?.googleDrive?.clientId ?? ''
  const gdConfigured = gdClientId.length > 10 && gdClientId.includes('.')
  const s3Configured = !!(s3Config.bucket && s3Config.region && s3Config.accessKeyId && s3Config.secretAccessKey)

  const getBackendStatus = (key: string): { unavailable: boolean; configured: boolean; reason?: string } => {
    if (key === 'localFile' && serverReachable === false) return { unavailable: true, configured: false, reason: 'Server not reachable' }
    if (key === 'googleDrive' && !gdConfigured) return { unavailable: true, configured: false, reason: 'Client ID not set in config' }
    if (key === 's3' && !s3Configured) return { unavailable: false, configured: false, reason: 'Not configured' }
    return { unavailable: false, configured: true }
  }

  return (
    <PageLayout
      header={<>
        <h1 className="text-lg font-semibold">Boardgame Studio</h1>
        <div className="ml-auto flex items-center gap-2">
          <span className="text-sm text-muted-foreground hidden sm:inline">{status}</span>
        </div>
      </>}
      errorDetail={errorDetail}
      onDismissError={clearError}
      maxWidth="max-w-4xl"
    >
      <Tabs value={tab} onValueChange={(v) => setSearchParams({ tab: v }, { replace: true })}>
        <TabsList>
          <TabsTrigger value="games">Games</TabsTrigger>
          <TabsTrigger value="settings">Storage</TabsTrigger>
        </TabsList>

        <TabsContent value="games">
          <FilterableList
            title="Games"
            items={games}
            getKey={(game: any) => game.id}
            getName={(game: any) => game.name}
            selectedKey={expandedGame}
            onSelect={setExpandedGame}
            empty={!storage
              ? <p className="text-sm text-muted-foreground animate-pulse">Connecting to storage...</p>
              : <p className="text-sm text-muted-foreground">No games yet. Create one!</p>
            }
            toolbar={<>
              <Button size="sm" variant="ghost" onClick={handleImport} title="Import zip" disabled={!storage}>
                <Upload className="h-4 w-4" />
              </Button>
              <Button size="sm" variant="ghost" onClick={handleCreateGame} title="New game" disabled={!storage}>
                <Plus className="h-4 w-4" />
              </Button>
            </>}
            actions={expandedGame ? (() => {
              const game = games.find(g => g.id === expandedGame)
              if (!game) return undefined
              return <>
                <button className="rounded p-1 text-muted-foreground hover:text-foreground transition-colors" onClick={() => navigate(`/game/${game.id}`)} title="Edit">
                  <Pencil className="h-4 w-4" />
                </button>
                <button className="rounded p-1 text-muted-foreground hover:text-foreground transition-colors" onClick={() => navigate(`/game/${game.id}/print`)} title="Print all">
                  <Printer className="h-4 w-4" />
                </button>
                <button className="rounded p-1 text-muted-foreground hover:text-foreground transition-colors" onClick={() => handleExport(game.id)} title="Download zip">
                  <Archive className="h-4 w-4" />
                </button>
                <ConfirmButton iconOnly onConfirm={async () => {
                  try {
                    const idx = games.findIndex((g: any) => g.id === game.id)
                    await deleteGame.mutateAsync(game.id)
                    // After invalidation, pick next selection
                    const remaining = games.filter((g: any) => g.id !== game.id)
                    const nextIdx = Math.min(idx, remaining.length - 1)
                    setExpandedGame(remaining[nextIdx]?.id ?? null)
                  } catch (err) {
                    setError('Error deleting game', err)
                  }
                }} />
              </>
            })() : undefined}
            renderItem={(game: any, _vm, selected) => (
              <ListItem selected={selected}>
                <span className="font-medium">{game.name}</span>
              </ListItem>
            )}
          />
        </TabsContent>

        <TabsContent value="settings">
          <div className="space-y-4">
            <Section title="Storage Backend">
              <div className="space-y-3 p-3">
                {BACKENDS.map(backend => {
                  const { unavailable, reason } = getBackendStatus(backend.key)
                  const isSelected = selectedProvider === backend.key
                  const isSaved = savedProvider === backend.key
                  return (
                    <div
                      key={backend.key}
                      onClick={() => !unavailable && handleSelectProvider(backend.key)}
                      className={[
                        'flex items-center gap-3 rounded-lg border px-4 py-3 transition-colors',
                        unavailable ? 'opacity-50 cursor-not-allowed bg-destructive/5' : reason ? 'cursor-pointer hover:bg-muted/50 bg-amber-500/5' : 'cursor-pointer hover:bg-muted/50',
                        isSelected ? 'ring-2 ring-primary' : '',
                      ].join(' ')}
                    >
                      <backend.icon className="h-5 w-5 text-muted-foreground flex-shrink-0" />
                      <div className="flex-1 min-w-0">
                        <div className="font-medium">{backend.name}{reason && <span className={`ml-2 text-xs font-normal ${unavailable ? 'text-destructive' : 'text-amber-500'}`}>({reason})</span>}</div>
                        <div className="text-sm text-muted-foreground">{backend.description}</div>
                      </div>
                      {isSaved && <Check className="h-4 w-4 text-primary flex-shrink-0" />}
                    </div>
                  )
                })}
                {providerChanged && (() => {
                  const { unavailable, configured } = getBackendStatus(selectedProvider)
                  const canSwitch = !unavailable && configured
                  return (
                    <Button onClick={handleApplyProvider} className="w-full" disabled={!canSwitch}>
                      Switch to {BACKENDS.find(b => b.key === selectedProvider)?.name}
                    </Button>
                  )
                })()}
              </div>
            </Section>

            {selectedProvider === 'googleDrive' && (
              <Section title="Google Drive">
                <div className="p-3">
                  {!gdConfigured ? (
                    <p className="text-sm text-muted-foreground">Set a valid <code className="text-xs bg-muted px-1 py-0.5 rounded">clientId</code> in <code className="text-xs bg-muted px-1 py-0.5 rounded">src/config.ts</code> to enable Google Drive.</p>
                  ) : driveAuthorized ? (
                    <div className="flex items-center gap-3">
                      <span className="text-sm text-muted-foreground">Connected to Google Drive</span>
                      <Button size="sm" variant="outline" onClick={async () => {
                        if (!driveStorage) return
                        await driveStorage.signOut()
                        setDriveAuthorized(false)
                      }}>
                        Disconnect
                      </Button>
                    </div>
                  ) : (
                    <Button size="sm" onClick={async () => {
                      if (!driveStorage) return
                      try {
                        await driveStorage.signIn()
                        setDriveAuthorized(driveStorage.isAuthorized())
                      } catch (err: any) { setStatus(err.message || 'Failed to connect.') }
                    }}>
                      Connect Google Drive
                    </Button>
                  )}
                </div>
              </Section>
            )}

            {selectedProvider === 's3' && (
              <Section title="S3 Configuration">
                <div className="space-y-3 p-3">
                  {[
                    { key: 'bucket', label: 'Bucket', placeholder: 'my-bucket' },
                    { key: 'region', label: 'Region', placeholder: 'us-east-1' },
                    { key: 'accessKeyId', label: 'Access Key ID', placeholder: 'AKIA...' },
                    { key: 'secretAccessKey', label: 'Secret Access Key', placeholder: '••••••••', type: 'password' },
                    { key: 'endpoint', label: 'Endpoint (optional)', placeholder: 'https://s3.example.com' },
                    { key: 'prefix', label: 'Prefix (optional)', placeholder: 'boardgame-assets' },
                  ].map(({ key, label, placeholder, type }) => (
                    <div key={key} className="space-y-1">
                      <label className="text-sm font-medium">{label}</label>
                      <input
                        type={type ?? 'text'}
                        value={s3Config[key] ?? ''}
                        onChange={(e) => updateS3Field(key, e.target.value)}
                        placeholder={placeholder}
                        className="w-full rounded-md border bg-background px-3 py-2 text-sm"
                      />
                    </div>
                  ))}
                </div>
              </Section>
            )}

            <Section title="Copy Games Between Backends">
              <div className="space-y-4 p-3">
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1">
                    <label className="text-sm font-medium">From</label>
                    <select
                      className="w-full rounded-md border bg-background px-3 py-2 text-sm"
                      value={migrateFrom}
                      onChange={e => handleFromChange(e.target.value as BackendKey)}
                    >
                      {BACKENDS.map(b => {
                        const { unavailable, configured, reason } = getBackendStatus(b.key)
                        const off = unavailable || !configured
                        return <option key={b.key} value={b.key} disabled={off}>{b.name}{off && reason ? ` (${reason})` : ''}</option>
                      })}
                    </select>
                  </div>
                  <div className="space-y-1">
                    <label className="text-sm font-medium">To</label>
                    <select
                      className="w-full rounded-md border bg-background px-3 py-2 text-sm"
                      value={migrateTo}
                      onChange={e => setMigrateTo(e.target.value as BackendKey)}
                    >
                      {BACKENDS.map(b => {
                        const { unavailable, configured, reason } = getBackendStatus(b.key)
                        const off = unavailable || !configured
                        return <option key={b.key} value={b.key} disabled={off}>{b.name}{off && reason ? ` (${reason})` : ''}</option>
                      })}
                    </select>
                  </div>
                </div>

                {loadingFromGames && (
                  <p className="text-sm text-muted-foreground">Loading games...</p>
                )}

                {!loadingFromGames && fromGames.length > 0 && (
                  <div className="space-y-2">
                    <p className="text-sm font-medium">Select games to copy:</p>
                    <div className="space-y-1 max-h-48 overflow-y-auto">
                      {fromGames.map(game => (
                        <label key={game.id} className="flex items-center gap-2 cursor-pointer rounded px-2 py-1 hover:bg-muted/50">
                          <Checkbox
                            checked={selectedGames.has(game.id)}
                            onCheckedChange={() => toggleGame(game.id)}
                          />
                          <span className="text-sm">{game.name}</span>
                        </label>
                      ))}
                    </div>
                  </div>
                )}

                {!loadingFromGames && fromGames.length === 0 && !migrationStatus && (
                  <p className="text-sm text-muted-foreground">No games found in source backend.</p>
                )}

                <div className="flex items-center gap-3">
                  <Button
                    size="sm"
                    disabled={selectedGames.size === 0 || migrating}
                    onClick={handleCopy}
                  >
                    <Copy className="h-4 w-4 mr-2" />
                    Copy {selectedGames.size > 0 ? `${selectedGames.size} game${selectedGames.size > 1 ? 's' : ''}` : 'games'}
                  </Button>
                </div>

                {migrationStatus && (
                  <p className="text-sm text-muted-foreground">{migrationStatus}</p>
                )}
              </div>
            </Section>
          </div>
        </TabsContent>
      </Tabs>
    </PageLayout>
  )
}
