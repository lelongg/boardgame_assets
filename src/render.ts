import { theme } from "./theme.js";
import type { AnchorPoint, CardData, CardLayout, CardLayoutItem, CardLayoutSection, PropertyBinding } from "./types.js";

// 300 DPI: 1mm = 300/25.4 ≈ 11.811 pixels
const PX_PER_MM = 300 / 25.4;
const mmToPx = (mm: number) => Math.round(mm * PX_PER_MM);
const layoutToPx = (layout: CardLayout): CardLayout => ({
  ...layout,
  width: mmToPx(layout.width),
  height: mmToPx(layout.height),
  radius: mmToPx(layout.radius),
  bleed: mmToPx(layout.bleed),
});

type Rect = {
  x: number;
  y: number;
  width: number;
  height: number;
};

type LayoutResult = {
  sections: Map<string, Rect>;
  items: Map<string, Rect>;
};

type ItemPlacement = {
  item: CardLayoutItem;
  sectionId: string;
};

type RenderOptions = {
  debug?: boolean;
  back?: string;
  backFit?: "cover" | "contain" | "fill";
  fonts?: Record<string, { name: string; file: string }>;
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
  if (!/<(?:p|strong|em|\/p|\/strong|\/em)[ >]/.test(html)) {
    return html.split('\n').map(line => [{ text: line }]);
  }
  const lines: StyledLine[] = [];
  const blocks = html.match(/<p>([\s\S]*?)<\/p>/g);
  const parts = blocks ? blocks.map(b => b.replace(/<\/?p>/g, '')) : [html];
  for (const part of parts) {
    const runs: StyledRun[] = [];
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
    if (!text && runs.length === 1) return '&nbsp;';
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

/** Resolve a property value: card data → binding default → item static value. */
const resolve = (item: CardLayoutItem, prop: string, card: CardData, layoutRef?: CardLayout): unknown => {
  const binding = (item as any).bindings?.[prop];
  if (binding) {
    if (binding.field === "name") return card.name || (item as any)[prop];
    const scoped = card.fields[`${prop}:${binding.field}`];
    if (scoped !== undefined && scoped !== "") return scoped;
    const plain = card.fields[binding.field];
    if (plain !== undefined && plain !== "") return plain;
    const meta = layoutRef?.bindingMeta?.[`${prop}:${binding.field}`];
    if (meta?.default !== undefined && meta.default !== "") return meta.default;
  }
  return (item as any)[prop];
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
    const childRect =
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

const placeItem = (item: CardLayoutItem, sectionRect: Rect, targetRect: Rect): Rect => {
  const sizeWidth = sectionRect.width * (item.widthPct / 100);
  const sizeHeight = sectionRect.height * (item.heightPct / 100);
  const target = anchorPosition(targetRect, item.attach.anchor);

  return {
    x: target.x - sizeWidth * item.anchor.x,
    y: target.y - sizeHeight * item.anchor.y,
    width: sizeWidth,
    height: sizeHeight
  };
};

const layoutItems = (layout: CardLayout, result: LayoutResult): void => {
  const placements: ItemPlacement[] = [];
  collectItemPlacements(layout.root, result, placements);

  const placementMap = new Map();
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

    let targetRect = null;
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

const computeLayoutPx = (layout: CardLayout): LayoutResult => {
  const result = {
    sections: new Map(),
    items: new Map()
  };

  const rootRect = {
    x: layout.bleed,
    y: layout.bleed,
    width: layout.width - layout.bleed * 2,
    height: layout.height - layout.bleed * 2
  };

  layoutSections(layout.root, rootRect, result);
  layoutItems(layout, result);

  return result;
};

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

export const computeLayout = (layoutMm: CardLayout): LayoutResult =>
  computeLayoutPx(layoutToPx(layoutMm));

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

export const renderCardSvg = (card: CardData, layoutMm: CardLayout, options: RenderOptions = {}): string => {
  const layout = layoutToPx(layoutMm);
  const { palette } = theme;
  const { width, height, radius } = layout;
  const fontSlots = Object.keys(options.fonts ?? {});
  const computed = computeLayoutPx(layout);
  computeRepeatPositions(layout.root, computed, card, layoutMm);
  const items: CardLayoutItem[] = [];
  collectItems(layout.root, items, card, layoutMm);

  const renderedItems = items
    .map((item) => {
      const vis = resolve(item, "visible", card, layoutMm);
      if (vis === false || vis === "false") return "";
      const baseRect = computed.items.get(item.id);
      if (!baseRect) return "";
      const ox = mmToPx(Number(resolve(item, "offsetX", card, layoutMm)) || 0);
      const oy = mmToPx(Number(resolve(item, "offsetY", card, layoutMm)) || 0);
      const rect = (ox || oy) ? { ...baseRect, x: baseRect.x + ox, y: baseRect.y + oy } : baseRect;

      const itemType = item.type ?? "text"; // Default to text for legacy items
      
      if (itemType === "frame") {
        // Render frame item - type guard
        if (item.type !== "frame") return "";
        const strokeWidth = item.strokeWidth ?? 2;
        const strokeColor = escape(item.strokeColor ?? palette.ink);
        const fillColor = escape(item.fillColor ?? "none");
        const cornerRadius = item.cornerRadius ?? 0;
        return `<rect x="${rect.x}" y="${rect.y}" width="${rect.width}" height="${rect.height}" rx="${cornerRadius}" fill="${fillColor}" stroke="${strokeColor}" stroke-width="${strokeWidth}" />`;
      }
      
      if (itemType === "image") {
        // Render image item - type guard
        if (item.type !== "image") return "";
        const value = String(resolve(item, "defaultValue", card, layoutMm) ?? "");
        if (!value) return "";
        const cornerRadius = item.cornerRadius ?? 0;
        const fit = item.fit ?? "cover";

        const clipId = `clip-${String(item.id).replace(/[^a-zA-Z0-9-_]/g, '')}`;
        const clipPath = cornerRadius > 0
          ? `<clipPath id="${clipId}"><rect x="${rect.x}" y="${rect.y}" width="${rect.width}" height="${rect.height}" rx="${cornerRadius}" /></clipPath>`
          : "";
        const preserveAspectRatio = fit === "contain" ? "xMidYMid meet" : fit === "fill" ? "none" : "xMidYMid slice";
        const clipAttr = cornerRadius > 0 ? ` clip-path="url(#${clipId})"` : "";

        return `${clipPath}<image x="${rect.x}" y="${rect.y}" width="${rect.width}" height="${rect.height}" href="${escape(value)}" preserveAspectRatio="${preserveAspectRatio}"${clipAttr} />`;
      }
      
      if (itemType === "emoji") {
        if (item.type !== "emoji") return "";
        const emoji = String(resolve(item, "emoji", card, layoutMm) ?? "⭐");
        const fontSize = item.fontSize ?? 32;
        const textX = rect.x + rect.width / 2;
        const textY = rect.y + rect.height / 2;
        return `<text x="${textX}" y="${textY}" text-anchor="middle" dominant-baseline="central" font-size="${fontSize}" fill="#000000">${escape(emoji)}</text>`;
      }

      if (itemType === "copy") {
        const targetId = (item as any).copyTargetId;
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
        const srcW = bounds.x2 - bounds.x || 1;
        const srcH = bounds.y2 - bounds.y || 1;
        const scaleX = rect.width / srcW;
        const scaleY = rect.height / srcH;
        const tx = rect.x - bounds.x * scaleX;
        const ty = rect.y - bounds.y * scaleY;
        const parts = [`<g transform="translate(${tx},${ty}) scale(${scaleX},${scaleY})">`];
        targets.forEach(t => {
          const tRect = computed.items.get(t.id);
          if (!tRect) return;
          const tType = t.type ?? "text";
          if (tType === "text") {
            const v = String(resolve(t, "defaultValue", card, layoutMm) ?? "");
            if (!v) return;
            const fs = Number(resolve(t, "fontSize", card, layoutMm)) || 20;
            const al = String(resolve(t, "align", card, layoutMm) ?? "center");
            const va = String(resolve(t, "verticalAlign", card, layoutMm) ?? "middle");
            const co = escape(String(resolve(t, "color", card, layoutMm) ?? palette.ink));
            const fk = String(resolve(t, "font", card, layoutMm) ?? "");
            const sn = fk && options.fonts?.[fk] ? fk : fontSlots[0];
            const ff = options.fonts?.[sn] ? `'${options.fonts[sn].name}'` : "'sans-serif'";
            const tx2 = al === "left" ? tRect.x : al === "right" ? tRect.x + tRect.width : tRect.x + tRect.width / 2;
            const ty2 = va === "top" ? tRect.y : va === "bottom" ? tRect.y + tRect.height : tRect.y + tRect.height / 2;
            parts.push(`<text x="${tx2}" y="${ty2}" text-anchor="${textAnchorFor(al)}" dominant-baseline="${baselineFor(va)}" font-family="${ff}" font-size="${fs}" fill="${co}">${escape(v)}</text>`);
          } else if (tType === "emoji") {
            const em = String(resolve(t, "emoji", card, layoutMm) ?? "⭐");
            const fs = (t as any).fontSize ?? 32;
            parts.push(`<text x="${tRect.x + tRect.width / 2}" y="${tRect.y + tRect.height / 2}" text-anchor="middle" dominant-baseline="central" font-size="${fs}" fill="#000000">${escape(em)}</text>`);
          } else if (tType === "frame") {
            const sw = (t as any).strokeWidth ?? 2;
            const sc = escape((t as any).strokeColor ?? palette.ink);
            const fc = escape((t as any).fillColor ?? "none");
            const cr = (t as any).cornerRadius ?? 0;
            parts.push(`<rect x="${tRect.x}" y="${tRect.y}" width="${tRect.width}" height="${tRect.height}" rx="${cr}" fill="${fc}" stroke="${sc}" stroke-width="${sw}" />`);
          }
        });
        parts.push(`</g>`);
        return parts.join("");
      }

      // Render text item (default) - type guard
      if (item.type === "frame" || item.type === "image" || item.type === "emoji" || item.type === "copy") return "";
      const value = String(resolve(item, "defaultValue", card, layoutMm) ?? "");
      if (!value) return "";
      const fontKey = String(resolve(item, "font", card, layoutMm) ?? "");
      const slotName = fontKey && options.fonts?.[fontKey] ? fontKey : fontSlots[0];
      const fontSlot = options.fonts?.[slotName];
      const fontFamily = fontSlot ? `'${fontSlot.name}'` : "'sans-serif'";
      const fontSize = Number(resolve(item, "fontSize", card, layoutMm)) || 20;
      const align = String(resolve(item, "align", card, layoutMm) ?? "center");
      const vAlign = String(resolve(item, "verticalAlign", card, layoutMm) ?? "middle");
      const color = escape(String(resolve(item, "color", card, layoutMm) ?? palette.ink));
      const justify = align === "left" ? "flex-start" : align === "right" ? "flex-end" : "center";
      const alignItems = vAlign === "top" ? "flex-start" : vAlign === "bottom" ? "flex-end" : "center";
      const styledLines = parseRichText(value);
      const html = styledLines.map(line => `<div>${renderStyledLineHtml(line)}</div>`).join('');
      return `<foreignObject x="${rect.x}" y="${rect.y}" width="${rect.width}" height="${rect.height}"><div xmlns="http://www.w3.org/1999/xhtml" style="width:100%;height:100%;display:flex;align-items:${alignItems};justify-content:${justify};font-family:${fontFamily};font-size:${fontSize}px;color:${color};text-align:${align};overflow:hidden;word-wrap:break-word;overflow-wrap:break-word">${html}</div></foreignObject>`;
    })
    .join("");

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
  <rect x="0" y="0" width="${width}" height="${height}" rx="${radius}" fill="${palette.paper}" />
  ${options.back ? `<clipPath id="card-bg-clip"><rect x="0" y="0" width="${width}" height="${height}" rx="${radius}" /></clipPath><image x="0" y="0" width="${width}" height="${height}" href="${escape(options.back)}" preserveAspectRatio="${options.backFit === 'contain' ? 'xMidYMid meet' : options.backFit === 'fill' ? 'none' : 'xMidYMid slice'}" clip-path="url(#card-bg-clip)" />` : ''}
  ${debugLabel}
  ${debugRects}
  ${debugAnchors}
  ${renderedItems}
</svg>`;
};

export const renderLayoutSvg = (layoutMm: CardLayout, options: {
  showSections?: boolean;
  showItems?: boolean;
  selectedNodeId?: string | null;
  card?: CardData;
  back?: string;
  fonts?: Record<string, { name: string; file: string }>;
} = {}): string => {
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
    const baseRect = computed.items.get(item.id);
    if (!baseRect) return "";
    const lox = mmToPx((item as any).offsetX ?? 0);
    const loy = mmToPx((item as any).offsetY ?? 0);
    const rect = (lox || loy) ? { ...baseRect, x: baseRect.x + lox, y: baseRect.y + loy } : baseRect;
    const itemType = item.type ?? "text";
    if (itemType === "frame") {
      if (item.type !== "frame") return "";
      const sw = item.strokeWidth ?? 2;
      const sc = escape(item.strokeColor ?? palette.ink);
      const fc = escape(item.fillColor ?? "none");
      const cr = item.cornerRadius ?? 0;
      return `<rect x="${rect.x}" y="${rect.y}" width="${rect.width}" height="${rect.height}" rx="${cr}" fill="${fc}" stroke="${sc}" stroke-width="${sw}" />`;
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
      return `${clipPath}<image x="${rect.x}" y="${rect.y}" width="${rect.width}" height="${rect.height}" href="${escape(value)}" preserveAspectRatio="${par}"${ca} />`;
    }
    if (itemType === "emoji") {
      if (item.type !== "emoji") return "";
      const emoji = String(resolve(item, "emoji", emptyCard, layoutMm) ?? "⭐");
      const fontSize = item.fontSize ?? 32;
      const textX = rect.x + rect.width / 2;
      const textY = rect.y + rect.height / 2;
      return `<text x="${textX}" y="${textY}" text-anchor="middle" dominant-baseline="central" font-size="${fontSize}" fill="#000000">${escape(emoji)}</text>`;
    }
    if (item.type === "frame" || item.type === "image" || item.type === "emoji" || item.type === "copy") return "";
    const value = String(resolve(item, "defaultValue", emptyCard, layoutMm) ?? "");
    if (!value) return "";
    const slotName = item.font && options.fonts?.[item.font] ? item.font : fontSlots[0];
    const fontSlot = options.fonts?.[slotName];
    const fontFamily = fontSlot ? `'${fontSlot.name}'` : "'sans-serif'";
    const fontSize = item.fontSize ?? 20;
    const align = item.align ?? "center";
    const vAlign = (item as any).verticalAlign ?? "middle";
    const color = escape(item.color ?? palette.ink);
    const justify = align === "left" ? "flex-start" : align === "right" ? "flex-end" : "center";
    const alignItems = vAlign === "top" ? "flex-start" : vAlign === "bottom" ? "flex-end" : "center";
    const styledLines = parseRichText(value);
    const html = styledLines.map(line => `<div>${renderStyledLineHtml(line)}</div>`).join('');
    return `<foreignObject x="${rect.x}" y="${rect.y}" width="${rect.width}" height="${rect.height}"><div xmlns="http://www.w3.org/1999/xhtml" style="width:100%;height:100%;display:flex;align-items:${alignItems};justify-content:${justify};font-family:${fontFamily};font-size:${fontSize}px;color:${color};text-align:${align};overflow:hidden;word-wrap:break-word;overflow-wrap:break-word">${html}</div></foreignObject>`;
  }).join("");

  // Section wireframes
  const sectionRects = showSections ? Array.from(computed.sections.entries())
    .map(([id, rect]) => {
      const isSelected = id === selectedNodeId;
      const strokeColor = isSelected ? SELECTION_COLOR : palette.muted;
      const strokeWidth = isSelected ? SELECTION_STROKE_WIDTH : "1";
      const fillColor = isSelected ? `rgba(198, 90, 50, ${SECTION_SELECTION_OPACITY})` : "none";
      return `<rect x="${rect.x}" y="${rect.y}" width="${rect.width}" height="${rect.height}" rx="12" fill="${fillColor}" stroke="${strokeColor}" stroke-width="${strokeWidth}" stroke-dasharray="6 6" />`;
    }).join("") : "";

  // Item wireframes
  const itemRects = showItems ? Array.from(computed.items.entries())
    .map(([id, rect]) => {
      const isSelected = id === selectedNodeId;
      const strokeColor = isSelected ? SELECTION_COLOR : palette.ink;
      const strokeWidth = isSelected ? SELECTION_STROKE_WIDTH : "1";
      const fillColor = isSelected ? `rgba(198, 90, 50, ${ITEM_SELECTION_OPACITY})` : "none";
      return `<rect x="${rect.x}" y="${rect.y}" width="${rect.width}" height="${rect.height}" rx="10" fill="${fillColor}" stroke="${strokeColor}" stroke-width="${strokeWidth}" />`;
    }).join("") : "";

  const clipPaths = renderedContent.match(/<clipPath[^]*?<\/clipPath>/g) ?? [];
  const defs = clipPaths.length > 0 ? `<defs>${clipPaths.join("")}</defs>` : "";
  const contentWithoutClipPaths = renderedContent.replace(/<clipPath[^]*?<\/clipPath>/g, "");

  return `<?xml version="1.0" encoding="UTF-8"?>
<svg width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" fill="none" xmlns="http://www.w3.org/2000/svg">
  ${defs}
  <rect x="0" y="0" width="${width}" height="${height}" rx="${radius}" fill="${palette.paper}" />
  ${options.back ? `<clipPath id="layout-bg-clip"><rect x="0" y="0" width="${width}" height="${height}" rx="${radius}" /></clipPath><image x="0" y="0" width="${width}" height="${height}" href="${escape(options.back)}" preserveAspectRatio="${options.backFit === 'contain' ? 'xMidYMid meet' : options.backFit === 'fill' ? 'none' : 'xMidYMid slice'}" clip-path="url(#layout-bg-clip)" />` : ''}
  ${contentWithoutClipPaths}
  ${sectionRects}
  ${itemRects}
</svg>`;
};

/** Fetch layout fonts and embed them as base64 @font-face rules into the SVG.
 *  Blob SVGs displayed via <img> can't access the page's @font-face rules. */
export const embedFontsInSvg = async (svg: string, gameId: string, gameFonts: Record<string, { name: string; file: string }>): Promise<string> => {
  if (!Object.keys(gameFonts).length) return svg;
  const rules: string[] = [];
  for (const slot of Object.values(gameFonts)) {
    if (!slot.file) continue;
    try {
      const resp = await fetch(`/api/games/${gameId}/fonts/${slot.file}`);
      if (!resp.ok) continue;
      const blob = await resp.blob();
      const b64 = await new Promise<string>((resolve) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result as string);
        reader.readAsDataURL(blob);
      });
      rules.push(`@font-face { font-family: '${slot.name}'; src: url('${b64}'); }`);
    } catch { /* skip */ }
  }
  if (!rules.length) return svg;
  const css = rules.join('\n');
  const svgStyle = `<defs><style>${css}</style></defs>`;
  return svg.replace(/(<svg[^>]*>)/, `$1${svgStyle}`);
};

/** Fetch images referenced via /api/ URLs and embed them as base64 data URIs.
 *  Blob SVGs displayed via <img> can't fetch external URLs. */
export const embedImagesInSvg = async (svg: string): Promise<string> => {
  const matches = svg.match(/href="(\/api\/[^"]+)"/g) || [];
  for (const m of matches) {
    const url = m.slice(6, -1);
    try {
      const resp = await fetch(url);
      if (!resp.ok) continue;
      const blob = await resp.blob();
      const b64 = await new Promise<string>((resolve) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result as string);
        reader.readAsDataURL(blob);
      });
      svg = svg.replace(`href="${url}"`, `href="${b64}"`);
    } catch { /* skip */ }
  }
  return svg;
};

export const injectDebugLabel = (svg: string, debugAttach: unknown): string => {
  const label = `ATTACH ${JSON.stringify(debugAttach)}`.replaceAll("<", "&lt;").replaceAll(">", "&gt;");
  const insert = `<text x="24" y="70" font-size="12" fill="#d64545" font-family="Space Grotesk, sans-serif">${label}</text>`;
  return svg.replace("</svg>", `${insert}</svg>`);
};
