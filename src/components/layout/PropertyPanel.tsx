import ControlPanel from './ControlPanel'
import type { CardTemplate } from '../../types'
import { findSectionById, findItemById, getNodeKind } from './templateHelpers'

type PropertyPanelProps = {
  template: CardTemplate
  selectedNodeId: string
  selectedProperty: string | null
  gameId?: string
  onSelectProperty: (property: string) => void
  onPropertyChange: (property: string, value: unknown) => void
}

type PropertyDef = { key: string; label: string }

const SECTION_PROPERTIES: PropertyDef[] = [
  { key: 'name', label: 'Name' },
  { key: 'layout', label: 'Layout' },
  { key: 'sizePct', label: 'Size %' },
  { key: 'gap', label: 'Gap' },
]

const COMMON_ITEM_PROPERTIES: PropertyDef[] = [
  { key: 'name', label: 'Name' },
  { key: 'widthPct', label: 'Width %' },
  { key: 'heightPct', label: 'Height %' },
  { key: 'anchor', label: 'Anchor' },
  { key: 'attachAnchor', label: 'Attach Anchor' },
  { key: 'attachTargetId', label: 'Attach Target' },
]

const TEXT_PROPERTIES: PropertyDef[] = [
  { key: 'fieldId', label: 'Field ID' },
  { key: 'defaultValue', label: 'Default' },
  { key: 'fontSize', label: 'Font Size' },
  { key: 'align', label: 'H Align' },
  { key: 'verticalAlign', label: 'V Align' },
  { key: 'font', label: 'Font' },
  { key: 'color', label: 'Color' },
]

const FRAME_PROPERTIES: PropertyDef[] = [
  { key: 'strokeWidth', label: 'Stroke Width' },
  { key: 'strokeColor', label: 'Stroke Color' },
  { key: 'fillColor', label: 'Fill Color' },
  { key: 'cornerRadius', label: 'Corner Radius' },
]

const IMAGE_PROPERTIES: PropertyDef[] = [
  { key: 'fieldId', label: 'Field ID' },
  { key: 'defaultValue', label: 'Default Image' },
  { key: 'fit', label: 'Fit' },
  { key: 'cornerRadius', label: 'Corner Radius' },
]

const getPropertiesForNode = (kind: 'section' | 'item', node: any): PropertyDef[] => {
  if (kind === 'section') return SECTION_PROPERTIES
  const itemType = node.type ?? 'text'
  switch (itemType) {
    case 'text': return [...COMMON_ITEM_PROPERTIES, ...TEXT_PROPERTIES]
    case 'frame': return [...COMMON_ITEM_PROPERTIES, ...FRAME_PROPERTIES]
    case 'image': return [...COMMON_ITEM_PROPERTIES, ...IMAGE_PROPERTIES]
    default: return COMMON_ITEM_PROPERTIES
  }
}

const getPropertyValue = (node: any, property: string): unknown => {
  if (property === 'attachAnchor') return node.attach?.anchor ?? { x: 0, y: 0 }
  if (property === 'attachTargetType') return node.attach?.targetType ?? 'section'
  if (property === 'attachTargetId') return node.attach?.targetId ?? ''
  if (property === 'anchor') return node.anchor ?? { x: 0, y: 0 }
  return node[property]
}

export default function PropertyPanel({
  template,
  selectedNodeId,
  selectedProperty,
  gameId,
  onSelectProperty,
  onPropertyChange,
}: PropertyPanelProps) {
  const kind = getNodeKind(template.root, selectedNodeId)
  if (!kind) return null

  const node = kind === 'section'
    ? findSectionById(template.root, selectedNodeId)
    : findItemById(template.root, selectedNodeId)
  if (!node) return null

  const properties = getPropertiesForNode(kind, node)
  const currentValue = selectedProperty ? getPropertyValue(node, selectedProperty) : null

  return (
    <div className="space-y-3">
      <div>
        <div className="flex flex-wrap gap-1.5">
          {properties.map((prop) => (
            <button
              key={prop.key}
              onClick={() => onSelectProperty(prop.key)}
              className={`rounded-full border px-2.5 py-0.5 text-xs font-medium transition-colors ${
                selectedProperty === prop.key
                  ? 'bg-primary text-primary-foreground border-primary'
                  : 'bg-background border-input hover:bg-accent/50'
              }`}
            >
              {prop.label}
            </button>
          ))}
        </div>
      </div>

      {selectedProperty && (
        <div>
          <ControlPanel
            property={selectedProperty}
            value={currentValue}
            template={template}
            selectedNodeId={selectedNodeId}
            gameId={gameId}
            onChange={(value) => onPropertyChange(selectedProperty, value)}
          />
        </div>
      )}
    </div>
  )
}
