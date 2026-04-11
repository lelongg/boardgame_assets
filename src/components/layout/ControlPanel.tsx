import { useState, useEffect, useRef, lazy, Suspense } from 'react'
import { Smile, Upload, X, Eye, Pencil, Image as ImageIcon, ClipboardPaste } from 'lucide-react'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { RgbaColorPicker } from 'react-colorful'
import AnchorGrid from './AnchorGrid'
import ListItem from '@/components/ListItem'
import LoadingImg from '@/components/LoadingImg'
import ConfirmButton from '@/components/ConfirmButton'
import RichTextField from '@/components/RichTextField'
import { findParentSection, findItemById, getNodeKind, flattenNodes } from './layoutHelpers'
import type { CardLayout, PropertyBinding } from '../../types'

type ControlPanelProps = {
  property: string
  value: unknown
  binding?: PropertyBinding
  bindingValues?: string[]
  bindingDefault?: string
  itemType?: string
  gameFonts?: Record<string, { name: string; file: string }>
  gameImages?: { file: string; url: string }[]
  onUploadFile?: (file: File) => Promise<string>
  layout: CardLayout
  selectedNodeId?: string
  onChange: (value: unknown) => void
  onBindingChange?: (binding: PropertyBinding | null) => void
  onBindingValuesChange?: (values: string[] | null) => void
  onBindingDefaultChange?: (defaultValue: string) => void
}

type FieldMeta = {
  type: 'number' | 'select' | 'anchor' | 'text' | 'richtext' | 'color' | 'image-upload' | 'emoji' | 'boolean'
  min?: number
  max?: number
  step?: number
  options?: { value: string; label: string }[]
}

const getFieldMeta = (property: string, layout: CardLayout, selectedNodeId?: string, gameFonts?: Record<string, { name: string; file: string }>): FieldMeta => {
  switch (property) {
    case 'width': return { type: 'number', min: 10, max: 300, step: 0.5 }
    case 'height': return { type: 'number', min: 10, max: 300, step: 0.5 }
    case 'radius': return { type: 'number', min: 0, max: 20, step: 0.5 }
    case 'bleed': return { type: 'number', min: 0, max: 10, step: 0.5 }
    case 'sizePct': return { type: 'number', min: 0, max: 100, step: 1 }
    case 'gap': return { type: 'number', min: 0, max: 100, step: 1 }
    case 'fontSize': return { type: 'number', min: 8, max: 500, step: 1 }
    case 'widthPct': return { type: 'number', min: 0, max: 200, step: 1 }
    case 'heightPct': return { type: 'number', min: 0, max: 200, step: 1 }
    case 'offsetX': return { type: 'number', min: -Math.round(layout.width), max: Math.round(layout.width), step: 0.1 }
    case 'offsetY': return { type: 'number', min: -Math.round(layout.height), max: Math.round(layout.height), step: 0.1 }
    case 'strokeWidth': return { type: 'number', min: 0, max: 20, step: 0.5 }
    case 'cornerRadius': return { type: 'number', min: 0, max: 100, step: 1 }
    case 'layout': return { type: 'select', options: [
      { value: 'row', label: 'Row' },
      { value: 'column', label: 'Column' },
      { value: 'stack', label: 'Stack' },
      { value: 'grid', label: 'Grid' },
    ]}
    case 'repeatCount': return { type: 'number', min: 1, max: 20, step: 1 }
    case 'repeatOffsetX': return { type: 'number', min: -Math.round(layout.width), max: Math.round(layout.width), step: 0.1 }
    case 'repeatOffsetY': return { type: 'number', min: -Math.round(layout.height), max: Math.round(layout.height), step: 0.1 }
    case 'columns': return { type: 'number', min: 1, max: 12, step: 1 }
    case 'align': return { type: 'select', options: [
      { value: 'left', label: 'Left' },
      { value: 'center', label: 'Center' },
      { value: 'right', label: 'Right' },
    ]}
    case 'verticalAlign': return { type: 'select', options: [
      { value: 'top', label: 'Top' },
      { value: 'middle', label: 'Middle' },
      { value: 'bottom', label: 'Bottom' },
    ]}
    case 'font': return { type: 'select', options: Object.entries(gameFonts ?? {}).map(([key, slot]: [string, any]) => ({
      value: key,
      label: `${key} (${slot.name})`,
    }))}
    case 'fit': return { type: 'select', options: [
      { value: 'cover', label: 'Cover' },
      { value: 'contain', label: 'Contain' },
      { value: 'fill', label: 'Fill' },
    ]}
    case 'attachTargetId': {
      if (!selectedNodeId) return { type: 'select', options: [] }
      const kind = getNodeKind(layout.root, selectedNodeId)
      const parent = kind ? findParentSection(layout.root, selectedNodeId, kind) : null
      const siblings = parent
        ? [...parent.items.filter((i) => i.id !== selectedNodeId).map((i) => ({ id: i.id, name: i.name, kind: 'item' as const })),
           { id: parent.id, name: parent.name, kind: 'section' as const }]
        : []
      return { type: 'select', options: siblings.map((n) => ({
        value: n.id,
        label: `${n.kind === 'section' ? '▸' : '·'} ${n.name}`,
      }))}
    }
    case 'color':
    case 'strokeColor':
    case 'fillColor': return { type: 'color' }
    case 'defaultValue': {
      if (selectedNodeId) {
        const item = findItemById(layout.root, selectedNodeId)
        if (item && (item as any).type === 'image') return { type: 'image-upload' }
      }
      return { type: 'richtext' }
    }
    case 'emoji': return { type: 'emoji' }
    case 'anchor':
    case 'attachAnchor': return { type: 'anchor' }
    case 'visible': return { type: 'boolean' }
    case 'copyTargetId': {
      const nodes = flattenNodes(layout.root).filter(n => !selectedNodeId || n.id !== selectedNodeId)
      return { type: 'select', options: nodes.map(n => ({
        value: n.id,
        label: `${n.kind === 'section' ? '▸' : '·'} ${n.name}`,
      }))}
    }
    default: return { type: 'text' }
  }
}

