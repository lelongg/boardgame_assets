import { useState } from 'react'
import { Button } from '@/components/ui/button'
import type { CardTemplate, CardTemplateSection, CardTemplateItem, CardTemplateTextItem, CardTemplateFrameItem, CardTemplateImageItem } from '../../types'
import { findSectionById, findItemById, findNodeLocation, findParentSection, getNodeKind } from './templateHelpers'

type TemplateActionsProps = {
  template: CardTemplate
  selectedNodeId: string | null
  onTemplateChange: (template: CardTemplate) => void
  onSelectNode: (id: string | null) => void
}

const newSection = (): CardTemplateSection => ({
  id: crypto.randomUUID(),
  name: 'New Section',
  layout: 'stack',
  sizePct: 100,
  gap: 0,
  children: [],
  items: [],
})

const newTextItem = (sectionId: string): CardTemplateTextItem => ({
  type: 'text',
  id: crypto.randomUUID(),
  name: 'New Text',
  fieldId: 'field',
  anchor: { x: 0, y: 0 },
  attach: { targetType: 'section', targetId: sectionId, anchor: { x: 0, y: 0 } },
  widthPct: 80,
  heightPct: 20,
  fontSize: 20,
  align: 'left',
})

const newFrameItem = (sectionId: string): CardTemplateFrameItem => ({
  type: 'frame',
  id: crypto.randomUUID(),
  name: 'New Frame',
  anchor: { x: 0.5, y: 0.5 },
  attach: { targetType: 'section', targetId: sectionId, anchor: { x: 0.5, y: 0.5 } },
  widthPct: 90,
  heightPct: 90,
  strokeWidth: 2,
  cornerRadius: 8,
})

const newImageItem = (sectionId: string): CardTemplateImageItem => ({
  type: 'image',
  id: crypto.randomUUID(),
  name: 'New Image',
  fieldId: 'image',
  anchor: { x: 0.5, y: 0.5 },
  attach: { targetType: 'section', targetId: sectionId, anchor: { x: 0.5, y: 0.5 } },
  widthPct: 80,
  heightPct: 60,
  fit: 'cover',
  cornerRadius: 0,
})

export default function TemplateActions({ template, selectedNodeId, onTemplateChange, onSelectNode }: TemplateActionsProps) {
  const [showItemType, setShowItemType] = useState(false)

  const selectedKind = selectedNodeId ? getNodeKind(template.root, selectedNodeId) : null
  const isRoot = selectedNodeId === template.root.id
  const canAddSection = !selectedKind || selectedKind === 'section'
  const canAddItem = !selectedKind || selectedKind === 'section'

  let canMoveUp = false
  let canMoveDown = false
  if (selectedNodeId && selectedKind && !isRoot) {
    const loc = findNodeLocation(template.root, selectedNodeId, selectedKind)
    if (loc) {
      canMoveUp = loc.index > 0
      canMoveDown = loc.index < loc.list.length - 1
    }
  }

  const clone = (): CardTemplate => JSON.parse(JSON.stringify(template))

  const handleAddSection = () => {
    const t = clone()
    const parentId = selectedKind === 'section' && selectedNodeId ? selectedNodeId : t.root.id
    const parent = findSectionById(t.root, parentId)
    if (!parent) return
    const section = newSection()
    parent.children.push(section)
    onTemplateChange(t)
    onSelectNode(section.id)
  }

  const handleAddItem = (itemType: 'text' | 'frame' | 'image') => {
    const t = clone()
    let parentId: string
    if (selectedKind === 'section' && selectedNodeId) {
      parentId = selectedNodeId
    } else if (selectedKind === 'item' && selectedNodeId) {
      const parent = findParentSection(t.root, selectedNodeId, 'item')
      parentId = parent?.id ?? t.root.id
    } else {
      parentId = t.root.id
    }
    const parent = findSectionById(t.root, parentId)
    if (!parent) return

    let item: CardTemplateItem
    if (itemType === 'frame') item = newFrameItem(parentId)
    else if (itemType === 'image') item = newImageItem(parentId)
    else item = newTextItem(parentId)

    if (selectedKind === 'item' && selectedNodeId) {
      const loc = findNodeLocation(t.root, selectedNodeId, 'item')
      if (loc) {
        loc.list.splice(loc.index + 1, 0, item)
      } else {
        parent.items.push(item)
      }
    } else {
      parent.items.push(item)
    }

    onTemplateChange(t)
    onSelectNode(item.id)
    setShowItemType(false)
  }

  const handleMove = (direction: -1 | 1) => {
    if (!selectedNodeId || !selectedKind || isRoot) return
    const t = clone()
    const loc = findNodeLocation(t.root, selectedNodeId, selectedKind)
    if (!loc) return
    const target = loc.index + direction
    if (target < 0 || target >= loc.list.length) return
    const [moved] = loc.list.splice(loc.index, 1)
    loc.list.splice(target, 0, moved)
    onTemplateChange(t)
  }

  const handleDelete = () => {
    if (!selectedNodeId || !selectedKind || isRoot) return
    if (!confirm('Delete this node?')) return
    const t = clone()
    const loc = findNodeLocation(t.root, selectedNodeId, selectedKind)
    if (!loc) return
    loc.list.splice(loc.index, 1)
    onTemplateChange(t)
    onSelectNode(null)
  }

  return (
    <div className="flex flex-wrap gap-2">
      <Button size="sm" variant="outline" onClick={handleAddSection} disabled={!canAddSection}>
        Add Section
      </Button>
      <div className="relative">
        <Button size="sm" variant="outline" onClick={() => setShowItemType(!showItemType)} disabled={!canAddItem}>
          Add Item
        </Button>
        {showItemType && (
          <div className="absolute top-full left-0 z-10 mt-1 rounded-md border bg-background p-1 shadow-md">
            <button onClick={() => handleAddItem('text')} className="block w-full rounded px-3 py-1.5 text-left text-sm hover:bg-accent/50">Text</button>
            <button onClick={() => handleAddItem('frame')} className="block w-full rounded px-3 py-1.5 text-left text-sm hover:bg-accent/50">Frame</button>
            <button onClick={() => handleAddItem('image')} className="block w-full rounded px-3 py-1.5 text-left text-sm hover:bg-accent/50">Image</button>
          </div>
        )}
      </div>
      {selectedNodeId && !isRoot && (
        <>
          <Button size="sm" variant="outline" onClick={() => handleMove(-1)} disabled={!canMoveUp}>Move Up</Button>
          <Button size="sm" variant="outline" onClick={() => handleMove(1)} disabled={!canMoveDown}>Move Down</Button>
          <Button size="sm" variant="destructive" onClick={handleDelete}>Delete</Button>
        </>
      )}
    </div>
  )
}
