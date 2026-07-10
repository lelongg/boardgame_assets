import assert from "node:assert/strict";
import { test } from "node:test";
import { renderCardSvg as renderApp } from "../src/render.js";
import { renderCardSvg as renderServer } from "../src/render/cardSvg.js";

// The project intentionally keeps TWO renderers (src/render.ts for the app,
// src/render/cardSvg.ts for the server/tests). These tests pin the behaviors
// that had drifted so the preview and the server output stay in sync.

const layoutWith = (items, bindingMeta) => ({
  id: "l1", name: "L", width: 63.5, height: 88.9, radius: 2, bleed: 1,
  ...(bindingMeta ? { bindingMeta } : {}),
  root: {
    id: "root", name: "Root", layout: "stack", sizePct: 100, gap: 0,
    children: [], items,
  },
});

const frame = (extra = {}) => ({
  id: "f1", name: "F", type: "frame",
  strokeWidth: 2, strokeColor: "#111111", fillColor: "none",
  anchor: { x: 0.5, y: 0.5 }, attach: { targetType: "section", targetId: "root", anchor: { x: 0.5, y: 0.5 } },
  widthMm: 40, heightMm: 20,
  ...extra,
});

const card = (fields = {}) => ({ id: "c1", name: "C", fields });

const rxOf = (svg) => svg.match(/<rect [^>]*rx="([^"]*)"[^>]*stroke=/)?.[1];

test("both renderers default frame cornerRadius to 0 and preserve explicit 0", () => {
  for (const render of [renderApp, renderServer]) {
    assert.equal(rxOf(render(card(), layoutWith([frame()]))), "0", "absent cornerRadius must render square");
    assert.equal(rxOf(render(card(), layoutWith([frame({ cornerRadius: 0 })]))), "0", "explicit 0 must stay 0");
    assert.equal(rxOf(render(card(), layoutWith([frame({ cornerRadius: 5 })]))), "5");
  }
});

test("both renderers preserve an explicit strokeWidth of 0", () => {
  for (const render of [renderApp, renderServer]) {
    const svg = render(card(), layoutWith([frame({ strokeWidth: 0 })]));
    assert.match(svg, /stroke-width="0"/, "stroke-less frames must not grow a stroke");
  }
});

test("both renderers resolve frame color bindings from card fields", () => {
  const boundFrame = frame({ bindings: { strokeColor: { field: "accent" } } });
  for (const render of [renderApp, renderServer]) {
    const svg = render(card({ accent: "#ff0000" }), layoutWith([boundFrame]));
    assert.match(svg, /stroke="#ff0000"/, "binding must override the static stroke color");
  }
});

test("both renderers escape malicious bound color values", () => {
  const boundFrame = frame({ bindings: { strokeColor: { field: "accent" } } });
  const evil = 'red"/><script>alert(1)</script><rect x="';
  for (const render of [renderApp, renderServer]) {
    const svg = render(card({ accent: evil }), layoutWith([boundFrame]));
    assert.ok(!svg.includes("<script>"), "bound values must not inject markup");
  }
});

test("server renderer escapes bound text colors in foreignObject styles", () => {
  const textItem = {
    id: "t1", name: "T", type: "text", defaultValue: "Hi",
    fontSize: 16, align: "center", verticalAlign: "middle", color: "#000",
    bindings: { color: { field: "tint" } },
    anchor: { x: 0.5, y: 0.5 }, attach: { targetType: "section", targetId: "root", anchor: { x: 0.5, y: 0.5 } },
    widthMm: 40, heightMm: 20,
  };
  const evil = 'black"><script>alert(1)</script><div style="';
  for (const render of [renderApp, renderServer]) {
    const svg = render(card({ tint: evil }), layoutWith([textItem]));
    assert.ok(!svg.includes("<script>"), "bound color must be escaped in style attribute");
  }
});

test("both renderers honor bound emoji fontSize", () => {
  const emoji = {
    id: "e1", name: "E", type: "emoji", emoji: "⭐", fontSize: 32,
    bindings: { fontSize: { field: "size" } },
    anchor: { x: 0.5, y: 0.5 }, attach: { targetType: "section", targetId: "root", anchor: { x: 0.5, y: 0.5 } },
    widthMm: 20, heightMm: 20,
  };
  for (const render of [renderApp, renderServer]) {
    const svg = render(card({ size: "64" }), layoutWith([emoji]));
    assert.match(svg, /font-size="64"/, "emoji fontSize binding must apply");
  }
});

test("both renderers use the same text fontSize fallback", () => {
  const textItem = {
    id: "t1", name: "T", type: "text", defaultValue: "Hi",
    align: "center", verticalAlign: "middle", color: "#000",
    anchor: { x: 0.5, y: 0.5 }, attach: { targetType: "section", targetId: "root", anchor: { x: 0.5, y: 0.5 } },
    widthMm: 40, heightMm: 20,
  };
  const a = renderApp(card(), layoutWith([textItem]));
  const b = renderServer(card(), layoutWith([textItem]));
  const sizeOf = (svg) => svg.match(/font-size:(\d+)px/)?.[1];
  assert.equal(sizeOf(a), sizeOf(b), "fallback font size must match between renderers");
  assert.equal(sizeOf(a), "16", "fallback must match the normalizer default");
});

test("both renderers apply offsets to clone items", () => {
  const PX_PER_MM = 300 / 25.4;
  const cloneItem = (extra = {}) => ({
    id: "cl1", name: "Clone", type: "clone", cloneTargetId: "f1", scale: 1,
    anchor: { x: 0.5, y: 0.5 }, attach: { targetType: "section", targetId: "root", anchor: { x: 0.5, y: 0.5 } },
    widthMm: 40, heightMm: 20,
    ...extra,
  });
  const translateOf = (svg) => {
    const m = svg.match(/<g transform="translate\((-?[\d.]+),(-?[\d.]+)\) scale\(/);
    return m ? { x: Number(m[1]), y: Number(m[2]) } : null;
  };
  for (const render of [renderApp, renderServer]) {
    const base = translateOf(render(card(), layoutWith([frame(), cloneItem()])));
    const shifted = translateOf(render(card(), layoutWith([frame(), cloneItem({ offsetX: 10, offsetY: 5 })])));
    assert.ok(base && shifted, "clone items must render a translated group");
    assert.equal(Math.round(shifted.x - base.x), Math.round(10 * PX_PER_MM), "offsetX must shift the clone");
    assert.equal(Math.round(shifted.y - base.y), Math.round(5 * PX_PER_MM), "offsetY must shift the clone");
  }
});
