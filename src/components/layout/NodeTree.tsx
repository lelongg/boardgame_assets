import { useState, useRef, useCallback } from 'react'
import { Plus, Trash2, FolderPlus } from 'lucide-react'
import { flattenNodes } from './templateHelpers'
import type { CardTemplateSection } from '../../types'

type NodeTreeProps = {
  root: CardTemplateSection
  selectedNodeId: string | null
  onSelectNode: (id: string) => void
  onDrop: (dragId: string, dragKind: 'section' | 'item', dropTargetId: string, position: 'before' | 'after' | 'inside') => void
  onAddSection?: () => void
  onAddItem?: (type: 'text' | 'frame' | 'image') => void
  onDelete?: () => void
  canAddSection?: boolean
  canAddItem?: boolean
  canDelete?: boolean
}

type DropIndicator = {
  targetId: string
  position: 'before' | 'after' | 'inside'
}

export default function NodeTree({ root, selectedNodeId, onSelectNode, onDrop, onAddSection, onAddItem, onDelete, canAddSection, canAddItem, canDelete }: NodeTreeProps) {
  const [showItemMenu, setShowItemMenu] = useState(false)
  const allNodes = flattenNodes(root)
  const [dragId, setDragId] = useState<string | null>(null)
  const [dropIndicator, setDropIndicator] = useState<DropIndicator | null>(null)
  const [collapsed, setCollapsed] = useState<Set<string>>(() => {
    try {
      const stored = localStorage.getItem('nodeTree:collapsed')
      return stored ? new Set(JSON.parse(stored)) : new Set()
    } catch { return new Set() }
  })
  const nodeRefs = useRef<Map<string, HTMLElement>>(new Map())
  const updateCollapsed = useCallback((updater: (prev: Set<string>) => Set<string>) => {
    setCollapsed(prev => {
      const next = updater(prev)
      localStorage.setItem('nodeTree:collapsed', JSON.stringify([...next]))
      return next
    })
  }, [])

  // Filter out nodes whose ancestor section is collapsed
  const nodes = allNodes.filter((node) => {
    const ancestors: string[] = []
    let d = node.depth - 1
    for (let i = allNodes.indexOf(node) - 1; i >= 0 && d >= 0; i--) {
      if (allNodes[i].depth === d && allNodes[i].kind === 'section') {
        ancestors.push(allNodes[i].id)
        d--
      }
    }
    return !ancestors.some((id) => collapsed.has(id))
  })

  const allSectionIds = allNodes.filter(n => n.kind === 'section').map(n => n.id)
  const allCollapsed = allSectionIds.length > 0 && allSectionIds.every(id => collapsed.has(id))

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
      <div className="flex items-center gap-1 px-1 pb-1">
        <button
          onClick={() => updateCollapsed(() => allCollapsed ? new Set() : new Set(allSectionIds))}
          className="rounded px-2 py-1 text-xs text-muted-foreground hover:text-foreground transition-colors"
        >
          {allCollapsed ? '▾ Expand' : '▸ Collapse'}
        </button>
        <div className="ml-auto flex items-center gap-0.5">
          {onAddSection && (
            <button
              onClick={onAddSection}
              disabled={!canAddSection}
              className="rounded p-1 text-muted-foreground hover:text-foreground disabled:opacity-30 transition-colors"
              title="Add Section"
            >
              <FolderPlus className="h-4 w-4" />
            </button>
          )}
          {onAddItem && (
            <div className="relative">
              <button
                onClick={() => setShowItemMenu(!showItemMenu)}
                disabled={!canAddItem}
                className="rounded p-1 text-muted-foreground hover:text-foreground disabled:opacity-30 transition-colors"
                title="Add Item"
              >
                <Plus className="h-4 w-4" />
              </button>
              {showItemMenu && (
                <div className="absolute top-full right-0 z-10 mt-1 rounded-md border bg-background p-1 shadow-md">
                  <button onClick={() => { onAddItem('text'); setShowItemMenu(false) }} className="block w-full rounded px-3 py-1.5 text-left text-sm hover:bg-accent/50">Text</button>
                  <button onClick={() => { onAddItem('frame'); setShowItemMenu(false) }} className="block w-full rounded px-3 py-1.5 text-left text-sm hover:bg-accent/50">Frame</button>
                  <button onClick={() => { onAddItem('image'); setShowItemMenu(false) }} className="block w-full rounded px-3 py-1.5 text-left text-sm hover:bg-accent/50">Image</button>
                </div>
              )}
            </div>
          )}
          {onDelete && canDelete && (
            <button
              onClick={onDelete}
              className="rounded p-1 text-muted-foreground hover:text-destructive transition-colors"
              title="Delete"
            >
              <Trash2 className="h-4 w-4" />
            </button>
          )}
        </div>
      </div>
      {nodes.map((node) => {
        const isSelected = node.id === selectedNodeId
        const isDragging = node.id === dragId
        const isRoot = node.id === root.id
        const isSection = node.kind === 'section'
        const isCollapsed = collapsed.has(node.id)
        const hasChildren = isSection && ((node.obj as CardTemplateSection).children.length > 0 || (node.obj as CardTemplateSection).items.length > 0)
        const prefix = isSection ? (hasChildren ? (isCollapsed ? '▸' : '▾') : '▾') : '·'
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
            onClick={() => {
              if (isSelected && isSection && hasChildren) {
                updateCollapsed(prev => {
                  const next = new Set(prev)
                  next.has(node.id) ? next.delete(node.id) : next.add(node.id)
                  return next
                })
              } else {
                onSelectNode(node.id)
              }
            }}
            className={`w-full rounded px-2 py-1.5 text-left text-sm transition-colors cursor-grab ${
              isDragging ? 'opacity-40' : ''
            } ${
              isSelected
                ? 'bg-primary text-primary-foreground'
                : nodes.indexOf(node) % 2 === 0
                  ? 'bg-muted/30 hover:bg-accent/50'
                  : 'hover:bg-accent/50'
            } ${dropClass}`}
            style={{ paddingLeft: `${8 + node.depth * 16}px` }}
          >
            <span
              className={`mr-1.5 ${isSection && hasChildren ? 'cursor-pointer' : ''}`}
              onClick={(e) => {
                if (!isSection || !hasChildren) return
                e.stopPropagation()
                updateCollapsed(prev => {
                  const next = new Set(prev)
                  next.has(node.id) ? next.delete(node.id) : next.add(node.id)
                  return next
                })
              }}
            >{prefix}</span>
            <span className="font-medium">{node.name}</span>
            <span className="ml-1.5 opacity-60">{typeLabel}</span>
          </div>
        )
      })}
    </div>
  )
}
