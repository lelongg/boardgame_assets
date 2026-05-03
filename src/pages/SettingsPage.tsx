import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { ArrowLeft, Check, Copy } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import PageLayout from '@/components/PageLayout'
import { getProvider, setProvider, createStorageFor, BACKENDS, type BackendKey } from '../storage'
import { exportGameZip, importGameZip } from '../gameZip'

export default function SettingsPage() {
  const navigate = useNavigate()
  const [savedProvider] = useState<string>(getProvider())
  const [selectedProvider, setSelectedProvider] = useState<string>(getProvider())
  const [serverReachable, setServerReachable] = useState<boolean | null>(null)

  // Migration state
  const [migrateFrom, setMigrateFrom] = useState<BackendKey>('localFile')
  const [migrateTo, setMigrateTo] = useState<BackendKey>('indexedDB')
  const [fromGames, setFromGames] = useState<any[]>([])
  const [selectedGames, setSelectedGames] = useState<Set<string>>(new Set())
  const [loadingFromGames, setLoadingFromGames] = useState(false)
  const [migrationStatus, setMigrationStatus] = useState<string | null>(null)
  const [migrating, setMigrating] = useState(false)

  // Google Drive auth state
  const [driveAuthorized, setDriveAuthorized] = useState(false)
  const [driveStorage, setDriveStorage] = useState<any>(null)

  // S3 config state
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
    if (key === 'localFile' && serverReachable === false) return
    setSelectedProvider(key)
  }

  const handleApplyProvider = () => {
    setProvider(selectedProvider)
    // Hard reload so the storage singleton is re-created for the new provider
    window.location.href = '/'
  }

  const providerChanged = selectedProvider !== savedProvider

  const loadFromGames = async (backendKey: BackendKey) => {
    setLoadingFromGames(true)
    setFromGames([])
    setSelectedGames(new Set())
    setMigrationStatus(null)
    try {
      const storage = await createStorageFor(backendKey)
      const games = await storage.listGames()
      setFromGames(games)
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

  const isBackendDisabled = (key: string) => key === 'localFile' && serverReachable === false

  return (
    <PageLayout
      header={<>
        <Button size="sm" variant="ghost" onClick={() => navigate(-1)} title="Back">
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <h1 className="text-lg font-semibold">Settings</h1>
      </>}
      maxWidth="max-w-2xl"
    >
      <div className="space-y-6">

        {/* Storage Backend Picker */}
        <Card>
          <CardHeader>
            <CardTitle>Storage Backend</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {BACKENDS.map(backend => {
              const disabled = isBackendDisabled(backend.key)
              const isSelected = selectedProvider === backend.key
              const isSaved = savedProvider === backend.key
              return (
                <div
                  key={backend.key}
                  onClick={() => !disabled && handleSelectProvider(backend.key)}
                  className={[
                    'flex items-center gap-3 rounded-lg border px-4 py-3 transition-colors',
                    disabled ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer hover:bg-muted/50',
                    isSelected ? 'ring-2 ring-primary' : '',
                  ].join(' ')}
                >
                  <backend.icon className="h-5 w-5 text-muted-foreground flex-shrink-0" />
                  <div className="flex-1 min-w-0">
                    <div className="font-medium">{backend.name}</div>
                    <div className="text-sm text-muted-foreground">{backend.description}</div>
                  </div>
                  {isSaved && <Check className="h-4 w-4 text-primary flex-shrink-0" />}
                </div>
              )
            })}
            {providerChanged && (
              <Button onClick={handleApplyProvider} className="w-full">
                Switch to {BACKENDS.find(b => b.key === selectedProvider)?.name}
              </Button>
            )}
          </CardContent>
        </Card>

        {/* Google Drive Auth */}
        {selectedProvider === 'googleDrive' && (
          <Card>
            <CardHeader>
              <CardTitle>Google Drive</CardTitle>
            </CardHeader>
            <CardContent>
              {driveAuthorized ? (
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
                  } catch { /* skip */ }
                }}>
                  Connect Google Drive
                </Button>
              )}
            </CardContent>
          </Card>
        )}

        {/* S3 Config */}
        {selectedProvider === 's3' && (
          <Card>
            <CardHeader>
              <CardTitle>S3 Configuration</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
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
            </CardContent>
          </Card>
        )}

        {/* Migration */}
        <Card>
          <CardHeader>
            <CardTitle>Copy Games Between Backends</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <label className="text-sm font-medium">From</label>
                <select
                  className="w-full rounded-md border bg-background px-3 py-2 text-sm"
                  value={migrateFrom}
                  onChange={e => handleFromChange(e.target.value as BackendKey)}
                >
                  {BACKENDS.map(b => (
                    <option key={b.key} value={b.key}>{b.name}</option>
                  ))}
                </select>
              </div>
              <div className="space-y-1">
                <label className="text-sm font-medium">To</label>
                <select
                  className="w-full rounded-md border bg-background px-3 py-2 text-sm"
                  value={migrateTo}
                  onChange={e => setMigrateTo(e.target.value as BackendKey)}
                >
                  {BACKENDS.map(b => (
                    <option key={b.key} value={b.key}>{b.name}</option>
                  ))}
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
          </CardContent>
        </Card>

      </div>
    </PageLayout>
  )
}
