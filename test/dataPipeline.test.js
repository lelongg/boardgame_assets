import assert from "node:assert/strict";
import { test } from "node:test";
import { normalizeLayout } from "../src/normalize.js";
import { cardsToCSV, csvToCards } from "../src/cardsCsv.js";
import { exportGameZip } from "../src/gameZip.js";

// ── Normalizer field preservation ──────────────────────────────────────────

test("normalize preserves static visible:false on items and sections", () => {
  const layout = normalizeLayout({
    id: "l1", name: "L", width: 63.5, height: 88.9,
    root: {
      id: "root", name: "Root", layout: "stack", sizePct: 100, gap: 0,
      children: [
        { id: "hidden-section", name: "S", layout: "stack", sizePct: 50, gap: 0, visible: false, children: [], items: [] },
      ],
      items: [
        { id: "hidden-item", name: "I", type: "text", visible: false,
          anchor: { x: 0.5, y: 0.5 }, attach: { targetType: "section", targetId: "root", anchor: { x: 0.5, y: 0.5 } },
          widthMm: 10, heightMm: 10 },
        { id: "visible-item", name: "V", type: "text",
          anchor: { x: 0.5, y: 0.5 }, attach: { targetType: "section", targetId: "root", anchor: { x: 0.5, y: 0.5 } },
          widthMm: 10, heightMm: 10 },
      ],
    },
  });
  assert.equal(layout.root.items[0].visible, false, "item visible:false must survive normalize");
  assert.equal(layout.root.items[1].visible, undefined, "absent visible must stay undefined");
  assert.equal(layout.root.children[0].visible, false, "section visible:false must survive normalize");
});

test("normalize gives distinct fallback ids to id-less nodes in one pass", () => {
  const layout = normalizeLayout({
    root: {
      layout: "stack", sizePct: 100, gap: 0,
      children: [
        { layout: "stack", sizePct: 50, gap: 0, children: [], items: [] },
        { layout: "stack", sizePct: 50, gap: 0, children: [], items: [] },
      ],
      items: [{ type: "text" }, { type: "text" }, { type: "text" }],
    },
  });
  const itemIds = layout.root.items.map(i => i.id);
  const sectionIds = layout.root.children.map(s => s.id);
  assert.equal(new Set(itemIds).size, itemIds.length, `item ids must be unique, got: ${itemIds}`);
  assert.equal(new Set(sectionIds).size, sectionIds.length, `section ids must be unique, got: ${sectionIds}`);
});

// ── CSV round trip ──────────────────────────────────────────────────────────

test("CSV round-trips values containing a bare carriage return", () => {
  const cards = [
    { id: "a", name: "A", fields: { note: "line1\rline2" } },
    { id: "b", name: "B", fields: { note: "plain" } },
  ];
  const parsed = csvToCards(cardsToCSV(cards));
  assert.equal(parsed.length, 2, "bare \\r must not split a row");
  assert.equal(parsed[0].fields.note, "line1\rline2");
  assert.equal(parsed[1].fields.note, "plain");
});

test("CSV round-trips commas, quotes and newlines", () => {
  const cards = [{ id: "a", name: 'He said "hi", twice', fields: { desc: "l1\nl2" } }];
  const parsed = csvToCards(cardsToCSV(cards));
  assert.equal(parsed[0].name, 'He said "hi", twice');
  assert.equal(parsed[0].fields.desc, "l1\nl2");
});

// ── Zip export image collection ─────────────────────────────────────────────

test("zip export collects all image refs: multi-image fields, bindingMeta, back", async () => {
  const gameId = "g1";
  const img = (f) => `/api/games/${gameId}/images/${f}`;
  const tpl = {
    id: "l1", name: "L", root: {
      id: "root", items: [{ id: "i1", type: "image", defaultValue: img("item-default.png") }],
      children: [],
    },
    bindingMeta: {
      "defaultValue:art": { default: img("meta-default.png"), values: [img("meta-value.png")] },
    },
  };
  const storage = {
    getGame: async () => ({ id: gameId, name: "G" }),
    listLayouts: async () => [tpl],
    listFonts: async () => ({}),
    listCollections: async () => [{ id: "c1", name: "C", layoutId: "l1", back: img("back.png") }],
    listCards: async () => [{
      id: "k1", name: "K", fields: {
        rich: `<img src="${img("rich-1.png")}"> and <img src="${img("rich-2.png")}">`,
        plain: `${img("plain.png")} trailing text`,
      },
    }],
  };

  const fetched = [];
  const origFetch = global.fetch;
  global.fetch = async (url) => {
    fetched.push(String(url));
    return { ok: true, arrayBuffer: async () => new Uint8Array([1]).buffer };
  };
  try {
    await exportGameZip(storage, gameId);
  } finally {
    global.fetch = origFetch;
  }

  const requestedImages = fetched
    .filter(u => u.includes("/images/"))
    .map(u => u.split("/images/")[1])
    .sort();
  assert.deepEqual(requestedImages, [
    "back.png", "item-default.png", "meta-default.png", "meta-value.png",
    "plain.png", "rich-1.png", "rich-2.png",
  ], "every referenced image (multi-match, bindingMeta default/values) must be exported with a clean filename");
});
