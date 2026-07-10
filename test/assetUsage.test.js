import assert from "node:assert/strict";
import { test } from "node:test";
import {
  collectUsedImageFiles,
  collectUsedFontSlots,
  findUnusedFontSlots,
} from "../src/assetUsage.ts";

const img = (file) => `/api/games/g1/images/${file}`;

const layoutWith = (overrides = {}) => ({
  version: 2,
  id: "l1",
  name: "Layout",
  width: 63,
  height: 88,
  radius: 3,
  bleed: 0,
  root: { id: "root", name: "Root", layout: "column", sizePct: 100, gap: 0, children: [], items: [] },
  ...overrides,
});

// ── Images ──────────────────────────────────────────────────────────

test("image in layout item defaultValue is used", () => {
  const layout = layoutWith();
  layout.root.items.push({ id: "i1", type: "image", defaultValue: img("a.png") });
  const used = collectUsedImageFiles([layout], [], []);
  assert.deepEqual([...used], ["a.png"]);
});

test("image in nested section item is used", () => {
  const layout = layoutWith();
  layout.root.children.push({
    id: "s1", name: "Sub", layout: "row", sizePct: 50, gap: 0,
    children: [{
      id: "s2", name: "Deep", layout: "row", sizePct: 50, gap: 0, children: [],
      items: [{ id: "i2", type: "image", defaultValue: img("deep.png") }],
    }],
    items: [],
  });
  const used = collectUsedImageFiles([layout], [], []);
  assert.ok(used.has("deep.png"));
});

test("image in card field value is used, including multiple URLs in one value", () => {
  const card = { id: "c1", name: "Card", fields: { art: img("b.png"), text: `see ${img("c.png")} and ${img("d.png")}` } };
  const used = collectUsedImageFiles([], [], [card]);
  assert.deepEqual([...used].sort(), ["b.png", "c.png", "d.png"]);
});

test("image in bindingMeta default and values is used", () => {
  const layout = layoutWith({
    bindingMeta: {
      "defaultValue:art": { default: img("def.png"), values: [img("v1.png"), img("v2.png")] },
    },
  });
  const used = collectUsedImageFiles([layout], [], []);
  assert.deepEqual([...used].sort(), ["def.png", "v1.png", "v2.png"]);
});

test("image in collection back is used", () => {
  const used = collectUsedImageFiles([], [{ id: "col1", back: img("back.png") }], []);
  assert.ok(used.has("back.png"));
});

test("unreferenced images are not collected and URL matching is game-id-agnostic", () => {
  const card = { id: "c1", fields: { art: "/api/games/other-game/images/x.png" } };
  const used = collectUsedImageFiles([], [], [card]);
  assert.ok(used.has("x.png"));
  assert.equal(used.size, 1);
});

test("image URL stops at quote/whitespace/markup delimiters", () => {
  const card = { id: "c1", fields: { t: `<img src="${img("q.png")}"> trailing` } };
  const used = collectUsedImageFiles([], [], [card]);
  assert.deepEqual([...used], ["q.png"]);
});

// ── Fonts ───────────────────────────────────────────────────────────

const FONTS = {
  title: { name: "Title Font", file: "aaa.woff2", source: "upload" },
  body: { name: "Body Font", file: "bbb.woff2", source: "upload" },
  fancy: { name: "Fancy Font", file: "ccc.woff2", source: "google" },
};

test("first font slot is always used (renderer fallback)", () => {
  const used = collectUsedFontSlots(FONTS, [], []);
  assert.ok(used.has("title"));
  assert.equal(used.size, 1);
});

test("static item.font marks slot used", () => {
  const layout = layoutWith();
  layout.root.items.push({ id: "t1", type: "text", font: "fancy" });
  const used = collectUsedFontSlots(FONTS, [layout], []);
  assert.ok(used.has("fancy"));
  assert.ok(!used.has("body"));
});

test("font bindingMeta default and values mark slots used", () => {
  const layout = layoutWith({
    bindingMeta: { "font:style": { default: "body", values: ["fancy"] } },
  });
  const used = collectUsedFontSlots(FONTS, [layout], []);
  assert.ok(used.has("body"));
  assert.ok(used.has("fancy"));
});

test("card field values only count for fields bound to font", () => {
  const layout = layoutWith();
  layout.root.items.push({ id: "t1", type: "text", bindings: { font: { field: "style" } } });
  const cards = [
    { id: "c1", fields: { style: "fancy" } },
    // "body" appears in an unbound field: must NOT count as a font reference
    { id: "c2", fields: { flavor: "body" } },
  ];
  const used = collectUsedFontSlots(FONTS, [layout], cards);
  assert.ok(used.has("fancy"));
  assert.ok(!used.has("body"));
});

test("scoped card field key (font:field) counts as a font reference", () => {
  const layout = layoutWith();
  layout.root.items.push({ id: "t1", type: "text", bindings: { font: { field: "style" } } });
  const cards = [{ id: "c1", fields: { "font:style": "body" } }];
  const used = collectUsedFontSlots(FONTS, [layout], cards);
  assert.ok(used.has("body"));
});

test("empty font manifest yields no used slots", () => {
  assert.equal(collectUsedFontSlots({}, [], []).size, 0);
});

test("findUnusedFontSlots excludes used slots and slots sharing a file with a used slot", () => {
  const fonts = {
    a: { name: "A", file: "shared.woff2", source: "upload" },
    b: { name: "B", file: "shared.woff2", source: "upload" },
    c: { name: "C", file: "solo.woff2", source: "upload" },
  };
  // "a" is used; "b" shares its file, so deleting "b" would also delete "a"
  const unused = findUnusedFontSlots(fonts, new Set(["a"]));
  assert.deepEqual(unused, ["c"]);
});
