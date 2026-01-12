import assert from "node:assert/strict";
import { test } from "node:test";
import { renderCardSvg, renderTemplateSvg } from "../src/render/cardSvg.ts";

test("renderCardSvg generates valid SVG", () => {
  const card = {
    id: "test",
    name: "Test Card",
    fields: {},
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
      items: [],
    },
  };

  const svg = renderCardSvg(card, template);
  assert.ok(svg.includes("<svg"), "Should contain SVG opening tag");
  assert.ok(svg.includes("</svg>"), "Should contain SVG closing tag");
  assert.ok(svg.includes('width="750"'), "Should have correct width");
  assert.ok(svg.includes('height="1050"'), "Should have correct height");
});

test("renderCardSvg with nested sections", () => {
  const card = {
    id: "test",
    name: "Test Card",
    fields: {
      title: "Card Title",
      description: "Card Description",
    },
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
      layout: "column",
      sizePct: 100,
      gap: 0,
      children: [
        {
          id: "header",
          name: "Header",
          layout: "row",
          sizePct: 20,
          gap: 0,
          children: [],
          items: [
            {
              type: "text",
              id: "title",
              name: "Title",
              fieldId: "title",
              anchor: { x: 0.5, y: 0.5 },
              attach: {
                targetType: "section",
                targetId: "header",
                anchor: { x: 0.5, y: 0.5 },
              },
              widthPct: 80,
              heightPct: 80,
              fontSize: 32,
              align: "center",
              font: "title",
            },
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
            {
              type: "text",
              id: "description",
              name: "Description",
              fieldId: "description",
              anchor: { x: 0, y: 0 },
              attach: {
                targetType: "section",
                targetId: "body",
                anchor: { x: 0, y: 0 },
              },
              widthPct: 90,
              heightPct: 90,
              fontSize: 16,
              align: "left",
              font: "body",
            },
          ],
        },
      ],
      items: [],
    },
  };

  const svg = renderCardSvg(card, template);
  assert.ok(svg.includes("Card Title"), "Should contain title text");
  assert.ok(svg.includes("Card Description"), "Should contain description text");
  assert.ok(svg.includes('font-size="32"'), "Should have title font size");
  assert.ok(svg.includes('font-size="16"'), "Should have body font size");
});

test("renderCardSvg with multiple items in same section", () => {
  const card = {
    id: "test",
    name: "Test Card",
    fields: {
      field1: "Value 1",
      field2: "Value 2",
      field3: "Value 3",
    },
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
          id: "text1",
          name: "Text 1",
          fieldId: "field1",
          anchor: { x: 0, y: 0 },
          attach: {
            targetType: "section",
            targetId: "root",
            anchor: { x: 0, y: 0 },
          },
          widthPct: 80,
          heightPct: 20,
          fontSize: 20,
          align: "left",
          font: "body",
        },
        {
          type: "text",
          id: "text2",
          name: "Text 2",
          fieldId: "field2",
          anchor: { x: 0, y: 0 },
          attach: {
            targetType: "section",
            targetId: "root",
            anchor: { x: 0, y: 0.5 },
          },
          widthPct: 80,
          heightPct: 20,
          fontSize: 20,
          align: "left",
          font: "body",
        },
        {
          type: "text",
          id: "text3",
          name: "Text 3",
          fieldId: "field3",
          anchor: { x: 0, y: 0 },
          attach: {
            targetType: "section",
            targetId: "root",
            anchor: { x: 0, y: 1 },
          },
          widthPct: 80,
          heightPct: 20,
          fontSize: 20,
          align: "left",
          font: "body",
        },
      ],
    },
  };

  const svg = renderCardSvg(card, template);
  assert.ok(svg.includes("Value 1"), "Should contain first value");
  assert.ok(svg.includes("Value 2"), "Should contain second value");
  assert.ok(svg.includes("Value 3"), "Should contain third value");
});

