import { flattenNodes } from './templateHelpers'
import type { CardTemplateSection } from '../../types'

type NodeTreeProps = {
  root: CardTemplateSection
  selectedNodeId: string | null
  onSelectNode: (id: string) => void
}

export default function NodeTree({ root, selectedNodeId, onSelectNode }: NodeTreeProps) {
  const nodes = flattenNodes(root)

  return (
    <div className="space-y-0.5">
      {nodes.map((node) => {
        const isSelected = node.id === selectedNodeId
        const prefix = node.kind === 'section' ? '▸' : '·'
        const typeLabel = node.kind === 'section'
          ? `(${(node.obj as CardTemplateSection).layout})`
          : `[${(node.obj as any).type ?? 'text'}]`

        return (
          <button
            key={node.id}
            onClick={() => onSelectNode(node.id)}
            className={`w-full rounded px-2 py-1.5 text-left text-sm transition-colors ${
              isSelected
                ? 'bg-primary text-primary-foreground'
                : 'hover:bg-accent/50'
            }`}
            style={{ paddingLeft: `${8 + node.depth * 16}px` }}
          >
            <span className="mr-1.5">{prefix}</span>
            <span className="font-medium">{node.name}</span>
            <span className="ml-1.5 opacity-60">{typeLabel}</span>
          </button>
        )
      })}
    </div>
  )
}
