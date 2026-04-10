import assert from "node:assert/strict";
import { test } from "node:test";
import { normalizeCard, normalizeLayout } from "../src/normalize.ts";

test("normalizeCard handles empty name", () => {
  const card = normalizeCard({ id: "test", name: "", fields: {} });
  assert.equal(card.name, "New Card");
  assert.equal(card.id, "test");
});

test("normalizeCard handles missing name", () => {
  const card = normalizeCard({ id: "test", fields: {} });
  assert.equal(card.name, "New Card");
  assert.equal(card.id, "test");
});

test("normalizeCard handles empty id", () => {
  const card = normalizeCard({ id: "", name: "Test Card", fields: {} });
  assert.equal(card.id, "test-card");
  assert.equal(card.name, "Test Card");
});

test("normalizeCard handles missing id", () => {
  const card = normalizeCard({ name: "Test Card", fields: {} });
  assert.equal(card.id, "test-card");
  assert.equal(card.name, "Test Card");
});

test("normalizeCard handles empty field values", () => {
  const card = normalizeCard({
    id: "test",
    name: "Test",
    fields: { title: "", description: null, value: undefined }
  });
  assert.equal(card.fields.title, "");
  assert.equal(card.fields.description, "");
  assert.equal(card.fields.value, "");
});

test("normalizeCard handles null input", () => {
  const card = normalizeCard(null);
  assert.equal(card.name, "New Card");
  assert.ok(card.id);
  assert.deepEqual(card.fields, {});
});

test("normalizeLayout handles empty numeric fields", () => {
  const layout = normalizeLayout({
    version: 2,
    id: "test",
    name: "Test",
    width: "",
    height: "",
    radius: "",
    bleed: "",
    root: { id: "root", name: "Root", layout: "column", sizePct: 100, gap: 0, children: [], items: [] }
  });
  assert.equal(layout.width, 63.5);
  assert.equal(layout.height, 88.9);
  assert.equal(layout.radius, 2.5);
  assert.equal(layout.bleed, 1.5);
});

test("normalizeLayout handles missing fields", () => {
  const layout = normalizeLayout({});
  assert.equal(layout.version, 2);
  assert.equal(layout.id, "default");
  assert.equal(layout.name, "Default");
  assert.equal(layout.width, 63.5);
  assert.equal(layout.height, 88.9);
  assert.equal(layout.radius, 2.5);
  assert.equal(layout.bleed, 1.5);
  assert.ok(layout.root);
});

test("normalizeLayout handles section with empty layout", () => {
  const layout = normalizeLayout({
    version: 2,
    id: "test",
    name: "Test",
    width: 63.5,
    height: 88.9,
    radius: 2.5,
    bleed: 1.5,
    root: {
      id: "root",
      name: "Root",
      layout: "",
      sizePct: "",
      gap: "",
      children: [],
      items: []
    }
  });
  assert.equal(layout.root.layout, "stack");
  assert.equal(layout.root.sizePct, 100);
  assert.equal(layout.root.gap, 0);
});

test("normalizeLayout handles item with empty anchor points", () => {
  const layout = normalizeLayout({
    version: 2,
    id: "test",
    name: "Test",
    width: 63.5,
    height: 88.9,
    radius: 2.5,
    bleed: 1.5,
    root: {
      id: "root",
      name: "Root",
      layout: "column",
      sizePct: 100,
      gap: 0,
      children: [],
      items: [
        {
          id: "item1",
          name: "Item 1",
          fieldId: "title",
          anchor: { x: "", y: "" },
          attach: {
            targetType: "section",
            targetId: "root",
            anchor: { x: "", y: "" }
          },
          widthPct: "",
          heightPct: "",
          fontSize: "",
          align: "",
          font: ""
        }
      ]
    }
  });
  const item = layout.root.items[0];
  assert.equal(item.anchor.x, 0.5);
  assert.equal(item.anchor.y, 0.5);
  assert.equal(item.attach.anchor.x, 0.5);
  assert.equal(item.attach.anchor.y, 0.5);
});

