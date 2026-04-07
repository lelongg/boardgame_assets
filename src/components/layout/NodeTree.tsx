import { useState, useRef } from 'react'
import { flattenNodes } from './templateHelpers'
import type { CardTemplateSection } from '../../types'

type NodeTreeProps = {
  root: CardTemplateSection
  selectedNodeId: string | null
  onSelectNode: (id: string) => void
  onDrop: (dragId: string, dragKind: 'section' | 'item', dropTargetId: string, position: 'before' | 'after' | 'inside') => void
}

type DropIndicator = {
  targetId: string
  position: 'before' | 'after' | 'inside'
}

export default function NodeTree({ root, selectedNodeId, onSelectNode, onDrop }: NodeTreeProps) {
  const nodes = flattenNodes(root)
  const [dragId, setDragId] = useState<string | null>(null)
  const [dropIndicator, setDropIndicator] = useState<DropIndicator | null>(null)
  const nodeRefs = useRef<Map<string, HTMLElement>>(new Map())

  const getDropPosition = (e: React.DragEvent, nodeId: string): DropIndicator['position'] => {
    const el = nodeRefs.current.get(nodeId)
    if (!el) return 'inside'
    const rect = el.getBoundingClientRect()
    const y = e.clientY - rect.top
    const h = rect.height
    if (y < h * 0.25) return 'before'
    if (y > h * 0.75) return 'after'
    return 'inside'
  }

  return (
    <div className="space-y-0.5">
      {nodes.map((node) => {
        const isSelected = node.id === selectedNodeId
        const isDragging = node.id === dragId
        const isRoot = node.id === root.id
        const prefix = node.kind === 'section' ? '▸' : '·'
        const typeLabel = node.kind === 'section'
          ? `(${(node.obj as CardTemplateSection).layout})`
          : `[${(node.obj as any).type ?? 'text'}]`

        const isDropTarget = dropIndicator?.targetId === node.id
        const dropPos = isDropTarget ? dropIndicator!.position : null

        let dropClass = ''
        if (isDropTarget) {
          if (dropPos === 'before') dropClass = 'border-t-2 border-t-blue-500'
          else if (dropPos === 'after') dropClass = 'border-b-2 border-b-blue-500'
          else dropClass = 'ring-2 ring-blue-500 ring-inset'
        }

        return (
          <div
            key={node.id}
            ref={(el) => { if (el) nodeRefs.current.set(node.id, el); else nodeRefs.current.delete(node.id) }}
            draggable={!isRoot}
            onDragStart={(e) => {
              setDragId(node.id)
              e.dataTransfer.setData('text/plain', JSON.stringify({ id: node.id, kind: node.kind }))
              e.dataTransfer.effectAllowed = 'move'
            }}
            onDragEnd={() => {
              setDragId(null)
              setDropIndicator(null)
            }}
            onDragOver={(e) => {
              e.preventDefault()
              e.dataTransfer.dropEffect = 'move'
              if (node.id === dragId) return
              const position = getDropPosition(e, node.id)
              setDropIndicator({ targetId: node.id, position })
            }}
            onDragLeave={() => {
              setDropIndicator((prev) => prev?.targetId === node.id ? null : prev)
            }}
            onDrop={(e) => {
              e.preventDefault()
              if (!dropIndicator || node.id === dragId) return
              try {
                const data = JSON.parse(e.dataTransfer.getData('text/plain'))
                onDrop(data.id, data.kind, dropIndicator.targetId, dropIndicator.position)
              } catch { /* ignore */ }
              setDragId(null)
              setDropIndicator(null)
            }}
            onClick={() => onSelectNode(node.id)}
            className={`w-full rounded px-2 py-1.5 text-left text-sm transition-colors cursor-grab ${
              isDragging ? 'opacity-40' : ''
            } ${
              isSelected
                ? 'bg-primary text-primary-foreground'
                : 'hover:bg-accent/50'
            } ${dropClass}`}
            style={{ paddingLeft: `${8 + node.depth * 16}px` }}
          >
            <span className="mr-1.5">{prefix}</span>
            <span className="font-medium">{node.name}</span>
            <span className="ml-1.5 opacity-60">{typeLabel}</span>
          </div>
        )
      })}
    </div>
  )
}
