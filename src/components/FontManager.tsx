import { useState, useEffect } from 'react'
import { X, Plus } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import ConfirmButton from './ConfirmButton'
import ListItem from './ListItem'
import FilterableList from '@/components/FilterableList'
import CollapsibleHeader, { useCollapsible } from '@/components/ui/CollapsibleHeader'
import { useAddGoogleFont, useUploadFont, useDeleteFont } from '../hooks/useGameData'

type FontEntry = { name: string; file: string; source: 'upload' | 'google' }

type FontManagerProps = {
  gameId: string
  storage?: any
  fonts: Record<string, FontEntry>
  onFontsChange: (fonts?: Record<string, FontEntry>) => void
  onStatus: (status: string) => void
  showAdd?: boolean
  onToggleAdd?: () => void
  selectedFont: string | null
  onSelectFont: (key: string | null) => void
}

export default function FontManager({ gameId, fonts, onFontsChange, onStatus, showAdd, onToggleAdd, selectedFont, onSelectFont }: FontManagerProps) {
  const addGoogleFontMut = useAddGoogleFont(gameId)
  const uploadFontMut = useUploadFont(gameId)
  const deleteFontMut = useDeleteFont(gameId)

  const [showAddFormInternal, setShowAddFormInternal] = useState(false)
  const showAddForm = showAdd ?? showAddFormInternal
  const setShowAddForm = onToggleAdd ? () => onToggleAdd() : setShowAddFormInternal
  const [source, setSource] = useState<'google' | 'upload'>('google')
  const [googleFontName, setGoogleFontName] = useState('')
  const loading = addGoogleFontMut.isPending || uploadFontMut.isPending || deleteFontMut.isPending

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
    onStatus('Adding font...')
    try {
      await addGoogleFontMut.mutateAsync(googleFontName.trim())
      onFontsChange()
      setGoogleFontName('')
      setShowAddForm(false)
      onStatus('Font added.')
    } catch (err: any) {
      onStatus(`Error: ${err.message}`)
    }
  }

  const handleUpload = async (file: File) => {
    onStatus('Uploading font...')
    try {
      await uploadFontMut.mutateAsync(file)
      onFontsChange()
      setShowAddForm(false)
      onStatus('Font uploaded.')
    } catch (err: any) {
      onStatus(`Error: ${err.message}`)
    }
  }

  const handleDelete = async (slotKey: string) => {
    const font = fonts[slotKey]
    if (!font) return
    onStatus('Deleting font...')
    try {
      if (font.file) {
        await deleteFontMut.mutateAsync(font.file)
        onFontsChange()
      }
      const entries = Object.keys(fonts).filter(k => k !== slotKey)
      const idx = Object.keys(fonts).indexOf(slotKey)
      const nextIdx = Math.min(idx, entries.length - 1)
      onSelectFont(entries[nextIdx] ?? null)
      onStatus('Font deleted.')
    } catch (err: any) {
      onStatus(`Error: ${err.message}`)
    }
  }

  const fontEntries = Object.entries(fonts)

  return (
    <div className="space-y-2">
      <FilterableList
        title="Fonts"
        items={fontEntries}
        getKey={([key]) => key}
        getName={([, font]) => font.name}
        selectedKey={selectedFont}
        onSelect={onSelectFont}
        toolbar={
          <Button size="sm" variant="ghost" onClick={() => setShowAddForm(true)} title="Add font">
            <Plus className="h-4 w-4" />
          </Button>
        }
        actions={selectedFont ? (
          <ConfirmButton iconOnly onConfirm={() => handleDelete(selectedFont)} disabled={loading} />
        ) : undefined}
        empty={!showAddForm ? <p className="text-sm text-muted-foreground">No fonts yet.</p> : undefined}
        renderItem={([, font], _vm, selected) => (
          <ListItem selected={selected}>
            <span className="font-medium">{font.name}</span>
            <span className="ml-2 text-xs text-muted-foreground">{font.source === 'google' ? 'Google Fonts' : 'File'}</span>
          </ListItem>
        )}
      />

      {showAddForm && (
        <div className="rounded-md border p-3">
          <div className="flex items-center justify-between mb-3">
            <span className="text-sm font-medium">Add font</span>
            <Button size="sm" variant="ghost" onClick={() => { setShowAddForm(false); setGoogleFontName('') }} title="Cancel">
              <X className="h-4 w-4" />
            </Button>
          </div>
          <Tabs value={source} onValueChange={(v) => setSource(v as 'google' | 'upload')}>
            <TabsList className="w-full mb-3">
              <TabsTrigger value="google" className="flex-1">Google Fonts</TabsTrigger>
              <TabsTrigger value="upload" className="flex-1">File</TabsTrigger>
            </TabsList>
            <TabsContent value="google">
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
            </TabsContent>
            <TabsContent value="upload">
              <Button
                disabled={loading}
                variant="outline"
                className="w-full"
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
            </TabsContent>
          </Tabs>
        </div>
      )}
    </div>
  )
}

const defaultPreviewText = "The quick brown fox\njumps over the lazy dog\nABCDEFGHIJKLMNOPQRSTUVWXYZ\nabcdefghijklmnopqrstuvwxyz\n0123456789 !@#$%&*"

export function FontPreviewEditor({ previewText, onChangePreviewText }: { previewText: string; onChangePreviewText: (text: string) => void }) {
  const { collapsed, toggle } = useCollapsible()
  return (
    <div className="rounded-lg border bg-card overflow-hidden">
      <CollapsibleHeader collapsed={collapsed} onToggle={toggle}>
        <span className="text-sm font-semibold">Preview Text</span>
      </CollapsibleHeader>
      {!collapsed && (
        <textarea
          value={previewText}
          onChange={(e) => onChangePreviewText(e.target.value)}
          className="w-full min-h-[200px] bg-background px-3 py-2 text-sm resize-none outline-none"
          placeholder="Type preview text..."
        />
      )}
    </div>
  )
}

export function FontPreview({ fonts, selectedFont, previewText }: { fonts: Record<string, FontEntry>; selectedFont: string | null; previewText: string }) {
  const entry = selectedFont ? fonts[selectedFont] : null
  const { collapsed, toggle } = useCollapsible()

  return (
    <div className="rounded-lg border bg-card overflow-hidden">
      <CollapsibleHeader collapsed={collapsed} onToggle={toggle}>
        <span className="text-sm font-semibold">Preview</span>
      </CollapsibleHeader>
      {!collapsed && (
        <div className="p-4">
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
      )}
    </div>
  )
}

export { defaultPreviewText }
