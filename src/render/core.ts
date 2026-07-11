import { theme } from "../theme.js";
import { BLEND_MODES } from "../types.js";
import type { AnchorPoint, CardData, CardLayout, CardLayoutItem, CardLayoutSection, CardLayoutTextItem } from "../types.js";

// Single card renderer implementation, shared by the app (src/render.ts) and
// the server/tests (src/render/cardSvg.ts). The two entry points only differ
// in how they receive fonts:
//  - the app passes font slots ({ name, file }) and embeds the binaries later
//    via embedFontsInSvg (browser fetch);
//  - the server passes the binaries directly (embedFonts), which are inlined
//    as @font-face rules in <defs>.

// 300 DPI: 1mm = 300/25.4 ≈ 11.811 pixels
export const PX_PER_MM = 300 / 25.4;
const mmToPx = (mm: number) => Math.round(mm * PX_PER_MM);

const layoutToPx = (layout: CardLayout): CardLayout => ({
  ...layout,
  width: mmToPx(layout.width),
  height: mmToPx(layout.height),
  radius: mmToPx(layout.radius),
  bleed: mmToPx(layout.bleed),
});

export type Rect = {
  x: number;
  y: number;
  width: number;
  height: number;
};

export type LayoutResult = {
  sections: Map<string, Rect>;
  items: Map<string, Rect>;
};

type ItemPlacement = {
  item: CardLayoutItem;
  sectionId: string;
};

export type FontSlot = { name: string; file?: string };
/** Font binary for inline @font-face embedding (Buffer-compatible, but typed
 *  structurally so the browser bundle doesn't depend on Node types). */
export type EmbeddedFont = { name: string; data: { toString(encoding: "base64"): string } };

export type RenderOptions = {
  debug?: boolean;
  back?: string;
  backFit?: "cover" | "contain" | "fill";
  /** Slot name → font family, used for font-family attributes. */
  fonts?: Record<string, FontSlot>;
  /** Slot name → font binary, inlined as a @font-face rule in <defs>. */
  embedFonts?: Record<string, EmbeddedFont>;
  /** Render text as <text>/<tspan> instead of foreignObject (for consumers without HTML support). */
  svgTextOnly?: boolean;
};

/** 0-preserving numeric coercion: "" / null / undefined / NaN → default, 0 stays 0. */
const num = (value: unknown, defaultValue: number): number => {
  if (value === null || value === undefined || value === "") return defaultValue;
  const n = Number(value);
  return Number.isFinite(n) ? n : defaultValue;
};

const escape = (value: unknown): string =>
  String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");

type StyledRun = { text: string; bold?: boolean; italic?: boolean };
type StyledLine = StyledRun[];

