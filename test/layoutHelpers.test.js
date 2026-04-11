import assert from "node:assert/strict";
import { test } from "node:test";
import {
  flattenNodes,
  findSectionById,
  findItemById,
  findNodeLocation,
  findParentSection,
} from "../src/components/layout/layoutHelpers.ts";

const makeLayout = () => ({
  id: "root",
  name: "Root",
  layout: "column",
  sizePct: 100,
  gap: 0,
  children: [
    {
      id: "header",
      name: "Header",
      layout: "stack",
      sizePct: 20,
      gap: 0,
      children: [],
      items: [
        { id: "title", name: "Title", type: "text", fieldId: "name", anchor: { x: 0, y: 0 }, attach: { targetType: "section", targetId: "header", anchor: { x: 0, y: 0 } }, widthMm: 80, heightMm: 60, fontSize: 32, align: "left", font: "title" },
      ],
    },
    {
      id: "body",
      name: "Body",
      layout: "stack",
      sizePct: 80,
      gap: 0,
      children: [],
      items: [
        { id: "border", name: "Border", type: "frame", anchor: { x: 0.5, y: 0.5 }, attach: { targetType: "section", targetId: "body", anchor: { x: 0.5, y: 0.5 } }, widthMm: 90, heightMm: 90, strokeWidth: 3, cornerRadius: 12 },
        { id: "desc", name: "Description", type: "text", fieldId: "description", anchor: { x: 0.5, y: 0 }, attach: { targetType: "item", targetId: "border", anchor: { x: 0.5, y: 1 } }, widthMm: 80, heightMm: 30, fontSize: 18, align: "center", font: "body" },
      ],
    },
  ],
  items: [],
});

test("flattenNodes returns all nodes with depth", () => {
  const root = makeLayout();
  const nodes = flattenNodes(root);
  assert.equal(nodes.length, 6);
  assert.equal(nodes[0].id, "root");
  assert.equal(nodes[0].depth, 0);
  assert.equal(nodes[0].kind, "section");
  assert.equal(nodes[1].id, "header");
  assert.equal(nodes[1].depth, 1);
  assert.equal(nodes[2].id, "title");
  assert.equal(nodes[2].depth, 2);
  assert.equal(nodes[2].kind, "item");
  assert.equal(nodes[3].id, "body");
  assert.equal(nodes[4].id, "border");
  assert.equal(nodes[5].id, "desc");
});

test("findSectionById finds nested section", () => {
  const root = makeLayout();
  const section = findSectionById(root, "body");
  assert.equal(section?.id, "body");
});

test("findSectionById returns null for missing id", () => {
  const root = makeLayout();
  assert.equal(findSectionById(root, "nope"), null);
});

test("findItemById finds item in nested section", () => {
  const root = makeLayout();
  const item = findItemById(root, "desc");
  assert.equal(item?.id, "desc");
});

test("findNodeLocation finds section location", () => {
  const root = makeLayout();
  const loc = findNodeLocation(root, "header", "section");
  assert.ok(loc);
  assert.equal(loc.index, 0);
  assert.equal(loc.list.length, 2);
});

test("findNodeLocation finds item location", () => {
  const root = makeLayout();
  const loc = findNodeLocation(root, "desc", "item");
  assert.ok(loc);
  assert.equal(loc.index, 1);
  assert.equal(loc.list.length, 2);
});

test("findParentSection finds parent of item", () => {
  const root = makeLayout();
  const parent = findParentSection(root, "title", "item");
  assert.equal(parent?.id, "header");
});

test("findParentSection finds parent of section", () => {
  const root = makeLayout();
  const parent = findParentSection(root, "body", "section");
  assert.equal(parent?.id, "root");
});