test("normalizeLayout handles text item with empty values", () => {
  const layout = normalizeLayout({
    version: 2,
    id: "test",
    name: "Test",
    width: 63.5,
    height: 88.9,
    radius: 2.5,
    bleed: 1.5,
    root: {
      id: "root",
      name: "Root",
      layout: "column",
      sizePct: 100,
      gap: 0,
      children: [],
      items: [
        {
          type: "text",
          id: "text1",
          name: "Text 1",
          fieldId: "",
          anchor: { x: 0, y: 0 },
          attach: {
            targetType: "section",
            targetId: "root",
            anchor: { x: 0, y: 0 }
          },
          widthPct: "",
          heightPct: "",
          fontSize: "",
          align: "",
          font: ""
        }
      ]
    }
  });
  const item = layout.root.items[0];
  assert.equal(item.type, "text");
  assert.equal(item.bindings, undefined);
  assert.equal(item.widthPct, 50);
  assert.equal(item.heightPct, 50);
  assert.equal(item.fontSize, 16);
  assert.equal(item.align, "center");
  assert.equal(item.font, undefined);
});

test("normalizeLayout handles frame item with empty values", () => {
  const layout = normalizeLayout({
    version: 2,
    id: "test",
    name: "Test",
    width: 63.5,
    height: 88.9,
    radius: 2.5,
    bleed: 1.5,
    root: {
      id: "root",
      name: "Root",
      layout: "column",
      sizePct: 100,
      gap: 0,
      children: [],
      items: [
        {
          type: "frame",
          id: "frame1",
          name: "Frame 1",
          anchor: { x: 0.5, y: 0.5 },
          attach: {
            targetType: "section",
            targetId: "root",
            anchor: { x: 0.5, y: 0.5 }
          },
          widthPct: 80,
          heightPct: 80,
          strokeWidth: "",
          cornerRadius: ""
        }
      ]
    }
  });
  const item = layout.root.items[0];
  assert.equal(item.type, "frame");
  assert.equal(item.strokeWidth, 2);
  assert.equal(item.cornerRadius, 8);
});

test("normalizeLayout handles image item with empty values", () => {
  const layout = normalizeLayout({
    version: 2,
    id: "test",
    name: "Test",
    width: 63.5,
    height: 88.9,
    radius: 2.5,
    bleed: 1.5,
    root: {
      id: "root",
      name: "Root",
      layout: "column",
      sizePct: 100,
      gap: 0,
      children: [],
      items: [
        {
          type: "image",
          id: "img1",
          name: "Image 1",
          fieldId: "",
          anchor: { x: 0.5, y: 0.5 },
          attach: {
            targetType: "section",
            targetId: "root",
            anchor: { x: 0.5, y: 0.5 }
          },
          widthPct: 80,
          heightPct: 80,
          fit: "",
          cornerRadius: ""
        }
      ]
    }
  });
  const item = layout.root.items[0];
  assert.equal(item.type, "image");
  assert.equal(item.bindings, undefined);
  assert.equal(item.fit, "cover");
  assert.equal(item.cornerRadius, 0);
});

test("normalizeLayout handles legacy item without type", () => {
  const layout = normalizeLayout({
    version: 2,
    id: "test",
    name: "Test",
    width: 63.5,
    height: 88.9,
    radius: 2.5,
    bleed: 1.5,
    root: {
      id: "root",
      name: "Root",
      layout: "column",
      sizePct: 100,
      gap: 0,
      children: [],
      items: [
        {
          id: "legacy1",
          name: "Legacy 1",
          fieldId: "title",
          anchor: { x: 0, y: 0 },
          attach: {
            targetType: "section",
            targetId: "root",
            anchor: { x: 0, y: 0 }
          },
          widthPct: 50,
          heightPct: 50,
          fontSize: 20,
          align: "center"
        }
      ]
    }
  });
  const item = layout.root.items[0];
  // Should default to text item, fieldId migrated to bindings
  assert.equal(item.type, undefined);
  assert.equal(item.bindings?.defaultValue?.field, "title");
  assert.equal(item.fontSize, 20);
  assert.equal(item.align, "center");
});