const parseRichText = (html: string): StyledLine[] => {
  // Only treat as HTML if it contains known rich text tags
  if (!/<(?:p|strong|em|\/p|\/strong|\/em)[ >]/.test(html)) {
    return html.split('\n').map(line => [{ text: line }]);
  }
  const lines: StyledLine[] = [];
  // Split by <p> blocks, fall back to single line
  const blocks = html.match(/<p>([\s\S]*?)<\/p>/g);
  const parts = blocks ? blocks.map(b => b.replace(/<\/?p>/g, '')) : [html];
  for (const part of parts) {
    const runs: StyledRun[] = [];
    // Parse inline tags: <strong>, <em>, <strong><em>, etc.
    const regex = /(<(?:strong|em|\/strong|\/em)>)|([^<]+)/g;
    let bold = false, italic = false, match;
    while ((match = regex.exec(part)) !== null) {
      if (match[1]) { const tag = match[1]; if (tag === '<strong>') bold = true; else if (tag === '</strong>') bold = false; else if (tag === '<em>') italic = true; else if (tag === '</em>') italic = false; }
      else if (match[2]) { runs.push({ text: match[2].replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"'), bold, italic }); }
    }
    lines.push(runs.length ? runs : [{ text: '' }]);
  }
  return lines.length ? lines : [[{ text: '' }]];
};

const renderStyledLine = (runs: StyledRun[]): string => {
  return runs.map(run => {
    const text = escape(run.text);
    if (!text && runs.length === 1) return '&#160;';
    let result = text;
    if (run.bold) result = `<tspan font-weight="bold">${result}</tspan>`;
    if (run.italic) result = `<tspan font-style="italic">${result}</tspan>`;
    return result;
  }).join('');
};

const renderStyledLineHtml = (runs: StyledRun[]): string => {
  return runs.map(run => {
    const text = escape(run.text);
    if (!text && runs.length === 1) return '&#160;';
    let result = text;
    if (run.bold) result = `<b>${result}</b>`;
    if (run.italic) result = `<i>${result}</i>`;
    return result;
  }).join('');
};

// Selection highlight styling
const SELECTION_COLOR = "#c65a32";
const SELECTION_STROKE_WIDTH = "2.5";
const SECTION_SELECTION_OPACITY = 0.08;
const ITEM_SELECTION_OPACITY = 0.15;

const anchorPoints: AnchorPoint[] = [
  { x: 0, y: 0 },
  { x: 0.5, y: 0 },
  { x: 1, y: 0 },
  { x: 0, y: 0.5 },
  { x: 0.5, y: 0.5 },
  { x: 1, y: 0.5 },
  { x: 0, y: 1 },
  { x: 0.5, y: 1 },
  { x: 1, y: 1 }
];

/** Resolve a property value: card data → binding default → item static value.
 *  Field key is scoped as "prop:field" to avoid collisions, with fallback to plain "field" for compat. */
const resolve = (item: CardLayoutItem, prop: string, card: CardData, layoutRef?: CardLayout): unknown => {
  const binding = (item as any).bindings?.[prop];
  if (binding) {
    if (binding.field === "name") return card.name || (item as any)[prop];
    const scoped = card.fields[`${prop}:${binding.field}`];
    if (scoped !== undefined && scoped !== "") return scoped;
    const plain = card.fields[binding.field];
    if (plain !== undefined && plain !== "") return plain;
    // Fall back to binding default from layout meta
    const meta = layoutRef?.bindingMeta?.[`${prop}:${binding.field}`];
    if (meta?.default !== undefined && meta.default !== "") return meta.default;
  }
  return (item as any)[prop];
};

const isTruthyFlag = (v: unknown): boolean => v === true || v === "true";

type ItemEffects = {
  rotation: number;
  flipH: boolean;
  flipV: boolean;
  /** Normalized to 0-1 (stored as percent on the item). */
  opacity: number;
  blendMode: string;
  maskUrl: string;
};

/** Gather the group-level effects of an item; `get` resolves a property
 *  (through bindings for card renders, statically for layout previews). */
const itemEffects = (get: (prop: string) => unknown, rotation: number): ItemEffects => {
  const rawOpacity = get("opacity");
  const opacity = rawOpacity === undefined || rawOpacity === null || rawOpacity === ""
    ? 1
    : Math.min(100, Math.max(0, num(rawOpacity, 100))) / 100;
  // Whitelist: blendMode can be bound to card data and ends up in a style attribute
  const rawBlend = String(get("blendMode") ?? "");
  const blendMode = rawBlend !== "normal" && (BLEND_MODES as readonly string[]).includes(rawBlend) ? rawBlend : "";
  return {
    rotation,
    flipH: isTruthyFlag(get("flipH")),
    flipV: isTruthyFlag(get("flipV")),
    opacity,
    blendMode,
    maskUrl: String(get("maskUrl") ?? ""),
  };
};

/** Wrap an item's SVG in a <g> carrying its effects. Mask definitions are
 *  appended to `defs` (hoisted into <defs> by the callers). The mask is
 *  declared in the item's untransformed rect space, so it follows the item
 *  through rotation/flip. */
const wrapItemEffects = (svg: string, itemId: string, rect: Rect, eff: ItemEffects, defs: string[]): string => {
  if (!svg) return svg;
  const cx = rect.x + rect.width / 2;
  const cy = rect.y + rect.height / 2;
  const transforms: string[] = [];
  if (eff.rotation) transforms.push(`rotate(${eff.rotation} ${cx} ${cy})`);
  if (eff.flipH || eff.flipV) transforms.push(`translate(${cx} ${cy}) scale(${eff.flipH ? -1 : 1} ${eff.flipV ? -1 : 1}) translate(${-cx} ${-cy})`);
  const attrs: string[] = [];
  if (transforms.length) attrs.push(`transform="${transforms.join(" ")}"`);
  if (eff.opacity < 1) attrs.push(`opacity="${eff.opacity}"`);
  if (eff.blendMode) attrs.push(`style="mix-blend-mode:${eff.blendMode}"`);
  if (eff.maskUrl) {
    const maskId = `mask-${String(itemId).replace(/[^a-zA-Z0-9-_]/g, "")}`;
    defs.push(`<mask id="${maskId}" style="mask-type:alpha" maskUnits="userSpaceOnUse" x="${rect.x}" y="${rect.y}" width="${rect.width}" height="${rect.height}"><image x="${rect.x}" y="${rect.y}" width="${rect.width}" height="${rect.height}" href="${escape(eff.maskUrl)}" preserveAspectRatio="none" /></mask>`);
    attrs.push(`mask="url(#${maskId})"`);
  }
  if (!attrs.length) return svg;
  return `<g ${attrs.join(" ")}>${svg}</g>`;
};

const textAnchorFor = (align: string): string => {
  if (align === "center") return "middle";
  if (align === "right") return "end";
  return "start";
};

const baselineFor = (vAlign?: string): string => {
  if (vAlign === "middle") return "middle";
  if (vAlign === "bottom") return "auto";
  return "hanging";
};

const anchorPosition = (rect: Rect, anchor: AnchorPoint): { x: number; y: number } => ({
  x: rect.x + rect.width * anchor.x,
  y: rect.y + rect.height * anchor.y
});

const layoutSections = (section: CardLayoutSection, rect: Rect, result: LayoutResult): void => {
  result.sections.set(section.id, rect);

  if (!section.children.length) return;

  if (section.layout === "stack") {
    section.children.forEach((child) => layoutSections(child, rect, result));
    return;
  }

  if (section.layout === "grid") {
    const cols = section.columns ?? 2;
    const rows = Math.ceil(section.children.length / cols);
    const gapX = section.gap;
    const gapY = section.gap;
    const cellW = (rect.width - (cols - 1) * gapX) / cols;
    const cellH = (rect.height - (rows - 1) * gapY) / rows;
    section.children.forEach((child, i) => {
      const col = i % cols;
      const row = Math.floor(i / cols);
      layoutSections(child, {
        x: rect.x + col * (cellW + gapX),
        y: rect.y + row * (cellH + gapY),
        width: cellW,
        height: cellH,
      }, result);
    });
    return;
  }

  const gapTotal = Math.max(section.children.length - 1, 0) * section.gap;
  const available = section.layout === "row" ? rect.width : rect.height;
  const totalPct = section.children.reduce((sum, child) => sum + (child.sizePct || 0), 0) || 100;
  let offset = 0;

  section.children.forEach((child, index) => {
    const size = ((child.sizePct || 0) / totalPct) * (available - gapTotal);
    const childRect: Rect =
      section.layout === "row"
        ? {
            x: rect.x + offset,
            y: rect.y,
            width: size,
            height: rect.height
          }
        : {
            x: rect.x,
            y: rect.y + offset,
            width: rect.width,
            height: size
          };

    offset += size + (index < section.children.length - 1 ? section.gap : 0);
    layoutSections(child, childRect, result);
  });
};

const collectItemPlacements = (section: CardLayoutSection, result: LayoutResult, list: ItemPlacement[]): void => {
  if (section.visible === false) return;
  section.items.forEach((item) => list.push({ item, sectionId: section.id }));
  const rCount = section.repeatCount ?? 1;
  if (rCount > 1) {
    for (let i = 1; i < rCount; i++) {
      section.items.forEach((item) => {
        list.push({ item: { ...item, id: `${item.id}__repeat_${i}` } as CardLayoutItem, sectionId: section.id });
      });
    }
  }
  section.children.forEach((child) => collectItemPlacements(child, result, list));
};

const placeItem = (item: CardLayoutItem, _sectionRect: Rect, targetRect: Rect): Rect => {
  const sizeWidth = mmToPx(item.widthMm);
  const sizeHeight = mmToPx(item.heightMm);
  const target = anchorPosition(targetRect, item.attach.anchor);
  const ox = mmToPx((item as any).offsetX ?? 0);
  const oy = mmToPx((item as any).offsetY ?? 0);

  return {
    x: target.x - sizeWidth * item.anchor.x + ox,
    y: target.y - sizeHeight * item.anchor.y + oy,
    width: sizeWidth,
    height: sizeHeight
  };
};

const layoutItems = (layout: CardLayout, result: LayoutResult): void => {
  const placements: ItemPlacement[] = [];
  collectItemPlacements(layout.root, result, placements);

  const placementMap = new Map<string, ItemPlacement>();
  placements.forEach((placement) => placementMap.set(placement.item.id, placement));

  const resolveItem = (itemId: string, chain: Set<string>): Rect | null => {
    const existing = result.items.get(itemId);
    if (existing) return existing;

    const placement = placementMap.get(itemId);
    if (!placement) return null;

    if (chain.has(itemId)) return null;
    chain.add(itemId);

    const sectionRect = result.sections.get(placement.sectionId);
    if (!sectionRect) {
      chain.delete(itemId);
      return null;
    }

    let targetRect: Rect | null = null;
    if (placement.item.attach.targetType === "item") {
      targetRect = resolveItem(placement.item.attach.targetId, chain);
      if (!targetRect) targetRect = sectionRect;
    } else {
      targetRect = result.sections.get(placement.item.attach.targetId) ?? sectionRect;
    }

    const rect = placeItem(placement.item, sectionRect, targetRect);
    result.items.set(itemId, rect);
    chain.delete(itemId);
    return rect;
  };

  placements.forEach((placement) => {
    resolveItem(placement.item.id, new Set());
  });
};

/** Compute section/item rects for a layout whose dimensions are already in pixels. */
export const computeLayoutPx = (layout: CardLayout): LayoutResult => {
  const result: LayoutResult = {
    sections: new Map(),
    items: new Map()
  };

  const rootRect: Rect = {
    x: layout.bleed,
    y: layout.bleed,
    width: layout.width - layout.bleed * 2,
    height: layout.height - layout.bleed * 2
  };

  layoutSections(layout.root, rootRect, result);
  layoutItems(layout, result);

  // Resize clone items to match their target's bounds * scale
  const resizeCloneItems = (section: CardLayoutSection) => {
    section.items.forEach((item) => {
      if (item.type !== "clone") return;
      const cloneRect = result.items.get(item.id);
      if (!cloneRect) return;
      const targetId = (item as any).cloneTargetId;
      if (!targetId) return;
      const targetItem = findItem(layout.root, targetId);
      const targetSection = targetItem ? null : findSection(layout.root, targetId);
      const targetRects = targetItem
        ? [result.items.get(targetId)].filter(Boolean) as Rect[]
        : targetSection
          ? getAllSectionItems(targetSection).map(t => result.items.get(t.id)).filter(Boolean) as Rect[]
          : [];
      if (!targetRects.length) return;
      const bounds = targetRects.reduce((b, r) => ({
        x: Math.min(b.x, r.x), y: Math.min(b.y, r.y),
        x2: Math.max(b.x2, r.x + r.width), y2: Math.max(b.y2, r.y + r.height),
      }), { x: Infinity, y: Infinity, x2: -Infinity, y2: -Infinity });
      const scale = (item as any).scale ?? 1;
      const w = (bounds.x2 - bounds.x) * scale;
      const h = (bounds.y2 - bounds.y) * scale;
      // Reposition based on anchor
      cloneRect.width = w;
      cloneRect.height = h;
      const attachTarget = item.attach.targetType === "item"
        ? result.items.get(item.attach.targetId)
        : result.sections.get(item.attach.targetId);
      if (attachTarget) {
        const target = anchorPosition(attachTarget, item.attach.anchor);
        const ox = mmToPx((item as any).offsetX ?? 0);
        const oy = mmToPx((item as any).offsetY ?? 0);
        cloneRect.x = target.x - w * item.anchor.x + ox;
        cloneRect.y = target.y - h * item.anchor.y + oy;
      }
    });
    section.children.forEach(resizeCloneItems);
  };
  resizeCloneItems(layout.root);

  return result;
};

/** Compute section/item rects for a layout expressed in millimeters. */
export const computeLayout = (layoutMm: CardLayout): LayoutResult =>
  computeLayoutPx(layoutToPx(layoutMm));

const resolveSection = (section: CardLayoutSection, prop: string, card?: CardData, layoutRef?: CardLayout): unknown => {
  const binding = section.bindings?.[prop];
  if (binding && card) {
    const scoped = card.fields[`${prop}:${binding.field}`];
    if (scoped !== undefined && scoped !== "") return scoped;
    const plain = card.fields[binding.field];
    if (plain !== undefined && plain !== "") return plain;
    const meta = layoutRef?.bindingMeta?.[`${prop}:${binding.field}`];
    if (meta?.default !== undefined && meta.default !== "") return meta.default;
  }
  return (section as any)[prop];
};

const computeRepeatPositions = (section: CardLayoutSection, result: LayoutResult, card?: CardData, layoutRef?: CardLayout): void => {
  const rCount = Number(resolveSection(section, 'repeatCount', card, layoutRef)) || 1;
  if (rCount > 1) {
    const rox = mmToPx(Number(resolveSection(section, 'repeatOffsetX', card, layoutRef)) || 0);
    const roy = mmToPx(Number(resolveSection(section, 'repeatOffsetY', card, layoutRef)) || 0);
    for (let i = 1; i < rCount; i++) {
      section.items.forEach((item) => {
        const original = result.items.get(item.id);
        if (original) {
          result.items.set(`${item.id}__repeat_${i}`, {
            x: original.x + rox * i,
            y: original.y + roy * i,
            width: original.width,
            height: original.height,
          });
        }
      });
    }
  }
  section.children.forEach((child) => computeRepeatPositions(child, result, card, layoutRef));
};

const collectItems = (section: CardLayoutSection, list: CardLayoutItem[], card?: CardData, layoutRef?: CardLayout): void => {
  list.push(...section.items);
  const rCount = Number(resolveSection(section, 'repeatCount', card, layoutRef)) || 1;
  if (rCount > 1) {
    for (let i = 1; i < rCount; i++) {
      section.items.forEach((item) => list.push({ ...item, id: `${item.id}__repeat_${i}` } as CardLayoutItem));
    }
  }
  section.children.forEach((child) => collectItems(child, list, card, layoutRef));
};

const findSection = (section: CardLayoutSection, id: string): CardLayoutSection | null => {
  if (section.id === id) return section;
  for (const child of section.children) {
    const found = findSection(child, id);
    if (found) return found;
  }
  return null;
};

const getAllSectionItems = (section: CardLayoutSection): CardLayoutItem[] => {
  const items: CardLayoutItem[] = [...section.items];
  section.children.forEach(c => items.push(...getAllSectionItems(c)));
  return items;
};

const findItem = (section: CardLayoutSection, id: string): CardLayoutItem | null => {
  const item = section.items.find((candidate) => candidate.id === id);
  if (item) return item;
  for (const child of section.children) {
    const found = findItem(child, id);
    if (found) return found;
  }
  return null;
};

const backgroundImage = (width: number, height: number, radius: number, clipId: string, options: RenderOptions): string =>
  options.back
    ? `<clipPath id="${clipId}"><rect x="0" y="0" width="${width}" height="${height}" rx="${radius}" /></clipPath><image x="0" y="0" width="${width}" height="${height}" href="${escape(options.back)}" preserveAspectRatio="${options.backFit === 'contain' ? 'xMidYMid meet' : options.backFit === 'fill' ? 'none' : 'xMidYMid slice'}" clip-path="url(#${clipId})" />`
    : '';

export const renderCardSvg = (card: CardData, layoutMm: CardLayout, options: RenderOptions = {}): string => {
  const layout = layoutToPx(layoutMm);
  const { palette } = theme;
  const { width, height, radius } = layout;
  const fontSlots = Object.keys(options.fonts ?? {});
  const computed = computeLayoutPx(layout);
  computeRepeatPositions(layout.root, computed, card, layoutMm);
  const items: CardLayoutItem[] = [];
  collectItems(layout.root, items, card, layoutMm);

  const fontFamilyFor = (fontKey: string): string => {
    const slotName = fontKey && options.fonts?.[fontKey] ? fontKey : fontSlots[0];
    const fontSlot = slotName ? options.fonts?.[slotName] : undefined;
    return fontSlot ? `'${fontSlot.name}'` : "'sans-serif'";
  };

  // Clip paths are hoisted into <defs> (avoids duplicates and keeps strict SVG consumers happy)
  const clipPaths: string[] = [];
  const itemElements: string[] = [];

  items.forEach((item) => {
    const vis = resolve(item, "visible", card, layoutMm);
    if (vis === false || vis === "false") return;
    const baseRect = computed.items.get(item.id);
    if (!baseRect) return;
    const rect = baseRect;
    const rotation = Number(resolve(item, "rotation", card, layoutMm)) || 0;
    const eff = itemEffects((p) => resolve(item, p, card, layoutMm), rotation);
    const pushEl = (svg: string) => {
      const wrapped = wrapItemEffects(svg, item.id, rect, eff, clipPaths);
      if (wrapped) itemElements.push(wrapped);
    };

    const itemType = item.type ?? "text"; // Default to text for legacy items

    if (itemType === "frame") {
      // num() keeps an explicit 0 (no stroke / square corners)
      const strokeWidth = num(resolve(item, "strokeWidth", card, layoutMm), 2);
      const strokeColor = escape(String(resolve(item, "strokeColor", card, layoutMm) ?? palette.ink));
      const fillColor = escape(String(resolve(item, "fillColor", card, layoutMm) ?? "none"));
      const cornerRadius = num(resolve(item, "cornerRadius", card, layoutMm), 0);
      pushEl(`<rect x="${rect.x}" y="${rect.y}" width="${rect.width}" height="${rect.height}" rx="${cornerRadius}" fill="${fillColor}" stroke="${strokeColor}" stroke-width="${strokeWidth}" />`);
      return;
    }

    if (itemType === "image") {
      const value = String(resolve(item, "defaultValue", card, layoutMm) ?? "");
      if (!value) return;
      const cornerRadius = num(resolve(item, "cornerRadius", card, layoutMm), 0);
      const fit = String(resolve(item, "fit", card, layoutMm) ?? "cover");
      const preserveAspectRatio = fit === "contain" ? "xMidYMid meet" : fit === "fill" ? "none" : "xMidYMid slice";
      let clipAttr = "";
      if (cornerRadius > 0) {
        const clipId = `clip-${String(item.id).replace(/[^a-zA-Z0-9-_]/g, '')}`;
        clipPaths.push(`<clipPath id="${clipId}"><rect x="${rect.x}" y="${rect.y}" width="${rect.width}" height="${rect.height}" rx="${cornerRadius}" /></clipPath>`);
        clipAttr = ` clip-path="url(#${clipId})"`;
      }
      pushEl(`<image x="${rect.x}" y="${rect.y}" width="${rect.width}" height="${rect.height}" href="${escape(value)}" preserveAspectRatio="${preserveAspectRatio}"${clipAttr} />`);
      return;
    }

    if (itemType === "emoji") {
      const emoji = String(resolve(item, "emoji", card, layoutMm) ?? "⭐");
      const fontSize = num(resolve(item, "fontSize", card, layoutMm), 32);
      const textX = rect.x + rect.width / 2;
      const textY = rect.y + rect.height / 2;
      pushEl(`<text x="${textX}" y="${textY}" text-anchor="middle" dominant-baseline="central" font-size="${fontSize}" fill="#000000">${escape(emoji)}</text>`);
      return;
    }

    if (itemType === "clone") {
      const targetId = (item as any).cloneTargetId;
      if (!targetId) return;
      // Find target items: either a single item or all items in a section
      const targetItem = findItem(layout.root, targetId);
      const targetSection = targetItem ? null : findSection(layout.root, targetId);
      const targets = targetItem ? [targetItem] : (targetSection ? getAllSectionItems(targetSection) : []);
      if (!targets.length) return;
      // Render each target's content at the clone's rect, scaled to fit
      const targetRects = targets.map(t => computed.items.get(t.id)).filter(Boolean) as Rect[];
      if (!targetRects.length) return;
      const bounds = targetRects.reduce((b, r) => ({
        x: Math.min(b.x, r.x), y: Math.min(b.y, r.y),
        x2: Math.max(b.x2, r.x + r.width), y2: Math.max(b.y2, r.y + r.height),
      }), { x: Infinity, y: Infinity, x2: -Infinity, y2: -Infinity });
      const scale = Number(resolve(item, "scale", card, layoutMm)) || 1;
      const srcW = bounds.x2 - bounds.x || 1;
      const srcH = bounds.y2 - bounds.y || 1;
      const tx = rect.x + (rect.width - srcW * scale) / 2 - bounds.x * scale;
      const ty = rect.y + (rect.height - srcH * scale) / 2 - bounds.y * scale;
      const parts = [`<g transform="translate(${tx},${ty}) scale(${scale},${scale})">`];
      // Re-render targets inside the group (they'll use their original rects, scaled by the group transform)
      targets.forEach(t => {
        const tRect = computed.items.get(t.id);
        if (!tRect) return;
        const tType = t.type ?? "text";
        if (tType === "text" || tType === "numbers") {
          const v = String(resolve(t, "defaultValue", card, layoutMm) ?? "");
          if (!v) return;
          const fs = Number(resolve(t, "fontSize", card, layoutMm)) || 16;
          const al = String(resolve(t, "align", card, layoutMm) ?? "center");
          const va = String(resolve(t, "verticalAlign", card, layoutMm) ?? "middle");
          const co = escape(String(resolve(t, "color", card, layoutMm) ?? palette.ink));
          const ff = fontFamilyFor(String(resolve(t, "font", card, layoutMm) ?? ""));
          const tx2 = al === "left" ? tRect.x : al === "right" ? tRect.x + tRect.width : tRect.x + tRect.width / 2;
          const ty2 = va === "top" ? tRect.y : va === "bottom" ? tRect.y + tRect.height : tRect.y + tRect.height / 2;
          const tabAttr = tType === "numbers" ? ` font-variant-numeric="tabular-nums" style="font-variant-numeric: tabular-nums"` : "";
          parts.push(`<text x="${tx2}" y="${ty2}" text-anchor="${textAnchorFor(al)}" dominant-baseline="${baselineFor(va)}" font-family="${ff}" font-size="${fs}" fill="${co}"${tabAttr}>${escape(v)}</text>`);
        } else if (tType === "emoji") {
          const em = String(resolve(t, "emoji", card, layoutMm) ?? "⭐");
          const fs = num(resolve(t, "fontSize", card, layoutMm), 32);
          parts.push(`<text x="${tRect.x + tRect.width / 2}" y="${tRect.y + tRect.height / 2}" text-anchor="middle" dominant-baseline="central" font-size="${fs}" fill="#000000">${escape(em)}</text>`);
        } else if (tType === "frame") {
          const sw = num(resolve(t, "strokeWidth", card, layoutMm), 2);
          const sc = escape(String(resolve(t, "strokeColor", card, layoutMm) ?? palette.ink));
          const fc = escape(String(resolve(t, "fillColor", card, layoutMm) ?? "none"));
          const cr = num(resolve(t, "cornerRadius", card, layoutMm), 0);
          parts.push(`<rect x="${tRect.x}" y="${tRect.y}" width="${tRect.width}" height="${tRect.height}" rx="${cr}" fill="${fc}" stroke="${sc}" stroke-width="${sw}" />`);
        }
      });
      parts.push(`</g>`);
      pushEl(parts.join(""));
      return;
    }

    // Render text/numbers item (default)
    const isNumbers = itemType === "numbers";
    const value = String(resolve(item, "defaultValue", card, layoutMm) ?? "");
    if (!value) return;
    const fontFamily = fontFamilyFor(String(resolve(item, "font", card, layoutMm) ?? ""));
    const fontSize = Number(resolve(item, "fontSize", card, layoutMm)) || 16;
    // Clamp to known values: align/vAlign can be bound to card fields and end up in a style attribute.
    const alignRaw = String(resolve(item, "align", card, layoutMm) ?? "center");
    const align = ["left", "center", "right"].includes(alignRaw) ? alignRaw : "center";
    const vAlignRaw = String(resolve(item, "verticalAlign", card, layoutMm) ?? "middle");
    const vAlign = ["top", "middle", "bottom"].includes(vAlignRaw) ? vAlignRaw : "middle";
    // Resolved values can come from card fields — escape before interpolating.
    const color = escape(String(resolve(item, "color", card, layoutMm) ?? palette.ink));
    const styledLines = parseRichText(value);
    if (options.svgTextOnly) {
      const tabularAttr = isNumbers ? ` font-variant-numeric="tabular-nums" style="font-variant-numeric: tabular-nums"` : "";
      const textX = align === "left" ? rect.x : align === "right" ? rect.x + rect.width : rect.x + rect.width / 2;
      const textY = vAlign === "top" ? rect.y : vAlign === "bottom" ? rect.y + rect.height : rect.y + rect.height / 2;
      const baseAttrs = `text-anchor="${textAnchorFor(align)}" dominant-baseline="${baselineFor(vAlign)}" font-family="${fontFamily}" font-size="${fontSize}" fill="${color}"${tabularAttr}`;
      if (styledLines.length === 1) {
        pushEl(`<text x="${textX}" y="${textY}" ${baseAttrs}>${renderStyledLine(styledLines[0])}</text>`);
        return;
      }
      const tspans = styledLines.map((line, i) =>
        `<tspan x="${textX}" ${i === 0 ? `y="${textY}"` : `dy="${fontSize * 1.2}"`}>${renderStyledLine(line)}</tspan>`
      ).join('');
      pushEl(`<text ${baseAttrs}>${tspans}</text>`);
      return;
    }
    const justifyContent = vAlign === "top" ? "flex-start" : vAlign === "bottom" ? "flex-end" : "center";
    const alignItems = align === "left" ? "flex-start" : align === "right" ? "flex-end" : "center";
    const html = styledLines.map(line => `<div>${renderStyledLineHtml(line)}</div>`).join('');
    const tabularStyle = isNumbers ? "font-variant-numeric:tabular-nums;" : "";
    pushEl(`<foreignObject x="${rect.x}" y="${rect.y}" width="${rect.width}" height="${rect.height}"><div xmlns="http://www.w3.org/1999/xhtml" style="width:100%;height:100%;display:flex;flex-direction:column;align-items:${alignItems};justify-content:${justifyContent};font-family:${fontFamily};font-size:${fontSize}px;color:${color};text-align:${align};${tabularStyle}overflow:hidden;word-wrap:break-word;overflow-wrap:break-word">${html}</div></foreignObject>`);
  });

  const renderedItems = itemElements.join("");

  // Inline @font-face rules for the slots actually used by text items (server-side rendering)
  let fontStyles = "";
  if (options.embedFonts) {
    const usedSlots = new Set<string>();
    items.forEach((item) => {
      const ttype = item.type ?? "text";
      if (ttype === "text" || ttype === "numbers") {
        const textItem = item as CardLayoutTextItem;
        const slotName = textItem.font && options.fonts?.[textItem.font] ? textItem.font : fontSlots[0];
        if (slotName) usedSlots.add(slotName);
      }
    });
    const rules = Array.from(usedSlots)
      .filter((slot) => options.embedFonts![slot])
      .map((slot) => {
        const fd = options.embedFonts![slot];
        const b64 = fd.data.toString("base64");
        return `@font-face { font-family: '${fd.name}'; src: url('data:font/woff2;base64,${b64}') format('woff2'); }`;
      })
      .join("\n      ");
    if (rules) fontStyles = `<style>${rules}</style>`;
  }

  const defs = (clipPaths.length > 0 || fontStyles) ? `<defs>${fontStyles}${clipPaths.join("")}</defs>` : "";

  const debugRects = options.debug
    ? items
        .map((item) => {
          const rect = computed.items.get(item.id);
          if (!rect) return "";
          const anchors = anchorPoints
            .map((anchor) => {
              const point = anchorPosition(rect, anchor);
              return `<circle cx="${point.x}" cy="${point.y}" r="3" fill="${palette.muted}" />`;
            })
            .join("");
          return `
  <rect x="${rect.x}" y="${rect.y}" width="${rect.width}" height="${rect.height}" rx="10" fill="none" stroke="${palette.muted}" stroke-width="1" />
  ${anchors}`;
        })
        .join("")
    : "";

  const debugAnchors = options.debug
    ? items
        .map((item) => {
          const rect = computed.items.get(item.id);
          if (!rect) return "";
          const targetRect =
            item.attach.targetType === "item"
              ? computed.items.get(item.attach.targetId)
              : computed.sections.get(item.attach.targetId);
          const targetPoint = targetRect
            ? anchorPosition(targetRect, item.attach.anchor)
            : { x: 16, y: 16 };
          const itemPoint = anchorPosition(rect, item.anchor);
          const missingLabel = targetRect
            ? ""
            : `<text x="${targetPoint.x + 8}" y="${targetPoint.y + 4}" font-size="12" fill="#d64545" font-family="'Space Grotesk', sans-serif">missing ${escape(item.attach.targetType)}:${escape(item.attach.targetId)}</text>`;
          return `
  <circle cx="${targetPoint.x}" cy="${targetPoint.y}" r="8" fill="none" stroke="#d64545" stroke-width="3" />
  <circle cx="${itemPoint.x}" cy="${itemPoint.y}" r="6" fill="#2f6f4e" stroke="#ffffff" stroke-width="1" />
  ${missingLabel}`;
        })
        .join("")
    : "";

  const debugLabel = options.debug
    ? `<text x="24" y="36" font-size="20" fill="#d64545" font-family="'Space Grotesk', sans-serif">DEBUG RENDER</text>`
    : "";

  return `<?xml version="1.0" encoding="UTF-8"?>
<svg width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" fill="none" xmlns="http://www.w3.org/2000/svg">
  ${defs}
  <rect x="0" y="0" width="${width}" height="${height}" rx="${radius}" fill="${palette.paper}" />
  ${backgroundImage(width, height, radius, "card-bg-clip", options)}
  ${debugLabel}
  ${debugRects}
  ${debugAnchors}
  ${renderedItems}
</svg>`;
};

export type LayoutSvgOptions = {
  showSections?: boolean;
  showItems?: boolean;
  selectedNodeId?: string | null;
  card?: CardData;
  back?: string;
  backFit?: "cover" | "contain" | "fill";
  fonts?: Record<string, FontSlot>;
};

export const renderLayoutSvg = (layoutMm: CardLayout, options: LayoutSvgOptions = {}): string => {
  const layout = layoutToPx(layoutMm);
  const { showSections = true, showItems = true, selectedNodeId = null, card: providedCard } = options;
  const { palette } = theme;
  const { width, height, radius } = layout;
  const fontSlots = Object.keys(options.fonts ?? {});
  const computed = computeLayoutPx(layout);

  const emptyCard: CardData = providedCard ?? { id: '', name: 'Card Name', fields: {} };
  computeRepeatPositions(layout.root, computed, emptyCard, layoutMm);
  const items: CardLayoutItem[] = [];
  collectItems(layout.root, items, emptyCard, layoutMm);

  const renderedContent = items.map((item) => {
    const vis = (item as any).visible;
    if (vis === false || vis === "false") return "";
    const baseRect = computed.items.get(item.id);
    if (!baseRect) return "";
    const rect = baseRect;
    const rot = Number((item as any).rotation ?? 0) || 0;
    const eff = itemEffects((p) => resolve(item, p, emptyCard, layoutMm), rot);
    const wrapRot = (svg: string) => {
      // Mask defs are emitted inline and hoisted into <defs> with the clip paths below
      const effDefs: string[] = [];
      const wrapped = wrapItemEffects(svg, item.id, rect, eff, effDefs);
      return wrapped ? effDefs.join("") + wrapped : "";
    };
    const itemType = item.type ?? "text";
    if (itemType === "frame") {
      if (item.type !== "frame") return "";
      const sw = item.strokeWidth ?? 2;
      const sc = escape(item.strokeColor ?? palette.ink);
      const fc = escape(item.fillColor ?? "none");
      const cr = item.cornerRadius ?? 0;
      return wrapRot(`<rect x="${rect.x}" y="${rect.y}" width="${rect.width}" height="${rect.height}" rx="${cr}" fill="${fc}" stroke="${sc}" stroke-width="${sw}" />`);
    }
    if (itemType === "image") {
      if (item.type !== "image") return "";
      const value = String(resolve(item, "defaultValue", emptyCard, layoutMm) ?? "");
      if (!value) return "";
      const cr = item.cornerRadius ?? 0;
      const fit = item.fit ?? "cover";
      const clipId = `clip-${String(item.id).replace(/[^a-zA-Z0-9-_]/g, '')}`;
      const clipPath = cr > 0 ? `<clipPath id="${clipId}"><rect x="${rect.x}" y="${rect.y}" width="${rect.width}" height="${rect.height}" rx="${cr}" /></clipPath>` : "";
      const par = fit === "contain" ? "xMidYMid meet" : fit === "fill" ? "none" : "xMidYMid slice";
      const ca = cr > 0 ? ` clip-path="url(#${clipId})"` : "";
      return wrapRot(`${clipPath}<image x="${rect.x}" y="${rect.y}" width="${rect.width}" height="${rect.height}" href="${escape(value)}" preserveAspectRatio="${par}"${ca} />`);
    }
    if (itemType === "emoji") {
      if (item.type !== "emoji") return "";
      const emoji = String(resolve(item, "emoji", emptyCard, layoutMm) ?? "⭐");
      const fontSize = item.fontSize ?? 32;
      const textX = rect.x + rect.width / 2;
      const textY = rect.y + rect.height / 2;
      return wrapRot(`<text x="${textX}" y="${textY}" text-anchor="middle" dominant-baseline="central" font-size="${fontSize}" fill="#000000">${escape(emoji)}</text>`);
    }
    if (itemType === "clone") {
      const targetId = (item as any).cloneTargetId;
      if (!targetId) return "";
      const targetItem = findItem(layout.root, targetId);
      const targetSection = targetItem ? null : findSection(layout.root, targetId);
      const targets = targetItem ? [targetItem] : (targetSection ? getAllSectionItems(targetSection) : []);
      if (!targets.length) return "";
      const targetRects = targets.map(t => computed.items.get(t.id)).filter(Boolean) as Rect[];
      if (!targetRects.length) return "";
      const bounds = targetRects.reduce((b, r) => ({
        x: Math.min(b.x, r.x), y: Math.min(b.y, r.y),
        x2: Math.max(b.x2, r.x + r.width), y2: Math.max(b.y2, r.y + r.height),
      }), { x: Infinity, y: Infinity, x2: -Infinity, y2: -Infinity });
      const scale = (item as any).scale ?? 1;
      const srcW = bounds.x2 - bounds.x || 1;
      const srcH = bounds.y2 - bounds.y || 1;
      const tx = rect.x + (rect.width - srcW * scale) / 2 - bounds.x * scale;
      const ty = rect.y + (rect.height - srcH * scale) / 2 - bounds.y * scale;
      const parts = [`<g transform="translate(${tx},${ty}) scale(${scale},${scale})">`];
      targets.forEach(t => {
        const tRect = computed.items.get(t.id);
        if (!tRect) return;
        const tType = t.type ?? "text";
        if (tType === "text" || tType === "numbers") {
          const v = String(resolve(t, "defaultValue", emptyCard, layoutMm) ?? "");
          if (!v) return;
          const fs = Number(resolve(t, "fontSize", emptyCard, layoutMm)) || 16;
          const al = String(resolve(t, "align", emptyCard, layoutMm) ?? "center");
          const va = String(resolve(t, "verticalAlign", emptyCard, layoutMm) ?? "middle");
          const co = escape(String(resolve(t, "color", emptyCard, layoutMm) ?? palette.ink));
          const fk = String(resolve(t, "font", emptyCard, layoutMm) ?? "");
          const sn = fk && options.fonts?.[fk] ? fk : fontSlots[0];
          const ff = options.fonts?.[sn] ? `'${options.fonts[sn].name}'` : "'sans-serif'";
          const jc = va === "top" ? "flex-start" : va === "bottom" ? "flex-end" : "center";
          const ai = al === "left" ? "flex-start" : al === "right" ? "flex-end" : "center";
          const sl = parseRichText(v);
          const h = sl.map(line => `<div>${renderStyledLineHtml(line)}</div>`).join('');
          const tabStyle = tType === "numbers" ? "font-variant-numeric:tabular-nums;" : "";
          parts.push(`<foreignObject x="${tRect.x}" y="${tRect.y}" width="${tRect.width}" height="${tRect.height}"><div xmlns="http://www.w3.org/1999/xhtml" style="width:100%;height:100%;display:flex;flex-direction:column;align-items:${ai};justify-content:${jc};font-family:${ff};font-size:${fs}px;color:${co};text-align:${al};${tabStyle}overflow:hidden;word-wrap:break-word;overflow-wrap:break-word">${h}</div></foreignObject>`);
        } else if (tType === "emoji") {
          const em = String(resolve(t, "emoji", emptyCard, layoutMm) ?? "⭐");
          const fs = Number(resolve(t, "fontSize", emptyCard, layoutMm)) || 32;
          parts.push(`<text x="${tRect.x + tRect.width / 2}" y="${tRect.y + tRect.height / 2}" text-anchor="middle" dominant-baseline="central" font-size="${fs}" fill="#000000">${escape(em)}</text>`);
        } else if (tType === "frame") {
          const sw = Number(resolve(t, "strokeWidth", emptyCard, layoutMm)) || 2;
          const sc = escape(String(resolve(t, "strokeColor", emptyCard, layoutMm) ?? palette.ink));
          const fc = escape(String(resolve(t, "fillColor", emptyCard, layoutMm) ?? "none"));
          const cr = Number(resolve(t, "cornerRadius", emptyCard, layoutMm)) || 0;
          parts.push(`<rect x="${tRect.x}" y="${tRect.y}" width="${tRect.width}" height="${tRect.height}" rx="${cr}" fill="${fc}" stroke="${sc}" stroke-width="${sw}" />`);
        }
      });
      parts.push(`</g>`);
      return wrapRot(parts.join(""));
    }
    if (item.type === "frame" || item.type === "image" || item.type === "emoji" || item.type === "clone") return "";
    const isNumbers = item.type === "numbers";
    const value = String(resolve(item, "defaultValue", emptyCard, layoutMm) ?? "");
    if (!value) return "";
    const slotName = item.font && options.fonts?.[item.font] ? item.font : fontSlots[0];
    const fontSlot = options.fonts?.[slotName];
    const fontFamily = fontSlot ? `'${fontSlot.name}'` : "'sans-serif'";
    const fontSize = item.fontSize ?? 20;
    const align = item.align ?? "center";
    const vAlign = (item as any).verticalAlign ?? "middle";
    const color = escape(item.color ?? palette.ink);
    const justifyContent = vAlign === "top" ? "flex-start" : vAlign === "bottom" ? "flex-end" : "center";
    const alignItems = align === "left" ? "flex-start" : align === "right" ? "flex-end" : "center";
    const styledLines = parseRichText(value);
    const html = styledLines.map(line => `<div>${renderStyledLineHtml(line)}</div>`).join('');
    const tabularStyle = isNumbers ? "font-variant-numeric:tabular-nums;" : "";
    return wrapRot(`<foreignObject x="${rect.x}" y="${rect.y}" width="${rect.width}" height="${rect.height}"><div xmlns="http://www.w3.org/1999/xhtml" style="width:100%;height:100%;display:flex;flex-direction:column;align-items:${alignItems};justify-content:${justifyContent};font-family:${fontFamily};font-size:${fontSize}px;color:${color};text-align:${align};${tabularStyle}overflow:hidden;word-wrap:break-word;overflow-wrap:break-word">${html}</div></foreignObject>`);
  }).join("");

  // Section wireframes
  const sectionRects = showSections ? Array.from(computed.sections.entries())
    .map(([id, rect]) => {
      const isSelected = id === selectedNodeId;
      const strokeColor = isSelected ? SELECTION_COLOR : palette.muted;
      const strokeWidth = isSelected ? SELECTION_STROKE_WIDTH : "1.5";
      const fillColor = isSelected ? `rgba(198, 90, 50, ${SECTION_SELECTION_OPACITY})` : "rgba(255, 255, 255, 0.25)";
      return `<rect x="${rect.x}" y="${rect.y}" width="${rect.width}" height="${rect.height}" rx="12" fill="${fillColor}" stroke="${strokeColor}" stroke-width="${strokeWidth}" stroke-dasharray="6 6" />`;
    }).join("") : "";

  // Item wireframes
  const itemRects = showItems ? Array.from(computed.items.entries())
    .map(([id, rect]) => {
      const isSelected = id === selectedNodeId;
      const strokeColor = isSelected ? SELECTION_COLOR : palette.ink;
      const strokeWidth = isSelected ? SELECTION_STROKE_WIDTH : "1.5";
      const fillColor = isSelected ? `rgba(198, 90, 50, ${ITEM_SELECTION_OPACITY})` : "rgba(255, 255, 255, 0.25)";
      return `<rect x="${rect.x}" y="${rect.y}" width="${rect.width}" height="${rect.height}" rx="10" fill="${fillColor}" stroke="${strokeColor}" stroke-width="${strokeWidth}" />`;
    }).join("") : "";

  const clipPaths = renderedContent.match(/<(?:clipPath|mask)[^]*?<\/(?:clipPath|mask)>/g) ?? [];
  const defs = clipPaths.length > 0 ? `<defs>${clipPaths.join("")}</defs>` : "";
  const contentWithoutClipPaths = renderedContent.replace(/<(?:clipPath|mask)[^]*?<\/(?:clipPath|mask)>/g, "");

  return `<?xml version="1.0" encoding="UTF-8"?>
<svg width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" fill="none" xmlns="http://www.w3.org/2000/svg">
  ${defs}
  <rect x="0" y="0" width="${width}" height="${height}" rx="${radius}" fill="${palette.paper}" />
  ${backgroundImage(width, height, radius, "layout-bg-clip", options)}
  ${contentWithoutClipPaths}
  ${sectionRects}
  ${itemRects}
</svg>`;
};

export const injectDebugLabel = (svg: string, debugAttach: unknown): string => {
  const label = `ATTACH ${JSON.stringify(debugAttach)}`.replaceAll("<", "&lt;").replaceAll(">", "&gt;");
  const insert = `<text x="24" y="70" font-size="12" fill="#d64545" font-family="Space Grotesk, sans-serif">${label}</text>`;
  return svg.replace("</svg>", `${insert}</svg>`);
};
