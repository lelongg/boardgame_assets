import { useState, useEffect } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import ConfirmButton from './ConfirmButton'

type FontEntry = { name: string; file: string; source: 'upload' | 'google' }

type FontManagerProps = {
  gameId: string
  storage: any
  fonts: Record<string, FontEntry>
  onFontsChange: (fonts: Record<string, FontEntry>) => void
  onStatus: (status: string) => void
  showAdd?: boolean
  onToggleAdd?: () => void
  selectedFont: string | null
  onSelectFont: (key: string | null) => void
}

export default function FontManager({ gameId, storage, fonts, onFontsChange, onStatus, showAdd, onToggleAdd, selectedFont, onSelectFont }: FontManagerProps) {
  const [showAddFormInternal, setShowAddFormInternal] = useState(false)
  const showAddForm = showAdd ?? showAddFormInternal
  const setShowAddForm = onToggleAdd ? () => onToggleAdd() : setShowAddFormInternal
  const [source, setSource] = useState<'google' | 'upload'>('google')
  const [googleFontName, setGoogleFontName] = useState('')
  const [loading, setLoading] = useState(false)

  // Load font CSS for previews
  useEffect(() => {
    const styleId = 'font-manager-preview-styles'
    let style = document.getElementById(styleId) as HTMLStyleElement | null
    if (!style) {
      style = document.createElement('style')
      style.id = styleId
      document.head.appendChild(style)
    }
    const rules = Object.values(fonts)
      .filter((f) => f.file)
      .map((f) => `@font-face { font-family: '${f.name}'; src: url('/api/games/${gameId}/fonts/${f.file}'); }`)
      .join('\n')
    style.textContent = rules
    return () => { if (style) style.textContent = '' }
  }, [fonts, gameId])

  const handleAddGoogle = async () => {
    if (!googleFontName.trim()) return
    setLoading(true)
    onStatus('Adding font...')
    try {
      const data = await storage.addGoogleFont(gameId, googleFontName.trim())
      onFontsChange(data.fonts)
      setGoogleFontName('')
      setShowAddForm(false)
      onStatus('Font added.')
    } catch (err: any) {
      onStatus(`Error: ${err.message}`)
    } finally {
      setLoading(false)
    }
  }

  const handleUpload = async (file: File) => {
    setLoading(true)
    onStatus('Uploading font...')
    try {
      const data = await storage.uploadFont(gameId, file)
      onFontsChange(data.fonts)
      setShowAddForm(false)
      onStatus('Font uploaded.')
    } catch (err: any) {
      onStatus(`Error: ${err.message}`)
    } finally {
      setLoading(false)
    }
  }

  const handleDelete = async (slotKey: string) => {
    const font = fonts[slotKey]
    if (!font) return
    setLoading(true)
    onStatus('Deleting font...')
    try {
      if (font.file) {
        const data = await storage.deleteFont(gameId, font.file)
        onFontsChange(data.fonts)
      } else {
        const updated = { ...fonts }
        delete updated[slotKey]
        onFontsChange(updated)
      }
      if (selectedFont === slotKey) onSelectFont(null)
      onStatus('Font deleted.')
    } catch (err: any) {
      onStatus(`Error: ${err.message}`)
    } finally {
      setLoading(false)
    }
  }

  const fontEntries = Object.entries(fonts)

  return (
    <div className="space-y-2 overflow-y-auto max-h-[60vh]">
      {fontEntries.length === 0 && !showAddForm && (
        <p className="text-sm text-muted-foreground">No fonts yet.</p>
      )}

      {fontEntries.map(([key, font]) => (
        <div
          key={key}
          className={`rounded-lg border bg-card cursor-pointer ${selectedFont === key ? 'ring-2 ring-inset ring-primary' : ''}`}
          onClick={() => onSelectFont(selectedFont === key ? null : key)}
        >
          <div className="px-3 py-2.5">
            <span className="font-medium">{font.name}</span>
            <span className="ml-2 text-xs text-muted-foreground">{font.source === 'google' ? 'Google Fonts' : 'File'}</span>
          </div>
          {selectedFont === key && (
            <div className="flex gap-2 border-t mx-2 px-1 py-2" onClick={(e) => e.stopPropagation()}>
              <ConfirmButton onConfirm={() => handleDelete(key)} disabled={loading} />
            </div>
          )}
        </div>
      ))}

      {showAddForm && (
        <div className="space-y-3 rounded-md border p-4">
          <div className="flex gap-2">
            <Button size="sm" variant={source === 'google' ? 'default' : 'outline'} onClick={() => setSource('google')}>
              Google Fonts
            </Button>
            <Button size="sm" variant={source === 'upload' ? 'default' : 'outline'} onClick={() => setSource('upload')}>
              File
            </Button>
          </div>

          {source === 'google' && (
            <div className="flex gap-2">
              <Input
                value={googleFontName}
                onChange={(e) => {
                  const val = e.target.value
                  const urlMatch = val.match(/fonts\.google\.com\/(?:specimen|share)\/([\w+]+)/)
                    || val.match(/fonts\.googleapis\.com\/css2?\?family=([\w+]+)/)
                  setGoogleFontName(urlMatch ? urlMatch[1].replace(/\+/g, ' ') : val)
                }}
                placeholder="Name or Google Fonts URL"
                className="flex-1"
              />
              <Button disabled={loading || !googleFontName.trim()} onClick={handleAddGoogle}>
                Add
              </Button>
            </div>
          )}

          {source === 'upload' && (
            <Button
              disabled={loading}
              onClick={() => {
                const input = document.createElement('input')
                input.type = 'file'
                input.accept = '.woff2,.woff,.ttf,.otf'
                input.onchange = () => {
                  const file = input.files?.[0]
                  if (file) handleUpload(file)
                }
                input.click()
              }}
            >
              Choose File
            </Button>
          )}
        </div>
      )}
    </div>
  )
}

const defaultPreviewText = "The quick brown fox\njumps over the lazy dog\nABCDEFGHIJKLMNOPQRSTUVWXYZ\nabcdefghijklmnopqrstuvwxyz\n0123456789 !@#$%&*"

export function FontPreviewEditor({ previewText, onChangePreviewText }: { previewText: string; onChangePreviewText: (text: string) => void }) {
  return (
    <textarea
      value={previewText}
      onChange={(e) => onChangePreviewText(e.target.value)}
      className="w-full h-full min-h-[200px] rounded-lg border bg-background px-3 py-2 text-sm resize-none"
      placeholder="Type preview text..."
    />
  )
}

export function FontPreview({ fonts, selectedFont, previewText }: { fonts: Record<string, FontEntry>; selectedFont: string | null; previewText: string }) {
  const entry = selectedFont ? fonts[selectedFont] : null

  return (
    <div className="rounded-lg border bg-card p-4 overflow-hidden">
      {entry ? (
        <div className="space-y-2 break-words" style={{ fontFamily: `'${entry.name}', sans-serif` }}>
          {previewText.split('\n').map((line, i) => (
            <p key={i} className="text-2xl break-all">{line || '\u00A0'}</p>
          ))}
        </div>
      ) : (
        <p className="text-sm text-muted-foreground">Select a font to preview</p>
      )}
    </div>
  )
}

export { defaultPreviewText }
