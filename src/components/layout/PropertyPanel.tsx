import ControlPanel from './ControlPanel'
import type { CardLayout } from '../../types'
import { findSectionById, findItemById, getNodeKind } from './layoutHelpers'

type PropertyPanelProps = {
  layout: CardLayout
  gameFonts?: Record<string, { name: string; file: string }>
  gameImages?: { file: string; url: string; name: string }[]
  onUploadFile?: (file: File) => Promise<string>
  selectedNodeId: string
  selectedProperty: string | null
  onSelectProperty: (property: string) => void
  onPropertyChange: (property: string, value: unknown) => void
}

type PropertyDef = { key: string; label: string }

const SECTION_PROPERTIES: PropertyDef[] = [
  { key: 'name', label: 'Name' },
  { key: 'visible', label: 'Visible' },
  { key: 'layout', label: 'Layout' },
  { key: 'sizePct', label: 'Size %' },
  { key: 'gap', label: 'Gap' },
  { key: 'columns', label: 'Columns' },
  { key: 'repeatCount', label: 'Repeat' },
  { key: 'repeatOffsetX', label: 'Repeat X' },
  { key: 'repeatOffsetY', label: 'Repeat Y' },
]

const ROOT_PROPERTIES: PropertyDef[] = [
  { key: 'name', label: 'Name' },
  { key: 'width', label: 'Width' },
  { key: 'height', label: 'Height' },
  { key: 'radius', label: 'Radius' },
  { key: 'bleed', label: 'Bleed' },
  { key: 'layout', label: 'Layout' },
  { key: 'gap', label: 'Gap' },
]

const COMMON_ITEM_PROPERTIES: PropertyDef[] = [
  { key: 'name', label: 'Name' },
  { key: 'visible', label: 'Visible' },
  { key: 'widthMm', label: 'Width' },
  { key: 'heightMm', label: 'Height' },
  { key: 'offsetX', label: 'Offset X' },
  { key: 'offsetY', label: 'Offset Y' },
  { key: 'rotation', label: 'Rotation' },
  { key: 'anchor', label: 'Anchor' },
  { key: 'attachAnchor', label: 'Attach Anchor' },
  { key: 'attachTargetId', label: 'Attach Target' },
]

const TEXT_PROPERTIES: PropertyDef[] = [
  { key: 'defaultValue', label: 'Text' },
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
  { key: 'defaultValue', label: 'Image' },
  { key: 'fit', label: 'Fit' },
  { key: 'cornerRadius', label: 'Corner Radius' },
]

const EMOJI_PROPERTIES: PropertyDef[] = [
  { key: 'emoji', label: 'Emoji' },
  { key: 'fontSize', label: 'Size' },
]

const COPY_PROPERTIES: PropertyDef[] = [
  { key: 'copyTargetId', label: 'Target' },
  { key: 'scale', label: 'Scale' },
]

const getPropertiesForNode = (kind: 'section' | 'item', node: any, isRoot: boolean): PropertyDef[] => {
  if (kind === 'section') return isRoot ? ROOT_PROPERTIES : SECTION_PROPERTIES
  const itemType = node.type ?? 'text'
  switch (itemType) {
    case 'text': return [...COMMON_ITEM_PROPERTIES, ...TEXT_PROPERTIES]
    case 'frame': return [...COMMON_ITEM_PROPERTIES, ...FRAME_PROPERTIES]
    case 'image': return [...COMMON_ITEM_PROPERTIES, ...IMAGE_PROPERTIES]
    case 'emoji': return [...COMMON_ITEM_PROPERTIES, ...EMOJI_PROPERTIES]
    case 'copy': return [...COMMON_ITEM_PROPERTIES.filter(p => p.key !== 'widthMm' && p.key !== 'heightMm'), ...COPY_PROPERTIES]
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
  layout,
  gameFonts,
  gameImages,
  onUploadFile,
  selectedNodeId,
  selectedProperty,
  onSelectProperty,
  onPropertyChange,
}: PropertyPanelProps) {
  const kind = getNodeKind(layout.root, selectedNodeId)
  if (!kind) return null

  const isRoot = selectedNodeId === layout.root.id
  const node = kind === 'section'
    ? findSectionById(layout.root, selectedNodeId)
    : findItemById(layout.root, selectedNodeId)
  if (!node) return null

  const TEMPLATE_KEYS = new Set(['width', 'height', 'radius', 'bleed'])
  const properties = getPropertiesForNode(kind, node, isRoot)
  const bindings = (node as any).bindings ?? {}
  const currentValue = selectedProperty
    ? (TEMPLATE_KEYS.has(selectedProperty) ? (layout as any)[selectedProperty] : getPropertyValue(node, selectedProperty))
    : null

  return (
    <div className="space-y-3">
      <div>
        <div className="flex flex-wrap gap-1.5">
          {properties.map((prop) => {
            const hasBind = !!bindings[prop.key]
            return (
              <button
                key={prop.key}
                onClick={() => onSelectProperty(prop.key)}
                className={`rounded-full border px-2.5 py-0.5 text-xs font-medium transition-colors ${
                  selectedProperty === prop.key
                    ? 'bg-primary text-primary-foreground border-primary'
                    : hasBind
                      ? 'bg-blue-50 border-blue-300 text-blue-700 dark:bg-blue-950 dark:border-blue-700 dark:text-blue-300 hover:bg-blue-100 dark:hover:bg-blue-900'
                      : 'bg-background border-input hover:bg-accent/50'
                }`}
              >
                {hasBind && <span className="inline-block w-1.5 h-1.5 rounded-full bg-blue-500 mr-1 -ml-0.5" />}
                {prop.label}
              </button>
            )
          })}
        </div>
      </div>

      {selectedProperty && (
        <div>
          <ControlPanel
            property={selectedProperty}
            value={currentValue}
            gameFonts={gameFonts}
            gameImages={gameImages}
            onUploadFile={onUploadFile}
            binding={bindings[selectedProperty]}
            bindingValues={bindings[selectedProperty] ? layout.bindingMeta?.[`${selectedProperty}:${bindings[selectedProperty].field}`]?.values : undefined}
            bindingDefault={bindings[selectedProperty] ? layout.bindingMeta?.[`${selectedProperty}:${bindings[selectedProperty].field}`]?.default : undefined}
            itemType={kind === 'item' ? ((node as any).type ?? 'text') : undefined}
            layout={layout}
            selectedNodeId={selectedNodeId}
            onChange={(value) => onPropertyChange(selectedProperty, value)}
            onBindingChange={(binding) => onPropertyChange('__binding__' + selectedProperty, binding)}
            onBindingValuesChange={(values) => {
              const binding = bindings[selectedProperty]
              if (binding) onPropertyChange(`__bindingValues__${selectedProperty}:${binding.field}`, values)
            }}
            onBindingDefaultChange={(defaultValue) => {
              const binding = bindings[selectedProperty]
              if (binding) onPropertyChange(`__bindingDefault__${selectedProperty}:${binding.field}`, defaultValue)
            }}
          />
        </div>
      )}
    </div>
  )
}