const hexToRgba = (hex: string) => {
  if (hex === 'none') return { r: 0, g: 0, b: 0, a: 0 }
  if (!hex) return { r: 0, g: 0, b: 0, a: 1 }
  const h = hex.replace('#', '')
  return {
    r: parseInt(h.slice(0, 2), 16) || 0,
    g: parseInt(h.slice(2, 4), 16) || 0,
    b: parseInt(h.slice(4, 6), 16) || 0,
    a: h.length >= 8 ? Math.round(parseInt(h.slice(6, 8), 16) / 255 * 100) / 100 : 1,
  }
}

const rgbaToHex = ({ r, g, b, a }: { r: number; g: number; b: number; a: number }) => {
  if (a === 0) return 'none'
  const hex = `#${[r, g, b].map(c => c.toString(16).padStart(2, '0')).join('')}`
  if (a >= 1) return hex
  return `${hex}${Math.round(a * 255).toString(16).padStart(2, '0')}`
}

function ColorControl({ value, onChange }: { value: string; onChange: (v: unknown) => void }) {
  const [localColor, setLocalColor] = useState(() => hexToRgba(value))
  const [inputValue, setInputValue] = useState(value)
  const pickerRef = useRef<HTMLDivElement>(null)
  const localColorRef = useRef(localColor)

  // Sync from parent only when the hex value actually changes externally
  const prevValue = useRef(value)
  useEffect(() => {
    if (value !== prevValue.current) {
      prevValue.current = value
      const parsed = hexToRgba(value)
      setLocalColor(parsed)
      localColorRef.current = parsed
      setInputValue(value)
    }
  }, [value])

  // Commit on pointer up anywhere (covers releasing outside the picker)
  useEffect(() => {
    const commit = () => {
      const hex = rgbaToHex(localColorRef.current)
      if (hex !== prevValue.current) {
        prevValue.current = hex
        setInputValue(hex)
        onChange(hex)
      }
    }
    window.addEventListener('pointerup', commit)
    return () => window.removeEventListener('pointerup', commit)
  }, [onChange])

  const handlePickerChange = (c: { r: number; g: number; b: number; a: number }) => {
    setLocalColor(c)
    localColorRef.current = c
  }

  const localHex = rgbaToHex(localColor)
  const checkerBg = 'repeating-conic-gradient(#808080 0% 25%, transparent 0% 50%) 50% / 12px 12px'

  return (
    <div className="space-y-2">
      <div className="rounded-md border overflow-hidden h-7" style={{ background: checkerBg }}>
        <div className="w-full h-full" style={{ background: localHex === 'none' ? 'transparent' : localHex }} />
      </div>
      <div ref={pickerRef}>
        <RgbaColorPicker
          color={localColor}
          onChange={handlePickerChange}
          style={{ width: '100%' }}
        />
      </div>
      <Input
        value={inputValue}
        onChange={(e) => {
          setInputValue(e.target.value)
          const parsed = hexToRgba(e.target.value)
          setLocalColor(parsed)
          localColorRef.current = parsed
        }}
        onBlur={() => {
          const hex = rgbaToHex(localColorRef.current)
          prevValue.current = hex
          onChange(hex)
        }}
        onKeyDown={(e) => {
          if (e.key === 'Enter') {
            const hex = rgbaToHex(localColorRef.current)
            prevValue.current = hex
            onChange(hex)
          }
        }}
        placeholder="#000000 or none"
      />
    </div>
  )
}

