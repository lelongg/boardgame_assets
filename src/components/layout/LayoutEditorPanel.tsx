import { useState, useEffect } from 'react'
import NodeTree from './NodeTree'
import PropertyPanel from './PropertyPanel'
import LayoutPreview, { type PreviewCard } from '../LayoutPreview'
import CollapsibleHeader, { useCollapsible } from '../ui/CollapsibleHeader'
import { getNodeKind, moveNode, findSectionById, findNodeLocation, findParentSection, findItemById, deepCloneWithNewIds } from './layoutHelpers'
import { applyPropertyChange } from './applyPropertyChange'
import type { CardLayout } from '../../types'

type LayoutEditorPanelProps = {
  layout: CardLayout
  onSave: (updated: CardLayout) => void | Promise<void>
  gameId: string
  gameFonts?: Record<string, { name: string; file: string }>
  gameImages?: { file: string; url: string; name: string }[]
  onUploadFile: (file: File) => Promise<string>
  cards?: PreviewCard[]
  back?: string
}

export default function LayoutEditorPanel({ layout, onSave, gameId, gameFonts, gameImages, onUploadFile, cards, back }: LayoutEditorPanelProps) {
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(layout.root?.id ?? null)
  const [selectedProperty, setSelectedProperty] = useState<string | null>(null)
  const [propertyByType, setPropertyByType] = useState<Record<string, string>>({})
  const propertyEditor = useCollapsible()

  // Reset selection when layout identity changes
  useEffect(() => {
    setSelectedNodeId(layout.root?.id ?? null)
    setSelectedProperty(null)
  }, [layout.id])

  const selectedKind = selectedNodeId && layout.root ? getNodeKind(layout.root, selectedNodeId) : null
  const isRoot = selectedNodeId === layout.root?.id

  const getNodeTypeKey = (id: string): string => {
    if (!layout.root) return 'unknown'
    const kind = getNodeKind(layout.root, id)
    if (kind === 'section') return 'section'
    const item = findItemById(layout.root, id)
    return (item as any)?.type ?? 'text'
  }

  const handleNodeSelect = (id: string) => {
    if (selectedNodeId && selectedProperty) {
      setPropertyByType(prev => ({ ...prev, [getNodeTypeKey(selectedNodeId)]: selectedProperty }))
    }
    setSelectedNodeId(id)
    const newTypeKey = getNodeTypeKey(id)
    const defaults: Record<string, string> = { section: 'layout', text: 'defaultValue', frame: 'fillColor', image: 'defaultValue', emoji: 'emoji' }
    setSelectedProperty(propertyByType[newTypeKey] ?? defaults[newTypeKey] ?? 'name')
  }

  const handleLayoutSave = (updated: any) => {
    onSave(updated)
  }

  const handlePropertyChange = (property: string, value: unknown) => {
    if (!selectedNodeId) return
    const t = JSON.parse(JSON.stringify(layout))
    if (!applyPropertyChange(t, selectedNodeId, property, value)) return
    handleLayoutSave(t)
  }

  const handleAddSection = () => {
    const t = JSON.parse(JSON.stringify(layout))
    const section = { id: crypto.randomUUID(), name: 'New Section', layout: 'stack' as const, sizePct: 100, gap: 0, children: [] as any[], items: [] as any[] }
    if (selectedKind === 'section' && selectedNodeId) {
      const parent = findParentSection(t.root, selectedNodeId, 'section')
      if (!parent) return
      const idx = parent.children.findIndex((c: any) => c.id === selectedNodeId)
      parent.children.splice(idx + 1, 0, section)
    } else if (selectedKind === 'item' && selectedNodeId) {
      const parent = findParentSection(t.root, selectedNodeId, 'item')
      if (!parent) return
      parent.children.push(section)
    } else {
      t.root.children.push(section)
    }
    handleLayoutSave(t)
    setSelectedNodeId(section.id)
  }

  const handleAddItem = (itemType: 'text' | 'frame' | 'image' | 'emoji' | 'copy') => {
    const t = JSON.parse(JSON.stringify(layout))
    let parentId: string
    if (selectedKind === 'section' && selectedNodeId) parentId = selectedNodeId
    else if (selectedKind === 'item' && selectedNodeId) {
      const p = findParentSection(t.root, selectedNodeId, 'item')
      parentId = p?.id ?? t.root.id
    } else parentId = t.root.id
    const parent = findSectionById(t.root, parentId)
    if (!parent) return
    const base = { id: crypto.randomUUID(), anchor: { x: 0.5, y: 0.5 }, attach: { targetType: 'section', targetId: parentId, anchor: { x: 0.5, y: 0.5 } }, widthMm: 63.5, heightMm: 88.9 }
    const items: Record<string, any> = {
      text: { ...base, type: 'text', name: 'New Text', fontSize: 20, align: 'left', anchor: { x: 0, y: 0 }, attach: { ...base.attach, anchor: { x: 0, y: 0 } } },
      frame: { ...base, type: 'frame', name: 'New Frame', strokeWidth: 2, cornerRadius: 8 },
      image: { ...base, type: 'image', name: 'New Image', fit: 'cover', cornerRadius: 0 },
      emoji: { ...base, type: 'emoji', name: 'Emoji', emoji: '⭐', fontSize: 32 },
      copy: { ...base, type: 'copy', name: 'Copy' },
    }
    const item = items[itemType]
    if (selectedKind === 'item' && selectedNodeId) {
      const loc = findNodeLocation(t.root, selectedNodeId, 'item')
      if (loc) loc.list.splice(loc.index + 1, 0, item)
      else parent.items.push(item)
    } else parent.items.push(item)
    handleLayoutSave(t)
    setSelectedNodeId(item.id)
  }

  const handleDuplicateNode = () => {
    if (!selectedNodeId || !selectedKind || isRoot) return
    const t = JSON.parse(JSON.stringify(layout))
    const loc = findNodeLocation(t.root, selectedNodeId, selectedKind)
    if (!loc) return
    const clone = deepCloneWithNewIds(loc.list[loc.index])
    clone.name = `${clone.name} copy`
    loc.list.splice(loc.index + 1, 0, clone)
    handleLayoutSave(t)
    setSelectedNodeId(clone.id)
  }

  const handleDeleteNode = () => {
    if (!selectedNodeId || !selectedKind || isRoot) return
    const t = JSON.parse(JSON.stringify(layout))
    const loc = findNodeLocation(t.root, selectedNodeId, selectedKind)
    if (!loc) return
    loc.list.splice(loc.index, 1)
    handleLayoutSave(t)
    setSelectedNodeId(null)
  }

  return (
    <>
      <div className="space-y-4">
        <div className="overflow-y-auto max-h-[60vh] rounded-lg border bg-card overflow-hidden">
          <NodeTree
            root={layout.root}
            selectedNodeId={selectedNodeId}
            onSelectNode={handleNodeSelect}
            onDrop={(dragId, dragKind, dropTargetId, position) => {
              const t = JSON.parse(JSON.stringify(layout))
              if (moveNode(t.root, dragId, dragKind, dropTargetId, position)) {
                handleLayoutSave(t)
              }
            }}
            onAddSection={handleAddSection}
            onAddItem={handleAddItem}
            onDuplicate={handleDuplicateNode}
            onDelete={handleDeleteNode}
            canDelete={!!selectedNodeId && !isRoot}
          />
        </div>
        {selectedNodeId && (
          <div className="rounded-lg border bg-card">
            <CollapsibleHeader collapsed={propertyEditor.collapsed} onToggle={propertyEditor.toggle}>
              <span className="text-sm font-semibold">Properties</span>
            </CollapsibleHeader>
            {!propertyEditor.collapsed && (
              <div className="p-4">
                <PropertyPanel
                  layout={layout}
                  gameFonts={gameFonts}
                  gameImages={gameImages}
                  onUploadFile={onUploadFile}
                  selectedNodeId={selectedNodeId}
                  selectedProperty={selectedProperty}
                  onSelectProperty={(prop) => {
                    setSelectedProperty(prop)
                    if (selectedNodeId) {
                      setPropertyByType(prev => ({ ...prev, [getNodeTypeKey(selectedNodeId)]: prop }))
                    }
                  }}
                  onPropertyChange={handlePropertyChange}
                />
              </div>
            )}
          </div>
        )}
      </div>
      <LayoutPreview
        layout={layout}
        gameId={gameId}
        cards={cards}
        back={back}
        gameFonts={gameFonts}
        selectedNodeId={selectedNodeId}
        onNodeClick={handleNodeSelect}
      />
    </>
  )
}