test("normalizeLayout handles nested sections", () => {
  const layout = normalizeLayout({
    version: 2,
    id: "test",
    name: "Test",
    width: 63.5,
    height: 88.9,
    radius: 2.5,
    bleed: 1.5,
    root: {
      id: "root",
      name: "Root",
      layout: "column",
      sizePct: 100,
      gap: 0,
      children: [
        {
          id: "header",
          name: "",
          layout: "",
          sizePct: "",
          gap: "",
          children: [],
          items: []
        }
      ],
      items: []
    }
  });
  assert.equal(layout.root.children.length, 1);
  assert.equal(layout.root.children[0].id, "header");
  assert.equal(layout.root.children[0].name, "New Section");
  assert.equal(layout.root.children[0].layout, "stack");
  assert.equal(layout.root.children[0].sizePct, 100);
  assert.equal(layout.root.children[0].gap, 0);
});

test("normalizeLayout adds default fonts when missing", () => {
  const layout = normalizeLayout({
    version: 2,
    id: "test",
    name: "Test",
    width: 63.5,
    height: 88.9,
    radius: 2.5,
    bleed: 1.5,
    root: { id: "root", name: "Root", layout: "column", sizePct: 100, gap: 0, children: [], items: [] }
  });
  assert.ok(layout.fonts, "Should have fonts field");
  assert.ok(layout.fonts.title, "Should have title font slot");
  assert.ok(layout.fonts.body, "Should have body font slot");
  assert.equal(layout.fonts.title.name, "Fraunces");
  assert.equal(layout.fonts.body.name, "Space Grotesk");
  assert.equal(layout.fonts.title.source, "google");
  assert.equal(layout.fonts.body.source, "google");
  assert.equal(layout.fonts.title.file, "");
  assert.equal(layout.fonts.body.file, "");
});

test("normalizeLayout preserves existing fonts", () => {
  const layout = normalizeLayout({
    version: 2,
    id: "test",
    name: "Test",
    width: 63.5,
    height: 88.9,
    radius: 2.5,
    bleed: 1.5,
    fonts: {
      heading: { name: "Cinzel", file: "abc123.woff2", source: "google" },
      flavor: { name: "MyFont", file: "def456.otf", source: "upload" }
    },
    root: { id: "root", name: "Root", layout: "column", sizePct: 100, gap: 0, children: [], items: [] }
  });
  assert.deepEqual(Object.keys(layout.fonts), ["heading", "flavor"]);
  assert.equal(layout.fonts.heading.name, "Cinzel");
  assert.equal(layout.fonts.heading.file, "abc123.woff2");
  assert.equal(layout.fonts.flavor.source, "upload");
});

test("normalizeLayout text item font accepts arbitrary string", () => {
  const layout = normalizeLayout({
    version: 2,
    id: "test",
    name: "Test",
    width: 63.5,
    height: 88.9,
    radius: 2.5,
    bleed: 1.5,
    root: {
      id: "root",
      name: "Root",
      layout: "column",
      sizePct: 100,
      gap: 0,
      children: [],
      items: [
        {
          type: "text",
          id: "text1",
          name: "Text",
          fieldId: "name",
          anchor: { x: 0, y: 0 },
          attach: { targetType: "section", targetId: "root", anchor: { x: 0, y: 0 } },
          widthPct: 80,
          heightPct: 20,
          fontSize: 20,
          align: "left",
          font: "flavor"
        }
      ]
    }
  });
  const item = layout.root.items[0];
  assert.equal(item.font, "flavor");
});

test("normalizeLayout handles anchor point rounding", () => {
  const layout = normalizeLayout({
    version: 2,
    id: "test",
    name: "Test",
    width: 63.5,
    height: 88.9,
    radius: 2.5,
    bleed: 1.5,
    root: {
      id: "root",
      name: "Root",
      layout: "column",
      sizePct: 100,
      gap: 0,
      children: [],
      items: [
        {
          id: "item1",
          name: "Item 1",
          fieldId: "title",
          anchor: { x: 0.2, y: 0.8 },
          attach: {
            targetType: "section",
            targetId: "root",
            anchor: { x: 0.4, y: 0.6 }
          },
          widthPct: 50,
          heightPct: 50,
          fontSize: 20,
          align: "left"
        }
      ]
    }
  });
  const item = layout.root.items[0];
  // 0.2 should round to 0, 0.8 should round to 1
  assert.equal(item.anchor.x, 0);
  assert.equal(item.anchor.y, 1);
  // 0.4 and 0.6 should round to 0.5
  assert.equal(item.attach.anchor.x, 0.5);
  assert.equal(item.attach.anchor.y, 0.5);
});