function EmojiPicker({ value, onChange }: { value: string; onChange: (v: unknown) => void }) {
  const [showPicker, setShowPicker] = useState(false)
  const pickerRef = useRef<HTMLDivElement>(null)
  const pickerInstanceRef = useRef<any>(null)
  const onChangeRef = useRef(onChange)
  onChangeRef.current = onChange

  useEffect(() => {
    if (!showPicker) return
    let cancelled = false
    const container = pickerRef.current
    const init = async () => {
      const mod = await import('emoji-picker-element')
      if (cancelled) return
      const Picker = 'default' in mod ? (mod as any).default : mod.Picker ?? (mod as any)
      const picker = new Picker()
      picker.style.width = '100%'
      picker.addEventListener('emoji-click', (e: any) => {
        onChangeRef.current(e.detail.unicode)
      })
      pickerInstanceRef.current = picker
      container?.appendChild(picker)
    }
    init()
    return () => {
      cancelled = true
      const picker = pickerInstanceRef.current
      if (picker && container?.contains(picker)) container.removeChild(picker)
      pickerInstanceRef.current = null
    }
  }, [showPicker])

  return (
    <div className="space-y-2">
      <div className="relative">
        <Input
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder="Type or paste emoji"
          className="pr-9"
        />
        <button
          type="button"
          onClick={() => setShowPicker(!showPicker)}
          className={`absolute right-1 top-1/2 -translate-y-1/2 rounded p-1 transition-colors ${showPicker ? 'text-primary' : 'text-muted-foreground hover:text-foreground'}`}
          title="Emoji picker"
        >
          <Smile className="h-4 w-4" />
        </button>
      </div>
      {showPicker && <div ref={pickerRef} />}
    </div>
  )
}

const LazyImageEditor = lazy(() => import('@/components/ImageEditor'))

const NO_BINDING = new Set(['name', 'id', 'anchor', 'attachAnchor', 'attachTargetId'])

