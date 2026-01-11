import assert from "node:assert/strict";
import { test } from "node:test";
import { renderCardSvg } from "../src/render/cardSvg.ts";

test("text item renders correctly", () => {
  const card = {
    id: "test-card",
    name: "Test Card",
    fields: {
      description: "Test description"
    }
  };

  const template = {
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
      layout: "stack",
      sizePct: 100,
      gap: 0,
      children: [],
      items: [
        {
          type: "text",
          id: "text-item",
          name: "Text Item",
          fieldId: "description",
          anchor: { x: 0.5, y: 0.5 },
          attach: {
            targetType: "section",
            targetId: "root",
            anchor: { x: 0.5, y: 0.5 }
          },
          widthPct: 80,
          heightPct: 20,
          fontSize: 24,
          align: "center",
          font: "body"
        }
      ]
    }
  };

  const svg = renderCardSvg(card, template);
  assert.ok(svg.includes("<text"), "SVG should contain a text element");
  assert.ok(svg.includes("Test description"), "SVG should contain the field value");
  assert.ok(svg.includes('font-size="24"'), "SVG should have correct font size");
});

test("frame item renders correctly", () => {
  const card = {
    id: "test-card",
    name: "Test Card",
    fields: {}
  };

  const template = {
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
      layout: "stack",
      sizePct: 100,
      gap: 0,
      children: [],
      items: [
        {
          type: "frame",
          id: "frame-item",
          name: "Frame Item",
          anchor: { x: 0, y: 0 },
          attach: {
            targetType: "section",
            targetId: "root",
            anchor: { x: 0, y: 0 }
          },
          widthPct: 90,
          heightPct: 90,
          strokeWidth: 3,
          strokeColor: "#ff0000",
          fillColor: "none",
          cornerRadius: 12
        }
      ]
    }
  };

  const svg = renderCardSvg(card, template);
  assert.ok(svg.includes('<rect'), "SVG should contain a rect element");
  assert.ok(svg.includes('stroke="#ff0000"'), "SVG should have correct stroke color");
  assert.ok(svg.includes('stroke-width="3"'), "SVG should have correct stroke width");
  assert.ok(svg.includes('rx="12"'), "SVG should have correct corner radius");
});

test("image item renders correctly", () => {
  const card = {
    id: "test-card",
    name: "Test Card",
    fields: {
      portrait: "https://example.com/image.jpg"
    }
  };

  const template = {
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
      layout: "stack",
      sizePct: 100,
      gap: 0,
      children: [],
      items: [
        {
          type: "image",
          id: "image-item",
          name: "Image Item",
          fieldId: "portrait",
          anchor: { x: 0.5, y: 0 },
          attach: {
            targetType: "section",
            targetId: "root",
            anchor: { x: 0.5, y: 0 }
          },
          widthPct: 60,
          heightPct: 40,
          fit: "cover",
          cornerRadius: 8
        }
      ]
    }
  };

  const svg = renderCardSvg(card, template);
  assert.ok(svg.includes("<image"), "SVG should contain an image element");
  assert.ok(svg.includes("https://example.com/image.jpg"), "SVG should have correct image URL");
  assert.ok(svg.includes("clipPath"), "SVG should have clipPath for rounded corners");
  assert.ok(svg.includes('rx="8"'), "SVG should have correct corner radius in clipPath");
});

test("legacy item without type renders as text", () => {
  const card = {
    id: "test-card",
    name: "Test Card",
    fields: {
      title: "Legacy Title"
    }
  };

  const template = {
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
      layout: "stack",
      sizePct: 100,
      gap: 0,
      children: [],
      items: [
        {
          // No type field - should default to text
          id: "legacy-item",
          name: "Legacy Item",
          fieldId: "title",
          anchor: { x: 0, y: 0 },
          attach: {
            targetType: "section",
            targetId: "root",
            anchor: { x: 0, y: 0 }
          },
          widthPct: 80,
          heightPct: 20,
          fontSize: 32,
          align: "left",
          font: "title"
        }
      ]
    }
  };

  const svg = renderCardSvg(card, template);
  assert.ok(svg.includes("<text"), "SVG should contain a text element");
  assert.ok(svg.includes("Legacy Title"), "SVG should contain the field value");
  assert.ok(svg.includes('font-size="32"'), "SVG should have correct font size");
});

test("image item without URL does not render", () => {
  const card = {
    id: "test-card",
    name: "Test Card",
    fields: {}
  };

  const template = {
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
      layout: "stack",
      sizePct: 100,
      gap: 0,
      children: [],
      items: [
        {
          type: "image",
          id: "image-item",
          name: "Image Item",
          fieldId: "missing-field",
          anchor: { x: 0, y: 0 },
          attach: {
            targetType: "section",
            targetId: "root",
            anchor: { x: 0, y: 0 }
          },
          widthPct: 60,
          heightPct: 40,
          fit: "cover"
        }
      ]
    }
  };

  const svg = renderCardSvg(card, template);
  assert.ok(!svg.includes("<image"), "SVG should not contain an image element when field is missing");
});
