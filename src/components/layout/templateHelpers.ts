import type { CardTemplateSection, CardTemplateItem } from "../../types"

export type FlatNode = {
  id: string
  name: string
  kind: "section" | "item"
  depth: number
  obj: CardTemplateSection | CardTemplateItem
}

export const flattenNodes = (section: CardTemplateSection, depth = 0): FlatNode[] => {
  const nodes: FlatNode[] = [{ id: section.id, name: section.name, kind: "section", depth, obj: section }]
  for (const item of section.items) {
    nodes.push({ id: item.id, name: item.name, kind: "item", depth: depth + 1, obj: item })
  }
  for (const child of section.children) {
    nodes.push(...flattenNodes(child, depth + 1))
  }
  return nodes
}

export const findSectionById = (section: CardTemplateSection, id: string): CardTemplateSection | null => {
  if (section.id === id) return section
  for (const child of section.children) {
    const found = findSectionById(child, id)
    if (found) return found
  }
  return null
}

export const findItemById = (section: CardTemplateSection, id: string): CardTemplateItem | null => {
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
  section: CardTemplateSection,
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
  section: CardTemplateSection,
  id: string,
  kind: "section" | "item"
): CardTemplateSection | null => {
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

export const getNodeKind = (root: CardTemplateSection, id: string): "section" | "item" | null => {
  if (findSectionById(root, id)) return "section"
  if (findItemById(root, id)) return "item"
  return null
}
