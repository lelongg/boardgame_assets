import type { CardLayoutSection, CardLayoutItem } from "../../types"

export type FlatNode = {
  id: string
  name: string
  kind: "section" | "item"
  depth: number
  obj: CardLayoutSection | CardLayoutItem
}

export const flattenNodes = (section: CardLayoutSection, depth = 0): FlatNode[] => {
  const nodes: FlatNode[] = [{ id: section.id, name: section.name, kind: "section", depth, obj: section }]
  for (const item of section.items) {
    nodes.push({ id: item.id, name: item.name, kind: "item", depth: depth + 1, obj: item })
  }
  for (const child of section.children) {
    nodes.push(...flattenNodes(child, depth + 1))
  }
  return nodes
}

export const findSectionById = (section: CardLayoutSection, id: string): CardLayoutSection | null => {
  if (section.id === id) return section
  for (const child of section.children) {
    const found = findSectionById(child, id)
    if (found) return found
  }
  return null
}

export const findItemById = (section: CardLayoutSection, id: string): CardLayoutItem | null => {
  const item = section.items.find((i) => i.id === id)
  if (item) return item
  for (const child of section.children) {
    const found = findItemById(child, id)
    if (found) return found
  }
  return null
}

export type NodeLocation = { list: any[]; index: number }

export const findNodeLocation = (
  section: CardLayoutSection,
  id: string,
  kind: "section" | "item"
): NodeLocation | null => {
  if (kind === "section") {
    const index = section.children.findIndex((c) => c.id === id)
    if (index >= 0) return { list: section.children, index }
    for (const child of section.children) {
      const found = findNodeLocation(child, id, "section")
      if (found) return found
    }
  } else {
    const index = section.items.findIndex((i) => i.id === id)
    if (index >= 0) return { list: section.items, index }
    for (const child of section.children) {
      const found = findNodeLocation(child, id, "item")
      if (found) return found
    }
  }
  return null
}

export const findParentSection = (
  section: CardLayoutSection,
  id: string,
  kind: "section" | "item"
): CardLayoutSection | null => {
  if (kind === "section") {
    if (section.children.some((c) => c.id === id)) return section
    for (const child of section.children) {
      const found = findParentSection(child, id, "section")
      if (found) return found
    }
  } else {
    if (section.items.some((i) => i.id === id)) return section
    for (const child of section.children) {
      const found = findParentSection(child, id, "item")
      if (found) return found
    }
  }
  return null
}

export const getNodeKind = (root: CardLayoutSection, id: string): "section" | "item" | null => {
  if (findSectionById(root, id)) return "section"
  if (findItemById(root, id)) return "item"
  return null
}

export const isDescendant = (parent: CardLayoutSection, childId: string): boolean => {
  if (parent.id === childId) return true
  for (const child of parent.children) {
    if (isDescendant(child, childId)) return true
  }
  return false
}

/**
 * Move a node to a new position. Returns true if successful.
 * - dropTargetId: the section or item being dropped onto
 * - position: "inside" to append to a section, "before"/"after" to insert relative to the target
 */
export const moveNode = (
  root: CardLayoutSection,
  dragId: string,
  dragKind: "section" | "item",
  dropTargetId: string,
  position: "before" | "after" | "inside"
): boolean => {
  // Can't move root
  if (dragId === root.id) return false

  const dropKind = getNodeKind(root, dropTargetId)
  if (!dropKind) return false

  // "inside" only works on sections
  if (position === "inside" && dropKind !== "section") return false

  // Prevent dropping a section into its own descendant
  if (dragKind === "section") {
    const dragSection = findSectionById(root, dragId)
    if (dragSection && isDescendant(dragSection, dropTargetId)) return false
  }

  // Remove the dragged node from its current location
  const loc = findNodeLocation(root, dragId, dragKind)
  if (!loc) return false
  const [node] = loc.list.splice(loc.index, 1)

  if (position === "inside") {
    // Append to the target section
    const target = findSectionById(root, dropTargetId)
    if (!target) return false
    if (dragKind === "section") target.children.push(node)
    else target.items.push(node)
    return true
  }

  // "before" or "after" — insert relative to the drop target
  // Items can only go into item lists, sections into children lists
  if (dropKind === "item" && dragKind === "item") {
    const dropLoc = findNodeLocation(root, dropTargetId, "item")
    if (!dropLoc) return false
    const insertAt = position === "before" ? dropLoc.index : dropLoc.index + 1
    dropLoc.list.splice(insertAt, 0, node)
    return true
  }

  if (dropKind === "section" && dragKind === "section") {
    const dropLoc = findNodeLocation(root, dropTargetId, "section")
    if (!dropLoc) return false
    const insertAt = position === "before" ? dropLoc.index : dropLoc.index + 1
    dropLoc.list.splice(insertAt, 0, node)
    return true
  }

  // Cross-kind: item dropped before/after a section → add to that section's parent's items
  // section dropped before/after an item → add to that item's parent's children
  // These are less intuitive so fall back to "inside" the parent
  const dropParent = findParentSection(root, dropTargetId, dropKind)
  if (!dropParent) return false
  if (dragKind === "section") dropParent.children.push(node)
  else dropParent.items.push(node)
  return true
}
