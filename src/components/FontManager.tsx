import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import type { FontSlot } from '../types'

type FontManagerProps = {
  gameId: string
  fonts: Record<string, FontSlot>
  onFontsChange: (fonts: Record<string, FontSlot>) => void
  onStatus: (status: string) => void
}

export default function FontManager({ gameId, fonts, onFontsChange, onStatus }: FontManagerProps) {
  const [showAddForm, setShowAddForm] = useState(false)
  const [slotName, setSlotName] = useState('')
  const [source, setSource] = useState<'google' | 'upload'>('google')
  const [googleFontName, setGoogleFontName] = useState('')
  const [loading, setLoading] = useState(false)

  const handleAddGoogle = async () => {
    if (!googleFontName.trim()) return
    const slot = slotName.trim() || googleFontName.trim().toLowerCase().replace(/\s+/g, '-')
    setLoading(true)
    onStatus('Adding font...')
    try {
      const res = await fetch(`/api/games/${gameId}/fonts/google`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ slotName: slot, name: googleFontName.trim() }),
      })
      if (!res.ok) {
        const body = await res.json().catch(() => null)
        throw new Error(body?.error || 'Failed to add font')
      }
      const data = await res.json()
      onFontsChange(data.fonts)
      setSlotName('')
      setGoogleFontName('')
      setShowAddForm(false)
      onStatus('Font added.')
    } catch (err: any) {
      onStatus(`Error: ${err.message}`)
    } finally {
      setLoading(false)
    }
  }

  const handleUpload = async (file: File, overrideSlotName?: string) => {
    const slot = (overrideSlotName ?? slotName).trim()
    if (!slot) return
    setLoading(true)
    onStatus('Uploading font...')
    try {
      const res = await fetch(`/api/games/${gameId}/fonts/upload`, {
        method: 'POST',
        headers: {
          'Content-Disposition': `attachment; filename="${file.name}"`,
          'X-Slot-Name': slot,
        },
        body: await file.arrayBuffer(),
      })
      if (!res.ok) {
        const body = await res.json().catch(() => null)
        throw new Error(body?.error || 'Failed to upload font')
      }
      const data = await res.json()
      onFontsChange(data.fonts)
      setSlotName('')
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
        const res = await fetch(`/api/games/${gameId}/fonts/${font.file}`, {
          method: 'DELETE',
        })
        if (!res.ok) {
          const body = await res.json().catch(() => null)
          throw new Error(body?.error || 'Failed to delete font')
        }
        const data = await res.json()
        onFontsChange(data.fonts)
      } else {
        // Font has no file, remove the slot and save template
        const updated = { ...fonts }
        delete updated[slotKey]
        await fetch(`/api/games/${gameId}/template`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ ...await (await fetch(`/api/games/${gameId}/template`)).json(), fonts: updated }),
        })
        onFontsChange(updated)
      }
      onStatus('Font deleted.')
    } catch (err: any) {
      onStatus(`Error: ${err.message}`)
    } finally {
      setLoading(false)
    }
  }

  const fontEntries = Object.entries(fonts)

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <Label className="text-base font-semibold">Fonts</Label>
        <Button size="sm" variant="outline" onClick={() => setShowAddForm(!showAddForm)}>
          {showAddForm ? 'Cancel' : 'Add Font'}
        </Button>
      </div>

      {fontEntries.length === 0 && !showAddForm && (
        <p className="text-sm text-muted-foreground">No fonts added yet.</p>
      )}

      {fontEntries.map(([key, font]) => (
        <div key={key} className="flex items-center gap-3 rounded-md border px-3 py-2">
          <span className="text-sm font-medium">{font.name}</span>
          <span className="ml-auto text-xs text-muted-foreground">{font.source === 'google' ? 'Google Fonts' : 'File'}</span>
          <Button
            size="sm"
            variant="destructive"
            disabled={loading}
            onClick={() => handleDelete(key)}
          >
            Delete
          </Button>
        </div>
      ))}

      {showAddForm && (
        <div className="space-y-3 rounded-md border p-4">
          <div className="flex gap-2">
            <Button
              size="sm"
              variant={source === 'google' ? 'default' : 'outline'}
              onClick={() => setSource('google')}
            >
              Google Fonts
            </Button>
            <Button
              size="sm"
              variant={source === 'upload' ? 'default' : 'outline'}
              onClick={() => setSource('upload')}
            >
              File
            </Button>
          </div>

          {source === 'google' && (
            <div className="flex gap-2">
              <Input
                value={googleFontName}
                onChange={(e) => {
                  const val = e.target.value
                  // Accept Google Fonts URLs: extract font name from specimen or family URL
                  const urlMatch = val.match(/fonts\.google\.com\/(?:specimen|share)\/([\w+]+)/)
                    || val.match(/fonts\.googleapis\.com\/css2?\?family=([\w+]+)/)
                  if (urlMatch) {
                    const name = urlMatch[1].replace(/\+/g, ' ')
                    setGoogleFontName(name)
                    if (!slotName.trim()) setSlotName(name.toLowerCase().replace(/\s+/g, '-'))
                  } else {
                    setGoogleFontName(val)
                  }
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
            <div>
              <Button
                disabled={loading}
                onClick={() => {
                  const input = document.createElement('input')
                  input.type = 'file'
                  input.accept = '.woff2,.woff,.ttf,.otf'
                  input.onchange = () => {
                    const file = input.files?.[0]
                    if (!file) return
                    let slot = slotName.trim()
                    if (!slot) {
                      slot = file.name.replace(/\.[^.]+$/, '').replace(/[-_]+/g, ' ')
                      setSlotName(slot)
                    }
                    handleUpload(file, slot)
                  }
                  input.click()
                }}
              >
                Choose File
              </Button>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