test("renderCardSvg with frame item", () => {
  const card = {
    id: "test",
    name: "Test Card",
    fields: {},
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
          id: "frame",
          name: "Frame",
          anchor: { x: 0.5, y: 0.5 },
          attach: {
            targetType: "section",
            targetId: "root",
            anchor: { x: 0.5, y: 0.5 },
          },
          widthPct: 90,
          heightPct: 90,
          strokeWidth: 4,
          strokeColor: "#000000",
          fillColor: "none",
          cornerRadius: 10,
        },
      ],
    },
  };

  const svg = renderCardSvg(card, template);
  assert.ok(svg.includes("<rect"), "Should contain rect element");
  assert.ok(svg.includes('stroke-width="4"'), "Should have correct stroke width");
  assert.ok(svg.includes('stroke="#000000"'), "Should have correct stroke color");
  assert.ok(svg.includes('rx="10"'), "Should have correct corner radius");
});

test("renderCardSvg with image item", () => {
  const card = {
    id: "test",
    name: "Test Card",
    fields: {
      portrait: "https://example.com/image.jpg",
    },
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
          id: "image",
          name: "Image",
          fieldId: "portrait",
          anchor: { x: 0.5, y: 0.5 },
          attach: {
            targetType: "section",
            targetId: "root",
            anchor: { x: 0.5, y: 0.5 },
          },
          widthPct: 60,
          heightPct: 60,
          fit: "cover",
          cornerRadius: 15,
        },
      ],
    },
  };

  const svg = renderCardSvg(card, template);
  assert.ok(svg.includes("<image"), "Should contain image element");
  assert.ok(
    svg.includes("https://example.com/image.jpg"),
    "Should have correct image URL"
  );
  assert.ok(svg.includes("clipPath"), "Should have clipPath for rounded corners");
});

test("renderCardSvg with text alignment left", () => {
  const card = {
    id: "test",
    name: "Test Card",
    fields: { text: "Left aligned" },
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
          id: "text",
          name: "Text",
          fieldId: "text",
          anchor: { x: 0, y: 0 },
          attach: {
            targetType: "section",
            targetId: "root",
            anchor: { x: 0, y: 0 },
          },
          widthPct: 80,
          heightPct: 20,
          fontSize: 20,
          align: "left",
          font: "body",
        },
      ],
    },
  };

  const svg = renderCardSvg(card, template);
  assert.ok(svg.includes('text-anchor="start"'), "Should have start text anchor");
});

test("renderCardSvg with text alignment center", () => {
  const card = {
    id: "test",
    name: "Test Card",
    fields: { text: "Center aligned" },
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
          id: "text",
          name: "Text",
          fieldId: "text",
          anchor: { x: 0.5, y: 0.5 },
          attach: {
            targetType: "section",
            targetId: "root",
            anchor: { x: 0.5, y: 0.5 },
          },
          widthPct: 80,
          heightPct: 20,
          fontSize: 20,
          align: "center",
          font: "body",
        },
      ],
    },
  };

  const svg = renderCardSvg(card, template);
  assert.ok(svg.includes('text-anchor="middle"'), "Should have middle text anchor");
});

test("renderCardSvg with text alignment right", () => {
  const card = {
    id: "test",
    name: "Test Card",
    fields: { text: "Right aligned" },
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
          id: "text",
          name: "Text",
          fieldId: "text",
          anchor: { x: 1, y: 0 },
          attach: {
            targetType: "section",
            targetId: "root",
            anchor: { x: 1, y: 0 },
          },
          widthPct: 80,
          heightPct: 20,
          fontSize: 20,
          align: "right",
          font: "body",
        },
      ],
    },
  };

  const svg = renderCardSvg(card, template);
  assert.ok(svg.includes('text-anchor="end"'), "Should have end text anchor");
});

test("renderCardSvg with row layout", () => {
  const card = {
    id: "test",
    name: "Test Card",
    fields: { text1: "Left", text2: "Right" },
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
      layout: "row",
      sizePct: 100,
      gap: 10,
      children: [
        {
          id: "left",
          name: "Left",
          layout: "stack",
          sizePct: 50,
          gap: 0,
          children: [],
          items: [
            {
              type: "text",
              id: "text1",
              name: "Text 1",
              fieldId: "text1",
              anchor: { x: 0.5, y: 0.5 },
              attach: {
                targetType: "section",
                targetId: "left",
                anchor: { x: 0.5, y: 0.5 },
              },
              widthPct: 80,
              heightPct: 20,
              fontSize: 20,
              align: "center",
              font: "body",
            },
          ],
        },
        {
          id: "right",
          name: "Right",
          layout: "stack",
          sizePct: 50,
          gap: 0,
          children: [],
          items: [
            {
              type: "text",
              id: "text2",
              name: "Text 2",
              fieldId: "text2",
              anchor: { x: 0.5, y: 0.5 },
              attach: {
                targetType: "section",
                targetId: "right",
                anchor: { x: 0.5, y: 0.5 },
              },
              widthPct: 80,
              heightPct: 20,
              fontSize: 20,
              align: "center",
              font: "body",
            },
          ],
        },
      ],
      items: [],
    },
  };

  const svg = renderCardSvg(card, template);
  assert.ok(svg.includes("Left"), "Should contain left text");
  assert.ok(svg.includes("Right"), "Should contain right text");
});

