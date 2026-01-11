import assert from "node:assert/strict";
import { test } from "node:test";
import { normalizeCard, normalizeTemplate } from "../src/normalize.ts";

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

test("normalizeTemplate handles empty numeric fields", () => {
  const template = normalizeTemplate({
    version: 2,
    id: "test",
    name: "Test",
    width: "",
    height: "",
    radius: "",
    bleed: "",
    root: { id: "root", name: "Root", layout: "column", sizePct: 100, gap: 0, children: [], items: [] }
  });
  assert.equal(template.width, 750);
  assert.equal(template.height, 1050);
  assert.equal(template.radius, 28);
  assert.equal(template.bleed, 18);
});

test("normalizeTemplate handles missing fields", () => {
  const template = normalizeTemplate({});
  assert.equal(template.version, 2);
  assert.equal(template.id, "default");
  assert.equal(template.name, "Default");
  assert.equal(template.width, 750);
  assert.equal(template.height, 1050);
  assert.equal(template.radius, 28);
  assert.equal(template.bleed, 18);
  assert.ok(template.root);
});

test("normalizeTemplate handles section with empty layout", () => {
  const template = normalizeTemplate({
    version: 2,
    id: "test",
    name: "Test",
    width: 750,
    height: 1050,
    radius: 28,
    bleed: 18,
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
  assert.equal(template.root.layout, "stack");
  assert.equal(template.root.sizePct, 100);
  assert.equal(template.root.gap, 0);
});

test("normalizeTemplate handles item with empty anchor points", () => {
  const template = normalizeTemplate({
    version: 2,
    id: "test",
    name: "Test",
    width: 750,
    height: 1050,
    radius: 28,
    bleed: 18,
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
  const item = template.root.items[0];
  assert.equal(item.anchor.x, 0);
  assert.equal(item.anchor.y, 0);
  assert.equal(item.attach.anchor.x, 0);
  assert.equal(item.attach.anchor.y, 0);
});

test("normalizeTemplate handles text item with empty values", () => {
  const template = normalizeTemplate({
    version: 2,
    id: "test",
    name: "Test",
    width: 750,
    height: 1050,
    radius: 28,
    bleed: 18,
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
  const item = template.root.items[0];
  assert.equal(item.type, "text");
  assert.equal(item.fieldId, "name");
  assert.equal(item.widthPct, 50);
  assert.equal(item.heightPct, 50);
  assert.equal(item.fontSize, 16);
  assert.equal(item.align, "left");
  assert.equal(item.font, "body");
});

test("normalizeTemplate handles frame item with empty values", () => {
  const template = normalizeTemplate({
    version: 2,
    id: "test",
    name: "Test",
    width: 750,
    height: 1050,
    radius: 28,
    bleed: 18,
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
  const item = template.root.items[0];
  assert.equal(item.type, "frame");
  assert.equal(item.strokeWidth, 2);
  assert.equal(item.cornerRadius, 8);
});

test("normalizeTemplate handles image item with empty values", () => {
  const template = normalizeTemplate({
    version: 2,
    id: "test",
    name: "Test",
    width: 750,
    height: 1050,
    radius: 28,
    bleed: 18,
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
  const item = template.root.items[0];
  assert.equal(item.type, "image");
  assert.equal(item.fieldId, "image");
  assert.equal(item.fit, "cover");
  assert.equal(item.cornerRadius, 0);
});

test("normalizeTemplate handles legacy item without type", () => {
  const template = normalizeTemplate({
    version: 2,
    id: "test",
    name: "Test",
    width: 750,
    height: 1050,
    radius: 28,
    bleed: 18,
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
  const item = template.root.items[0];
  // Should default to text item
  assert.equal(item.type, undefined);
  assert.equal(item.fieldId, "title");
  assert.equal(item.fontSize, 20);
  assert.equal(item.align, "center");
});

test("normalizeTemplate handles nested sections", () => {
  const template = normalizeTemplate({
    version: 2,
    id: "test",
    name: "Test",
    width: 750,
    height: 1050,
    radius: 28,
    bleed: 18,
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
  assert.equal(template.root.children.length, 1);
  assert.equal(template.root.children[0].id, "header");
  assert.equal(template.root.children[0].name, "New Section");
  assert.equal(template.root.children[0].layout, "stack");
  assert.equal(template.root.children[0].sizePct, 100);
  assert.equal(template.root.children[0].gap, 0);
});

test("normalizeTemplate handles anchor point rounding", () => {
  const template = normalizeTemplate({
    version: 2,
    id: "test",
    name: "Test",
    width: 750,
    height: 1050,
    radius: 28,
    bleed: 18,
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
  const item = template.root.items[0];
  // 0.2 should round to 0, 0.8 should round to 1
  assert.equal(item.anchor.x, 0);
  assert.equal(item.anchor.y, 1);
  // 0.4 and 0.6 should round to 0.5
  assert.equal(item.attach.anchor.x, 0.5);
  assert.equal(item.attach.anchor.y, 0.5);
});
