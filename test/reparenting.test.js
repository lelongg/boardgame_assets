import assert from "node:assert/strict";
import { test } from "node:test";

// Helper functions to simulate the reparenting logic
const findSectionById = (section, id) => {
  if (!id) return null;
  if (section.id === id) return section;
  for (const child of section.children) {
    const found = findSectionById(child, id);
    if (found) return found;
  }
  return null;
};

const findItemById = (section, id) => {
  const item = section.items.find((candidate) => candidate.id === id);
  if (item) return item;
  for (const child of section.children) {
    const found = findItemById(child, id);
    if (found) return found;
  }
  return null;
};

const findParentSection = (section, targetId, isSection) => {
  if (isSection) {
    const index = section.children.findIndex((child) => child.id === targetId);
    if (index >= 0) return section;
    for (const child of section.children) {
      const found = findParentSection(child, targetId, true);
      if (found) return found;
    }
  } else {
    const index = section.items.findIndex((item) => item.id === targetId);
    if (index >= 0) return section;
    for (const child of section.children) {
      const found = findParentSection(child, targetId, false);
      if (found) return found;
    }
  }
  return null;
};

const findNodeLocation = (section, nodeId, isSection) => {
  if (isSection) {
    const index = section.children.findIndex((child) => child.id === nodeId);
    if (index >= 0) return { list: section.children, index };
    for (const child of section.children) {
      const found = findNodeLocation(child, nodeId, true);
      if (found) return found;
    }
  } else {
    const index = section.items.findIndex((item) => item.id === nodeId);
    if (index >= 0) return { list: section.items, index };
    for (const child of section.children) {
      const found = findNodeLocation(child, nodeId, false);
      if (found) return found;
    }
  }
  return null;
};

const reparentNode = (root, nodeId, nodeType, newParentId) => {
  if (!newParentId) return false;
  
  const location = findNodeLocation(root, nodeId, nodeType === "section");
  if (!location) return false;
  
  const newParent = findSectionById(root, newParentId);
  if (!newParent) return false;
  
  if (nodeType === "section") {
    const node = findSectionById(root, nodeId);
    if (!node) return false;
    
    const isDescendant = (parent, childId) => {
      if (parent.id === childId) return true;
      for (const child of parent.children) {
        if (isDescendant(child, childId)) return true;
      }
      return false;
    };
    
    if (isDescendant(node, newParentId)) {
      return false;
    }
  }
  
  const [movedNode] = location.list.splice(location.index, 1);
  
  if (nodeType === "section") {
    newParent.children.push(movedNode);
  } else {
    newParent.items.push(movedNode);
  }
  
  return true;
};

test("can reparent a section to another section", () => {
  const template = {
    root: {
      id: "root",
      name: "Root",
      children: [
        { id: "header", name: "Header", children: [], items: [] },
        { id: "body", name: "Body", children: [], items: [] }
      ],
      items: []
    }
  };

  // Move header to be a child of body
  const success = reparentNode(template.root, "header", "section", "body");
  
  assert.ok(success, "reparenting should succeed");
  assert.equal(template.root.children.length, 1, "root should have 1 child");
  assert.equal(template.root.children[0].id, "body", "root's only child should be body");
  
  const body = findSectionById(template.root, "body");
  assert.equal(body.children.length, 1, "body should have 1 child");
  assert.equal(body.children[0].id, "header", "body's child should be header");
});

test("cannot reparent a section to itself", () => {
  const template = {
    root: {
      id: "root",
      name: "Root",
      children: [
        { id: "header", name: "Header", children: [], items: [] }
      ],
      items: []
    }
  };

  // Try to move header to be a child of itself
  const success = reparentNode(template.root, "header", "section", "header");
  
  assert.ok(!success, "reparenting to itself should fail");
  assert.equal(template.root.children.length, 1, "root should still have 1 child");
});

test("cannot reparent a section to its descendant", () => {
  const template = {
    root: {
      id: "root",
      name: "Root",
      children: [
        {
          id: "header",
          name: "Header",
          children: [
            { id: "title", name: "Title", children: [], items: [] }
          ],
          items: []
        }
      ],
      items: []
    }
  };

  // Try to move header to be a child of title (its own child)
  const success = reparentNode(template.root, "header", "section", "title");
  
  assert.ok(!success, "reparenting to descendant should fail");
  assert.equal(template.root.children.length, 1, "root should still have 1 child");
  assert.equal(template.root.children[0].id, "header", "root's child should still be header");
});

test("can reparent an item to another section", () => {
  const template = {
    root: {
      id: "root",
      name: "Root",
      children: [
        {
          id: "header",
          name: "Header",
          children: [],
          items: [
            { id: "item1", name: "Item 1" }
          ]
        },
        { id: "body", name: "Body", children: [], items: [] }
      ],
      items: []
    }
  };

  // Move item1 from header to body
  const success = reparentNode(template.root, "item1", "item", "body");
  
  assert.ok(success, "reparenting should succeed");
  
  const header = findSectionById(template.root, "header");
  assert.equal(header.items.length, 0, "header should have 0 items");
  
  const body = findSectionById(template.root, "body");
  assert.equal(body.items.length, 1, "body should have 1 item");
  assert.equal(body.items[0].id, "item1", "body's item should be item1");
});

test("findParentSection returns correct parent for section", () => {
  const template = {
    id: "root",
    name: "Root",
    children: [
      {
        id: "header",
        name: "Header",
        children: [
          { id: "title", name: "Title", children: [], items: [] }
        ],
        items: []
      }
    ],
    items: []
  };

  const parent = findParentSection(template, "title", true);
  assert.ok(parent, "parent should be found");
  assert.equal(parent.id, "header", "parent should be header");
});

test("findParentSection returns correct parent for item", () => {
  const template = {
    id: "root",
    name: "Root",
    children: [
      {
        id: "header",
        name: "Header",
        children: [],
        items: [
          { id: "item1", name: "Item 1" }
        ]
      }
    ],
    items: []
  };

  const parent = findParentSection(template, "item1", false);
  assert.ok(parent, "parent should be found");
  assert.equal(parent.id, "header", "parent should be header");
});
