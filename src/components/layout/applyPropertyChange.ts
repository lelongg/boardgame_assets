import { getNodeKind } from './layoutHelpers'
import type { CardLayout } from '../../types'

const TEMPLATE_KEYS = new Set(['width', 'height', 'radius', 'bleed'])

const findNode = (root: any, nodeId: string, kind: 'section' | 'item'): any => {
  if (kind === 'section') {
    const find = (s: any): any => { if (s.id === nodeId) return s; for (const c of s.children) { const f = find(c); if (f) return f } return null }
    return find(root)
  }
  const find = (s: any): any => { const i = s.items.find((i: any) => i.id === nodeId); if (i) return i; for (const c of s.children) { const f = find(c); if (f) return f } return null }
  return find(root)
}

const ensureMeta = (layout: CardLayout, key: string) => {
  if (!layout.bindingMeta) layout.bindingMeta = {}
  if (!layout.bindingMeta[key]) layout.bindingMeta[key] = {}
  return layout.bindingMeta[key]
}

const cleanMeta = (layout: CardLayout) => {
  if (!layout.bindingMeta) return
  for (const k of Object.keys(layout.bindingMeta)) {
    const m = layout.bindingMeta[k]
    if (!m.default && !m.values?.length) delete layout.bindingMeta[k]
  }
  if (Object.keys(layout.bindingMeta).length === 0) delete layout.bindingMeta
}

/**
 * Apply a property change to a layout, handling bindings, template keys, and attach properties.
 * Mutates the layout in place. Returns false if the node wasn't found.
 */
export const applyPropertyChange = (layout: CardLayout, nodeId: string, property: string, value: unknown): boolean => {
  // Update binding allowed values
  if (property.startsWith('__bindingValues__')) {
    const key = property.slice('__bindingValues__'.length)
    const meta = ensureMeta(layout, key)
    const values = value as string[] | null
    if (values?.length) meta.values = values
    else delete meta.values
    // Auto-set default to first value if no default yet
    if (values?.length && (!meta.default || !values.includes(meta.default))) {
      meta.default = values[0]
    }
    cleanMeta(layout)
    return true
  }

  // Update binding default value
  if (property.startsWith('__bindingDefault__')) {
    const key = property.slice('__bindingDefault__'.length)
    const meta = ensureMeta(layout, key)
    meta.default = value as string | undefined
    cleanMeta(layout)
    return true
  }

  const kind = getNodeKind(layout.root, nodeId)
  if (!kind) return false
  const node = findNode(layout.root, nodeId, kind)
  if (!node) return false

  if (property.startsWith('__binding__')) {
    const prop = property.slice('__binding__'.length)
    if (!node.bindings) node.bindings = {}
    if (value) node.bindings[prop] = value
    else delete node.bindings[prop]
    if (Object.keys(node.bindings).length === 0) delete node.bindings
  } else if (TEMPLATE_KEYS.has(property)) {
    (layout as any)[property] = value
  } else if (property === 'attachAnchor') {
    if (!node.attach) node.attach = { targetType: 'section', targetId: '', anchor: { x: 0, y: 0 } }
    node.attach.anchor = value
  } else if (property === 'attachTargetId') {
    if (!node.attach) node.attach = { targetType: 'section', targetId: '', anchor: { x: 0, y: 0 } }
    node.attach.targetId = value
    node.attach.targetType = getNodeKind(layout.root, value as string) ?? 'section'
  } else {
    node[property] = value
  }
  return true
}