test("renderCardSvg with column layout", () => {
  const card = {
    id: "test",
    name: "Test Card",
    fields: { text1: "Top", text2: "Bottom" },
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
      layout: "column",
      sizePct: 100,
      gap: 10,
      children: [
        {
          id: "top",
          name: "Top",
          layout: "stack",
          sizePct: 50,
          gap: 0,
          children: [],
          items: [
            {
              type: "text",
              id: "text1",
              name: "Text 1",
              fieldId: "text1",
              anchor: { x: 0.5, y: 0.5 },
              attach: {
                targetType: "section",
                targetId: "top",
                anchor: { x: 0.5, y: 0.5 },
              },
              widthPct: 80,
              heightPct: 20,
              fontSize: 20,
              align: "center",
              font: "body",
            },
          ],
        },
        {
          id: "bottom",
          name: "Bottom",
          layout: "stack",
          sizePct: 50,
          gap: 0,
          children: [],
          items: [
            {
              type: "text",
              id: "text2",
              name: "Text 2",
              fieldId: "text2",
              anchor: { x: 0.5, y: 0.5 },
              attach: {
                targetType: "section",
                targetId: "bottom",
                anchor: { x: 0.5, y: 0.5 },
              },
              widthPct: 80,
              heightPct: 20,
              fontSize: 20,
              align: "center",
              font: "body",
            },
          ],
        },
      ],
      items: [],
    },
  };

  const svg = renderCardSvg(card, template);
  assert.ok(svg.includes("Top"), "Should contain top text");
  assert.ok(svg.includes("Bottom"), "Should contain bottom text");
});

test("renderTemplateSvg generates valid SVG", () => {
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
      items: [],
    },
  };

  const svg = renderTemplateSvg(template);
  assert.ok(svg.includes("<svg"), "Should contain SVG opening tag");
  assert.ok(svg.includes("</svg>"), "Should contain SVG closing tag");
  assert.ok(svg.includes('width="750"'), "Should have correct width");
  assert.ok(svg.includes('height="1050"'), "Should have correct height");
});

test("renderCardSvg escapes special characters in text", () => {
  const card = {
    id: "test",
    name: "Test Card",
    fields: {
      text: 'Text with <special> "characters" & symbols',
    },
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
          id: "text",
          name: "Text",
          fieldId: "text",
          anchor: { x: 0, y: 0 },
          attach: {
            targetType: "section",
            targetId: "root",
            anchor: { x: 0, y: 0 },
          },
          widthPct: 80,
          heightPct: 20,
          fontSize: 20,
          align: "left",
          font: "body",
        },
      ],
    },
  };

  const svg = renderCardSvg(card, template);
  assert.ok(svg.includes("&lt;special&gt;"), "Should escape < and >");
  assert.ok(svg.includes("&quot;"), "Should escape quotes");
  assert.ok(svg.includes("&amp;"), "Should escape ampersands");
  assert.ok(!svg.includes("<special>"), "Should not contain unescaped tags");
});

test("renderCardSvg with empty fields", () => {
  const card = {
    id: "test",
    name: "Test Card",
    fields: {},
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
          id: "text",
          name: "Text",
          fieldId: "missing-field",
          anchor: { x: 0, y: 0 },
          attach: {
            targetType: "section",
            targetId: "root",
            anchor: { x: 0, y: 0 },
          },
          widthPct: 80,
          heightPct: 20,
          fontSize: 20,
          align: "left",
          font: "body",
        },
      ],
    },
  };

  const svg = renderCardSvg(card, template);
  assert.ok(svg.includes("<svg"), "Should generate SVG even with missing fields");
  assert.ok(svg.includes("</svg>"), "Should close SVG properly");
});