function ImageUploadEditor({ value, onChange, aspectRatio, gameImages, onUploadFile }: { value: string; onChange: (v: string) => void; aspectRatio?: number; gameImages?: { file: string; url: string }[]; onUploadFile?: (file: File) => Promise<string> }) {
  const [showPreview, setShowPreview] = useState(false)
  const [editing, setEditing] = useState(false)
  const [showPicker, setShowPicker] = useState(false)
  const readFileAsDataUrl = (file: File): Promise<string> =>
    new Promise((resolve) => { const reader = new FileReader(); reader.onload = () => resolve(reader.result as string); reader.readAsDataURL(file) })
  const handleFile = async (file: File) => {
    if (!file.type.startsWith('image/')) return
    if (onUploadFile) {
      const url = await onUploadFile(file)
      onChange(url)
    } else {
      onChange(await readFileAsDataUrl(file))
    }
  }

  if (editing && value) {
    return (
      <Suspense fallback={<div className="p-4 text-center text-sm text-muted-foreground">Loading editor...</div>}>
        <LazyImageEditor src={value} aspectRatio={aspectRatio} onSave={(dataUrl: string) => { onChange(dataUrl); setEditing(false) }} onCancel={() => setEditing(false)} />
      </Suspense>
    )
  }

  return (
    <div
      className="space-y-2"
      onPaste={(e) => { const file = Array.from(e.clipboardData.items).find(i => i.type.startsWith('image/'))?.getAsFile(); if (file) { e.preventDefault(); handleFile(file) } }}
      onDragOver={(e) => { e.preventDefault(); e.dataTransfer.dropEffect = 'copy' }}
      onDrop={(e) => { e.preventDefault(); const file = Array.from(e.dataTransfer.files).find(f => f.type.startsWith('image/')); if (file) handleFile(file) }}
    >
      <div className={`relative rounded border border-dashed border-muted-foreground/40 p-3 text-center text-xs text-muted-foreground ${value ? 'pr-[7rem]' : 'pr-9'}`}>
        Paste or drop image
        <div className="absolute right-1 top-1/2 -translate-y-1/2 flex items-center gap-0.5">
          {value && (
            <button type="button" className={`rounded p-1 transition-colors ${showPreview ? 'text-primary' : 'text-muted-foreground hover:text-foreground'}`} title="Preview image" onClick={() => setShowPreview(!showPreview)}>
              <Eye className="h-4 w-4" />
            </button>
          )}
          {value && (
            <button type="button" className="rounded p-1 text-muted-foreground hover:text-foreground transition-colors" title="Edit image" onClick={() => setEditing(true)}>
              <Pencil className="h-4 w-4" />
            </button>
          )}
          {value && (
            <button type="button" className="rounded p-1 text-muted-foreground hover:text-destructive transition-colors" title="Remove image" onClick={() => onChange('')}>
              <X className="h-4 w-4" />
            </button>
          )}
          <button
            type="button"
            className="rounded p-1 text-muted-foreground hover:text-foreground transition-colors"
            title="Paste from clipboard"
            onClick={async () => {
              try {
                const items = await navigator.clipboard.read()
                for (const item of items) {
                  const imageType = item.types.find(t => t.startsWith('image/'))
                  if (imageType) {
                    const blob = await item.getType(imageType)
                    const file = new File([blob], `paste.${imageType.split('/')[1]}`, { type: imageType })
                    handleFile(file)
                    return
                  }
                }
              } catch { /* clipboard access denied or empty */ }
            }}
          >
            <ClipboardPaste className="h-4 w-4" />
          </button>
          <button
            type="button"
            className="rounded p-1 text-muted-foreground hover:text-foreground transition-colors"
            title="Upload image"
            onClick={() => {
              const input = document.createElement('input'); input.type = 'file'; input.accept = 'image/*'
              input.onchange = async () => { const file = input.files?.[0]; if (file) handleFile(file) }
              input.click()
            }}
          >
            <Upload className="h-4 w-4" />
          </button>
          {gameImages && gameImages.length > 0 && (
            <button type="button" className={`rounded p-1 transition-colors ${showPicker ? 'text-primary' : 'text-muted-foreground hover:text-foreground'}`} title="Pick from gallery" onClick={() => setShowPicker(!showPicker)}>
              <ImageIcon className="h-4 w-4" />
            </button>
          )}
        </div>
      </div>
      {showPreview && value && <LoadingImg src={value} alt="Preview" className="max-h-24 rounded border object-contain" />}
      {showPicker && gameImages && gameImages.length > 0 && (
        <div className="grid grid-cols-4 gap-1 max-h-40 overflow-y-auto rounded border p-1">
          {gameImages.map((img) => (
            <button
              key={img.file}
              type="button"
              className={`rounded overflow-hidden border transition-colors ${value === img.url ? 'border-primary ring-1 ring-primary' : 'border-transparent hover:border-muted-foreground/40'}`}
              style={{ aspectRatio: '1' }}
              onClick={() => { onChange(img.url); setShowPicker(false) }}
              title={img.file}
            >
              <LoadingImg src={img.url} alt={img.file} className="w-full h-full object-cover" wrapperClassName="w-full h-full" />
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

/** Determine editor type for a property without needing layout context */
export const getEditorType = (property: string, itemType?: string): FieldMeta['type'] => {
  switch (property) {
    case 'emoji': return 'emoji'
    case 'color': case 'strokeColor': case 'fillColor': return 'color'
    case 'visible': return 'boolean'
    case 'defaultValue': return itemType === 'image' ? 'image-upload' : 'richtext'
    case 'width': case 'height': case 'radius': case 'bleed': case 'sizePct':
    case 'gap': case 'fontSize': case 'widthPct': case 'heightPct':
    case 'offsetX': case 'offsetY': case 'strokeWidth': case 'cornerRadius':
    case 'columns': case 'repeatCount': case 'repeatOffsetX': case 'repeatOffsetY': return 'number'
    case 'layout': case 'align': case 'verticalAlign': case 'font': case 'fit': case 'copyTargetId': return 'select'
    default: return 'text'
  }
}

function RepeatButton({ onTick, ...props }: { onTick: () => void } & Omit<React.ComponentProps<typeof Button>, 'onClick'>) {
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const clear = () => { if (intervalRef.current) { clearInterval(intervalRef.current); intervalRef.current = null } }
  return (
    <Button
      {...props}
      onClick={onTick}
      onPointerDown={() => { clear(); const timeout = setTimeout(() => { intervalRef.current = setInterval(onTick, 60) }, 400); intervalRef.current = timeout as any }}
      onPointerUp={clear}
      onPointerLeave={clear}
    />
  )
}

export function NumberEditor({ value, onChange, min, max, step }: { value: string; onChange: (v: string) => void; min?: number; max?: number; step?: number }) {
  const numVal = Number(value || 0)
  const s = step ?? 1
  const valRef = useRef(numVal)
  valRef.current = numVal
  return (
    <div className="space-y-2">
      <input type="range" min={min} max={max} step={step} value={numVal} onChange={(e) => onChange(e.target.value)} className="w-full" />
      <div className="relative">
        <Input type="number" min={min} max={max} step={step} value={numVal} onChange={(e) => onChange(e.target.value)} className="text-center px-9" />
        <div className="absolute left-1 top-1/2 -translate-y-1/2" onPointerDown={(e) => e.preventDefault()}>
          <RepeatButton size="sm" variant="ghost" className="h-7 w-7 p-0" onTick={() => { const v = Math.max(min ?? -Infinity, valRef.current - s); valRef.current = v; onChange(String(v)) }}>-</RepeatButton>
        </div>
        <div className="absolute right-1 top-1/2 -translate-y-1/2" onPointerDown={(e) => e.preventDefault()}>
          <RepeatButton size="sm" variant="ghost" className="h-7 w-7 p-0" onTick={() => { const v = Math.min(max ?? Infinity, valRef.current + s); valRef.current = v; onChange(String(v)) }}>+</RepeatButton>
        </div>
      </div>
    </div>
  )
}

export function ValueItemEditor({ property, itemType, value, onChange, layout, gameImages, onUploadFile }: { property: string; itemType?: string; value: string; onChange: (v: string) => void; layout?: CardLayout; gameImages?: { file: string; url: string }[]; onUploadFile?: (file: File) => Promise<string> }) {
  const type = getEditorType(property, itemType)
  if (type === 'emoji') return <EmojiPicker value={value} onChange={(v) => onChange(String(v))} />
  if (type === 'color') return <ColorControl value={value} onChange={(v) => onChange(String(v))} />
  if (type === 'image-upload') return <ImageUploadEditor value={value} onChange={onChange} aspectRatio={layout ? layout.width / layout.height : undefined} gameImages={gameImages} onUploadFile={onUploadFile} />
  if (type === 'richtext') return <RichTextField value={value} onChange={onChange} />
  if (type === 'number') {
    const dummyLayout = layout ?? { version: 2 as const, id: '', name: '', width: 63.5, height: 88.9, radius: 2.5, bleed: 1.5, fonts: {}, root: { id: 'root', name: 'Root', layout: 'stack' as const, sizePct: 100, gap: 0, children: [], items: [] } }
    const meta = getFieldMeta(property, dummyLayout)
    return <NumberEditor value={value} onChange={onChange} min={meta.min} max={meta.max} step={meta.step} />
  }
  if (type === 'select') {
    const dummyLayout = layout ?? { version: 2 as const, id: '', name: '', width: 63.5, height: 88.9, radius: 2.5, bleed: 1.5, fonts: {}, root: { id: 'root', name: 'Root', layout: 'stack' as const, sizePct: 100, gap: 0, children: [], items: [] } }
    const meta = getFieldMeta(property, dummyLayout)
    return (
      <select value={value} onChange={(e) => onChange(e.target.value)} className="w-full rounded-md border bg-background pl-3 pr-8 py-2 text-sm">
        {meta.options?.map((opt) => <option key={opt.value} value={opt.value}>{opt.label}</option>)}
      </select>
    )
  }
  if (type === 'boolean') return (
    <button
      onClick={() => onChange(value === 'false' ? 'true' : 'false')}
      className={`w-full rounded-md border px-3 py-2 text-sm text-left transition-colors ${value !== 'false' ? 'bg-primary/10 border-primary text-primary' : 'bg-background border-input text-muted-foreground'}`}
    >{value !== 'false' ? 'Yes' : 'No'}</button>
  )
  return <Input value={value} onChange={(e) => onChange(e.target.value)} placeholder="Value" />
}

function BindingEditor({ property, itemType, layout, binding, values: externalValues, bindingDefault, onSetDefault, onChange, onValuesChange }: { property: string; itemType?: string; layout?: CardLayout; binding: PropertyBinding | undefined; values: string[]; bindingDefault?: string; onSetDefault: (v: string) => void; onChange: (b: PropertyBinding | null) => void; onValuesChange: (v: string[] | null) => void }) {
  const [selectedIdx, setSelectedIdx] = useState<number | null>(null)
  const field = binding?.field ?? ''
  const values = externalValues

  const updateField = (f: string) => {
    if (!f) { onChange(null); return }
    onChange({ field: f })
  }
  const updateValues = (v: string[]) => {
    if (!field) return
    onValuesChange(v.length ? v : null)
  }
  const updateAt = (i: number, v: string) => { const next = [...values]; next[i] = v; updateValues(next) }
  const removeAt = (i: number) => { updateValues(values.filter((_, j) => j !== i)); setSelectedIdx(null) }

  return (
    <div className="space-y-2">
      <Input
        value={field}
        onChange={(e) => updateField(e.target.value)}
        placeholder="Field name (e.g. rank, suit)"
      />
      {field && (
        <div className="space-y-1">
          <div className="text-xs text-muted-foreground">Allowed values</div>
          {values.map((v, i) => {
            const isDefault = v !== '' && bindingDefault === v
            return (
            <ListItem
              key={i}
              selected={selectedIdx === i}
              onClick={() => setSelectedIdx(selectedIdx === i ? null : i)}
              actions={<div className="flex-1 space-y-2">
                <ValueItemEditor property={property} itemType={itemType} layout={layout} value={v} onChange={(val) => updateAt(i, val)} />
                <div className="flex gap-1">
                  <Button size="sm" variant={isDefault ? "default" : "outline"} className="flex-1" onClick={() => onSetDefault(v)}>
                    {isDefault ? 'Default' : 'Set as default'}
                  </Button>
                  <ConfirmButton onConfirm={() => removeAt(i)} />
                </div>
              </div>}
            >
              <span className="text-sm flex items-center justify-between gap-2 w-full">
                <span>{v !== '' ? v : <span className="text-muted-foreground italic">empty</span>}</span>
                {isDefault && <span className="text-xs text-muted-foreground italic">default</span>}
              </span>
            </ListItem>
            )
          })}
          <Button size="sm" variant="outline" className="w-full" onClick={() => { updateValues([...values, bindingDefault ?? '']); setSelectedIdx(values.length) }}>+ Add value</Button>
        </div>
      )}
    </div>
  )
}

function ValueEditor({ property, value, bindingValues, gameFonts, gameImages, onUploadFile, layout, selectedNodeId, onChange }: Omit<ControlPanelProps, 'onBindingChange' | 'onBindingValuesChange'>) {
  const allowedValues = bindingValues
  if (allowedValues?.length) {
    return (
      <select
        value={String(value ?? '')}
        onChange={(e) => onChange(e.target.value)}
        className="w-full rounded-md border bg-background px-3 py-2 text-sm"
      >
        <option value="">— select —</option>
        {allowedValues.map((v) => <option key={v} value={v}>{v}</option>)}
      </select>
    )
  }

  const meta = getFieldMeta(property, layout, selectedNodeId, gameFonts)

  if (meta.type === 'number') {
    return <NumberEditor value={String(value ?? 0)} onChange={(v) => onChange(Number(v))} min={meta.min} max={meta.max} step={meta.step} />
  }

  if (meta.type === 'select') {
    return (
      <select
        value={String(value ?? '')}
        onChange={(e) => onChange(e.target.value)}
        className="w-full rounded-md border bg-background px-3 py-2 text-sm"
      >
        {meta.options?.map((opt) => (
          <option key={opt.value} value={opt.value}>{opt.label}</option>
        ))}
      </select>
    )
  }

  if (meta.type === 'color') {
    return <ColorControl value={String(value ?? '')} onChange={onChange} />
  }

  if (meta.type === 'image-upload') {
    return <ImageUploadEditor value={String(value ?? '')} onChange={(v) => onChange(v)} aspectRatio={layout.width / layout.height} gameImages={gameImages} onUploadFile={onUploadFile} />
  }

  if (meta.type === 'richtext') {
    return <RichTextField value={String(value ?? '')} onChange={(html) => onChange(html)} />
  }

  if (meta.type === 'emoji') {
    return <EmojiPicker value={String(value ?? '')} onChange={onChange} />
  }

  if (meta.type === 'boolean') {
    const checked = value !== false && value !== 'false'
    return (
      <button
        onClick={() => onChange(!checked)}
        className={`w-full rounded-md border px-3 py-2 text-sm text-left transition-colors ${checked ? 'bg-primary/10 border-primary text-primary' : 'bg-background border-input text-muted-foreground'}`}
      >{checked ? 'Yes' : 'No'}</button>
    )
  }

  if (meta.type === 'anchor') {
    const anchor = (value as { x: number; y: number }) ?? { x: 0, y: 0 }
    return <AnchorGrid value={anchor} onChange={onChange} />
  }

  // text
  return (
    <Input
      value={String(value ?? '')}
      onChange={(e) => onChange(e.target.value)}
    />
  )
}

export default function ControlPanel({ property, value, binding, bindingValues, bindingDefault, itemType, gameFonts, gameImages, onUploadFile, layout, selectedNodeId, onChange, onBindingChange, onBindingValuesChange, onBindingDefaultChange }: ControlPanelProps) {
  const canBind = !NO_BINDING.has(property)
  const isBound = !!binding

  if (!canBind) {
    return <ValueEditor property={property} value={value} bindingValues={bindingValues} gameFonts={gameFonts} gameImages={gameImages} onUploadFile={onUploadFile} layout={layout} selectedNodeId={selectedNodeId} onChange={onChange} />
  }

  return (
    <div className="space-y-2">
      <div className="flex gap-1 rounded-md border p-0.5 w-fit">
        <button
          className={`rounded px-2 py-0.5 text-xs font-medium transition-colors ${!isBound ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:text-foreground'}`}
          onClick={() => { if (isBound) onBindingChange?.(null) }}
        >Value</button>
        <button
          className={`rounded px-2 py-0.5 text-xs font-medium transition-colors ${isBound ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:text-foreground'}`}
          onClick={() => { if (!isBound) onBindingChange?.({ field: property }) }}
        >Data</button>
      </div>
      {isBound
        ? <BindingEditor property={property} itemType={itemType} layout={layout} binding={binding} values={bindingValues ?? []} bindingDefault={bindingDefault} onSetDefault={(v) => onBindingDefaultChange?.(v)} onChange={(b) => onBindingChange?.(b)} onValuesChange={(v) => onBindingValuesChange?.(v)} />
        : <ValueEditor property={property} value={value} bindingValues={bindingValues} gameFonts={gameFonts} gameImages={gameImages} onUploadFile={onUploadFile} layout={layout} selectedNodeId={selectedNodeId} onChange={onChange} />
      }
    </div>
  )
}
