import { useState, useEffect, useRef } from 'react'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { RgbaColorPicker } from 'react-colorful'
import AnchorGrid from './AnchorGrid'
import { findParentSection, findItemById, getNodeKind } from './templateHelpers'
import type { CardTemplate } from '../../types'

type ControlPanelProps = {
  property: string
  value: unknown
  template: CardTemplate
  selectedNodeId?: string
  onChange: (value: unknown) => void
}

type FieldMeta = {
  type: 'number' | 'select' | 'anchor' | 'text' | 'color' | 'image-upload' | 'emoji'
  min?: number
  max?: number
  step?: number
  options?: { value: string; label: string }[]
}

const getFieldMeta = (property: string, template: CardTemplate, selectedNodeId?: string): FieldMeta => {
  switch (property) {
    case 'width': return { type: 'number', min: 50, max: 2000, step: 1 }
    case 'height': return { type: 'number', min: 50, max: 2000, step: 1 }
    case 'radius': return { type: 'number', min: 0, max: 100, step: 1 }
    case 'bleed': return { type: 'number', min: 0, max: 50, step: 1 }
    case 'sizePct': return { type: 'number', min: 0, max: 100, step: 1 }
    case 'gap': return { type: 'number', min: 0, max: 100, step: 1 }
    case 'fontSize': return { type: 'number', min: 8, max: 120, step: 1 }
    case 'widthPct': return { type: 'number', min: 0, max: 200, step: 1 }
    case 'heightPct': return { type: 'number', min: 0, max: 200, step: 1 }
    case 'strokeWidth': return { type: 'number', min: 0, max: 20, step: 0.5 }
    case 'cornerRadius': return { type: 'number', min: 0, max: 100, step: 1 }
    case 'layout': return { type: 'select', options: [
      { value: 'row', label: 'Row' },
      { value: 'column', label: 'Column' },
      { value: 'stack', label: 'Stack' },
      { value: 'grid', label: 'Grid' },
    ]}
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
    case 'font': return { type: 'select', options: Object.entries(template.fonts ?? {}).map(([key, slot]) => ({
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
      const kind = getNodeKind(template.root, selectedNodeId)
      const parent = kind ? findParentSection(template.root, selectedNodeId, kind) : null
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
        const item = findItemById(template.root, selectedNodeId)
        if (item && (item as any).type === 'image') return { type: 'image-upload' }
      }
      return { type: 'text' }
    }
    case 'emoji': return { type: 'emoji' }
    case 'anchor':
    case 'attachAnchor': return { type: 'anchor' }
    default: return { type: 'text' }
  }
}

const hexToRgba = (hex: string) => {
  if (!hex || hex === 'none') return { r: 0, g: 0, b: 0, a: 0 }
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
  const pickerRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    let picker: any
    const init = async () => {
      const mod = await import('emoji-picker-element')
      const Picker = 'default' in mod ? (mod as any).default : mod.Picker ?? (mod as any)
      picker = new Picker()
      picker.style.width = '100%'
      picker.addEventListener('emoji-click', (e: any) => {
        onChange(e.detail.unicode)
      })
      pickerRef.current?.appendChild(picker)
    }
    init()
    return () => { if (picker?.remove) picker.remove() }
  }, [onChange])

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2">
        <span className="text-3xl">{value || '⭐'}</span>
        <Input
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder="Type or paste emoji"
          className="flex-1"
        />
      </div>
      <div ref={pickerRef} />
    </div>
  )
}

export default function ControlPanel({ property, value, template, selectedNodeId, onChange }: ControlPanelProps) {
  const meta = getFieldMeta(property, template, selectedNodeId)

  if (meta.type === 'number') {
    const numVal = Number(value ?? 0)
    const step = meta.step ?? 1
    return (
      <div className="space-y-2">
        <input
          type="range"
          min={meta.min}
          max={meta.max}
          step={meta.step}
          value={numVal}
          onChange={(e) => onChange(Number(e.target.value))}
          className="w-full"
        />
        <div className="flex items-center gap-2">
          <Button size="sm" variant="outline" onClick={() => onChange(Math.max(meta.min ?? 0, numVal - step))}>-</Button>
          <Input
            type="number"
            min={meta.min}
            max={meta.max}
            step={meta.step}
            value={numVal}
            onChange={(e) => onChange(Number(e.target.value))}
            className="flex-1 text-center"
          />
          <Button size="sm" variant="outline" onClick={() => onChange(Math.min(meta.max ?? 100, numVal + step))}>+</Button>
        </div>
      </div>
    )
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
    const imgUrl = String(value ?? '')
    return (
      <div className="space-y-2">
        {imgUrl && (
          <img src={imgUrl} alt="Default" className="max-h-24 rounded border object-contain" />
        )}
        <Button
          size="sm"
          variant="outline"
          onClick={() => {
            const input = document.createElement('input')
            input.type = 'file'
            input.accept = 'image/*'
            input.onchange = async () => {
              const file = input.files?.[0]
              if (!file) return
              const dataUrl = await new Promise((resolve) => {
                const reader = new FileReader()
                reader.onload = () => resolve(reader.result)
                reader.readAsDataURL(file)
              })
              onChange(dataUrl)
            }
            input.click()
          }}
        >
          {imgUrl ? 'Change Image' : 'Upload Image'}
        </Button>
        {imgUrl && (
          <Button size="sm" variant="ghost" onClick={() => onChange('')}>
            Remove
          </Button>
        )}
      </div>
    )
  }

  if (meta.type === 'emoji') {
    return <EmojiPicker value={String(value ?? '')} onChange={onChange} />
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
