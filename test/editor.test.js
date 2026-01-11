import assert from "node:assert/strict";
import { test } from "node:test";

// Helper functions extracted from editor.js for testing
const findItemLocation = (section, id) => {
  const index = section.items.findIndex((item) => item.id === id);
  if (index >= 0) {
    return { list: section.items, index };
  }
  for (const child of section.children) {
    const found = findItemLocation(child, id);
    if (found) return found;
  }
  return null;
};

const findNodeLocation = (section, active) => {
  if (!active) return null;
  if (active.type === "section") {
    return findSectionLocation(section, active.id);
  }
  return findItemLocation(section, active.id);
};

const findSectionLocation = (section, id) => {
  const index = section.children.findIndex((child) => child.id === id);
  if (index >= 0) {
    return { list: section.children, index };
  }
  for (const child of section.children) {
    const found = findSectionLocation(child, id);
    if (found) return found;
  }
  return null;
};

const findSectionById = (section, id) => {
  if (!id) return null;
  if (section.id === id) return section;
  for (const child of section.children) {
    const found = findSectionById(child, id);
    if (found) return found;
  }
  return null;
};

// Test for adding item as sibling
test("createItem should add item as sibling when another item is selected", () => {
  // Setup: Create a template with a section containing two items
  const template = {
    root: {
      id: "root",
      name: "Root",
      layout: "stack",
      children: [],
      items: [
        {
          id: "item-1",
          name: "Item 1",
          fieldId: "field-1"
        },
        {
          id: "item-2",
          name: "Item 2",
          fieldId: "field-2"
        }
      ]
    }
  };

  // Simulate selecting item-1
  const activeNode = { type: "item", id: "item-1" };

  // Find the location of the selected item
  const location = findNodeLocation(template.root, activeNode);
  assert.ok(location, "Should find the item location");
  assert.equal(location.index, 0, "Item 1 should be at index 0");

  // Create a new item
  const newItem = {
    id: "item-new",
    name: "New Item",
    fieldId: "field-new"
  };

  // Add the new item as a sibling (after the selected item)
  location.list.splice(location.index + 1, 0, newItem);

  // Verify the new item was added as a sibling
  assert.equal(template.root.items.length, 3, "Should have 3 items");
  assert.equal(template.root.items[0].id, "item-1", "First item should be item-1");
  assert.equal(template.root.items[1].id, "item-new", "Second item should be the new item");
  assert.equal(template.root.items[2].id, "item-2", "Third item should be item-2");
});

test("createItem should add item to section when section is selected", () => {
  // Setup: Create a template with a section
  const template = {
    root: {
      id: "root",
      name: "Root",
      layout: "stack",
      children: [],
      items: []
    }
  };

  // Simulate selecting the root section
  const activeNode = { type: "section", id: "root" };

  // Find the section
  const section = findSectionById(template.root, activeNode.id);
  assert.ok(section, "Should find the section");

  // Create a new item
  const newItem = {
    id: "item-new",
    name: "New Item",
    fieldId: "field-new"
  };

  // Add the new item to the section
  section.items.push(newItem);

  // Verify the new item was added to the section
  assert.equal(template.root.items.length, 1, "Should have 1 item");
  assert.equal(template.root.items[0].id, "item-new", "First item should be the new item");
});

test("createItem should add item at end when item in nested section is selected", () => {
  // Setup: Create a template with nested sections
  const template = {
    root: {
      id: "root",
      name: "Root",
      layout: "stack",
      children: [
        {
          id: "section-1",
          name: "Section 1",
          layout: "row",
          children: [],
          items: [
            {
              id: "item-1",
              name: "Item 1",
              fieldId: "field-1"
            }
          ]
        }
      ],
      items: []
    }
  };

  // Simulate selecting item-1 in section-1
  const activeNode = { type: "item", id: "item-1" };

  // Find the location of the selected item
  const location = findNodeLocation(template.root, activeNode);
  assert.ok(location, "Should find the item location");
  assert.equal(location.index, 0, "Item 1 should be at index 0");

  // Create a new item
  const newItem = {
    id: "item-new",
    name: "New Item",
    fieldId: "field-new"
  };

  // Add the new item as a sibling (after the selected item)
  location.list.splice(location.index + 1, 0, newItem);

  // Verify the new item was added as a sibling in the nested section
  const section1 = template.root.children[0];
  assert.equal(section1.items.length, 2, "Section 1 should have 2 items");
  assert.equal(section1.items[0].id, "item-1", "First item should be item-1");
  assert.equal(section1.items[1].id, "item-new", "Second item should be the new item");
});
