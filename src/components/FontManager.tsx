import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import type { FontSlot } from '../types'

type FontManagerProps = {
  gameId: string
  fonts: Record<string, FontSlot>
  onFontsChange: (fonts: Record<string, FontSlot>) => void
}

export default function FontManager({ gameId, fonts, onFontsChange }: FontManagerProps) {
  const [showAddForm, setShowAddForm] = useState(false)
  const [slotName, setSlotName] = useState('')
  const [source, setSource] = useState<'google' | 'upload'>('google')
  const [googleFontName, setGoogleFontName] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const handleAddGoogle = async () => {
    if (!slotName.trim() || !googleFontName.trim()) return
    setLoading(true)
    setError('')
    try {
      const res = await fetch(`/api/games/${gameId}/fonts/google`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ slotName: slotName.trim(), fontName: googleFontName.trim() }),
      })
      if (!res.ok) throw new Error(await res.text())
      const data = await res.json()
      onFontsChange(data.fonts)
      setSlotName('')
      setGoogleFontName('')
      setShowAddForm(false)
    } catch (err: any) {
      setError(err.message || 'Failed to add font')
    } finally {
      setLoading(false)
    }
  }

  const handleUpload = async (file: File) => {
    if (!slotName.trim()) return
    setLoading(true)
    setError('')
    try {
      const formData = new FormData()
      formData.append('slotName', slotName.trim())
      formData.append('font', file)
      const res = await fetch(`/api/games/${gameId}/fonts/upload`, {
        method: 'POST',
        body: formData,
      })
      if (!res.ok) throw new Error(await res.text())
      const data = await res.json()
      onFontsChange(data.fonts)
      setSlotName('')
      setShowAddForm(false)
    } catch (err: any) {
      setError(err.message || 'Failed to upload font')
    } finally {
      setLoading(false)
    }
  }

  const handleDelete = async (slotKey: string) => {
    const font = fonts[slotKey]
    if (!font?.file) return
    if (!confirm(`Delete font "${font.name}"?`)) return
    setLoading(true)
    setError('')
    try {
      const res = await fetch(`/api/games/${gameId}/fonts/${font.file}`, {
        method: 'DELETE',
      })
      if (!res.ok) throw new Error(await res.text())
      const data = await res.json()
      onFontsChange(data.fonts)
    } catch (err: any) {
      setError(err.message || 'Failed to delete font')
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
          {showAddForm ? 'Cancel' : 'Add slot'}
        </Button>
      </div>

      {error && <p className="text-sm text-destructive">{error}</p>}

      {fontEntries.length === 0 && !showAddForm && (
        <p className="text-sm text-muted-foreground">No fonts added yet.</p>
      )}

      {fontEntries.map(([key, font]) => (
        <div key={key} className="flex items-center gap-3 rounded-md border px-3 py-2">
          <span className="text-sm font-medium">{key}</span>
          <span className="text-sm text-muted-foreground">{font.name}</span>
          <span className="ml-auto text-xs text-muted-foreground">{font.source}</span>
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
          <div className="space-y-2">
            <Label>Slot name</Label>
            <Input
              value={slotName}
              onChange={(e) => setSlotName(e.target.value)}
              placeholder="e.g. heading, body"
            />
          </div>

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
              Upload file
            </Button>
          </div>

          {source === 'google' && (
            <div className="flex gap-2">
              <Input
                value={googleFontName}
                onChange={(e) => setGoogleFontName(e.target.value)}
                placeholder="Font name (e.g. Roboto)"
                className="flex-1"
              />
              <Button disabled={loading || !slotName.trim() || !googleFontName.trim()} onClick={handleAddGoogle}>
                Add
              </Button>
            </div>
          )}

          {source === 'upload' && (
            <div>
              <input
                type="file"
                accept=".woff2,.woff,.ttf,.otf"
                disabled={loading || !slotName.trim()}
                onChange={(e) => {
                  const file = e.target.files?.[0]
                  if (file) handleUpload(file)
                }}
                className="text-sm"
              />
            </div>
          )}
        </div>
      )}
    </div>
  )
}
