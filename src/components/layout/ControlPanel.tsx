import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import AnchorGrid from './AnchorGrid'
import { flattenNodes } from './templateHelpers'
import type { CardTemplate } from '../../types'

type ControlPanelProps = {
  property: string
  value: unknown
  template: CardTemplate
  onChange: (value: unknown) => void
}

type FieldMeta = {
  type: 'number' | 'select' | 'anchor' | 'text'
  min?: number
  max?: number
  step?: number
  options?: { value: string; label: string }[]
}

const getFieldMeta = (property: string, template: CardTemplate): FieldMeta => {
  switch (property) {
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
    ]}
    case 'align': return { type: 'select', options: [
      { value: 'left', label: 'Left' },
      { value: 'center', label: 'Center' },
      { value: 'right', label: 'Right' },
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
      const nodes = flattenNodes(template.root)
      return { type: 'select', options: nodes.map((n) => ({
        value: n.id,
        label: `${n.kind === 'section' ? '▸' : '·'} ${n.name}`,
      }))}
    }
    case 'anchor':
    case 'attachAnchor': return { type: 'anchor' }
    default: return { type: 'text' }
  }
}

export default function ControlPanel({ property, value, template, onChange }: ControlPanelProps) {
  const meta = getFieldMeta(property, template)

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
            className="w-24 text-center"
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
