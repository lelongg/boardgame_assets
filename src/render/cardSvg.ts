import type { AnchorPoint, CardData, CardLayout, CardLayoutItem, CardLayoutSection, CardLayoutTextItem } from "../types.js";
import { theme } from "../theme.js";

const DEBUG_FONT = "'Space Grotesk', sans-serif";

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

const escape = (value: string) =>
  value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");

type Rect = { x: number; y: number; width: number; height: number };

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
    let bold = false;
    let italic = false;
    let match;
    while ((match = regex.exec(part)) !== null) {
      if (match[1]) {
        const tag = match[1];
        if (tag === '<strong>') bold = true;
        else if (tag === '</strong>') bold = false;
        else if (tag === '<em>') italic = true;
        else if (tag === '</em>') italic = false;
      } else if (match[2]) {
        const text = match[2].replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"');
        runs.push({ text, bold, italic });
      }
    }
    lines.push(runs.length ? runs : [{ text: '' }]);
  }
  return lines.length ? lines : [[{ text: '' }]];
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

/** Resolve a property value: card data → binding default → item static value.
 *  Field key is scoped as "prop:field" to avoid collisions, with fallback to plain "field" for compat. */
const resolve = (item: CardLayoutItem, prop: string, card: CardData, layout?: CardLayout): unknown => {
  const binding = item.bindings?.[prop];
  if (binding) {
    if (binding.field === "name") return card.name || (item as any)[prop];
    const scoped = card.fields[`${prop}:${binding.field}`];
    if (scoped !== undefined && scoped !== "") return scoped;
    const plain = card.fields[binding.field];
    if (plain !== undefined && plain !== "") return plain;
    // Fall back to binding default from layout meta
    const meta = layout?.bindingMeta?.[`${prop}:${binding.field}`];
    if (meta?.default !== undefined && meta.default !== "") return meta.default;
  }
  return (item as any)[prop];
};

type LayoutResult = {
  sections: Map<string, Rect>;
  items: Map<string, Rect>;
};

type FontData = { name: string; data: Buffer };

type RenderOptions = {
  debug?: boolean;
  fonts?: Record<string, FontData>;
  fontSlots?: Record<string, { name: string; file?: string }>;
  back?: string;
  backFit?: "cover" | "contain" | "fill";
};


const textAnchorFor = (align: "left" | "center" | "right") => {
  if (align === "center") return "middle";
  if (align === "right") return "end";
  return "start";
};

const baselineFor = (vAlign?: string) => {
  if (vAlign === "middle") return "middle";
  if (vAlign === "bottom") return "auto";
  return "hanging";
};

const anchorPosition = (rect: Rect, anchor: AnchorPoint) => ({
  x: rect.x + rect.width * anchor.x,
  y: rect.y + rect.height * anchor.y
});

const layoutSections = (section: CardLayoutSection, rect: Rect, result: LayoutResult) => {
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

const collectItemPlacements = (
  section: CardLayoutSection,
  result: LayoutResult,
  list: { item: CardLayoutItem; sectionId: string }[]
) => {
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

const layoutItems = (layout: CardLayout, result: LayoutResult) => {
  const placements: { item: CardLayoutItem; sectionId: string }[] = [];
  collectItemPlacements(layout.root, result, placements);

  const placementMap = new Map<string, { item: CardLayoutItem; sectionId: string }>();
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

const computeLayout = (layout: CardLayout): LayoutResult => {
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

  return result;
};

const resolveSection = (section: CardLayoutSection, prop: string, card?: CardData, layout?: CardLayout): unknown => {
  const binding = section.bindings?.[prop];
  if (binding && card) {
    const scoped = card.fields[`${prop}:${binding.field}`];
    if (scoped !== undefined && scoped !== "") return scoped;
    const plain = card.fields[binding.field];
    if (plain !== undefined && plain !== "") return plain;
    const meta = layout?.bindingMeta?.[`${prop}:${binding.field}`];
    if (meta?.default !== undefined && meta.default !== "") return meta.default;
  }
  return (section as any)[prop];
};

const computeRepeatPositions = (section: CardLayoutSection, result: LayoutResult, card?: CardData, layout?: CardLayout) => {
  const rCount = Number(resolveSection(section, 'repeatCount', card, layout)) || 1;
  if (rCount > 1) {
    const rox = mmToPx(Number(resolveSection(section, 'repeatOffsetX', card, layout)) || 0);
    const roy = mmToPx(Number(resolveSection(section, 'repeatOffsetY', card, layout)) || 0);
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
  section.children.forEach((child) => computeRepeatPositions(child, result, card, layout));
};

const collectItems = (section: CardLayoutSection, list: CardLayoutItem[], card?: CardData, layout?: CardLayout) => {
  list.push(...section.items);
  const rCount = Number(resolveSection(section, 'repeatCount', card, layout)) || 1;
  if (rCount > 1) {
    for (let i = 1; i < rCount; i++) {
      section.items.forEach((item) => list.push({ ...item, id: `${item.id}__repeat_${i}` } as CardLayoutItem));
    }
  }
  section.children.forEach((child) => collectItems(child, list, card, layout));
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
  const computed = computeLayout(layout);
  computeRepeatPositions(layout.root, computed, card, layout);
  const fontSlots = Object.keys(options.fontSlots ?? {});
  const items: CardLayoutItem[] = [];
  collectItems(layout.root, items, card, layout);

  // Collect clip paths for images with rounded corners (to avoid duplicates in defs)
  const clipPaths: string[] = [];
  const itemElements: string[] = [];

  items.forEach((item) => {
    const vis = resolve(item, "visible", card, layout);
    if (vis === false || vis === "false") return;
    const baseRect = computed.items.get(item.id);
    if (!baseRect) return;
    const ox = mmToPx(Number(resolve(item, "offsetX", card, layout)) || 0);
    const oy = mmToPx(Number(resolve(item, "offsetY", card, layout)) || 0);
    const rect = (ox || oy) ? { ...baseRect, x: baseRect.x + ox, y: baseRect.y + oy } : baseRect;

    // Handle different item types (default to text for backward compatibility)
    const itemType = item.type ?? "text";
    
    if (itemType === "text") {
      const value = String(resolve(item, "defaultValue", card, layout) ?? "");
      if (!value) return;
      const fontSize = Number(resolve(item, "fontSize", card, layout)) || 16;
      const align = String(resolve(item, "align", card, layout) ?? "center") as "left" | "center" | "right";
      const vAlign = String(resolve(item, "verticalAlign", card, layout) ?? "middle");
      const color = String(resolve(item, "color", card, layout) ?? palette.ink);
      const fontKey = String(resolve(item, "font", card, layout) ?? "");
      const slotName = fontKey && options.fontSlots?.[fontKey] ? fontKey : fontSlots[0];
      const fontSlot = options.fontSlots?.[slotName];
      const fontFamily = fontSlot ? `'${fontSlot.name}'` : "'sans-serif'";
      const justify = align === "left" ? "flex-start" : align === "right" ? "flex-end" : "center";
      const alignItems = vAlign === "top" ? "flex-start" : vAlign === "bottom" ? "flex-end" : "center";
      const styledLines = parseRichText(value);
      const html = styledLines.map(line => `<div>${renderStyledLineHtml(line)}</div>`).join('');
      itemElements.push(`<foreignObject x="${rect.x}" y="${rect.y}" width="${rect.width}" height="${rect.height}"><div xmlns="http://www.w3.org/1999/xhtml" style="width:100%;height:100%;display:flex;align-items:${alignItems};justify-content:${justify};font-family:${fontFamily};font-size:${fontSize}px;color:${color};text-align:${align};overflow:hidden;word-wrap:break-word;overflow-wrap:break-word">${html}</div></foreignObject>`);
    }

    if (itemType === "frame") {
      const strokeWidth = Number(resolve(item, "strokeWidth", card, layout)) || 2;
      const strokeColor = String(resolve(item, "strokeColor", card, layout) ?? palette.ink);
      const fillColor = String(resolve(item, "fillColor", card, layout) ?? "none");
      const cornerRadius = Number(resolve(item, "cornerRadius", card, layout)) || 8;
      itemElements.push(`<rect x="${rect.x}" y="${rect.y}" width="${rect.width}" height="${rect.height}" rx="${cornerRadius}" fill="${fillColor}" stroke="${strokeColor}" stroke-width="${strokeWidth}" />`);
    }

    if (itemType === "image") {
      const imageUrl = String(resolve(item, "defaultValue", card, layout) ?? "");
      if (!imageUrl) return;
      const cornerRadius = Number(resolve(item, "cornerRadius", card, layout)) || 0;
      const clipId = `clip-${item.id}`;
      const fit = String(resolve(item, "fit", card, layout) ?? "cover");

      let imageProps = "";
      if (fit === "cover" || fit === "contain") {
        imageProps = `x="${rect.x}" y="${rect.y}" width="${rect.width}" height="${rect.height}" preserveAspectRatio="${fit === "cover" ? "xMidYMid slice" : "xMidYMid meet"}"`;
      } else {
        imageProps = `x="${rect.x}" y="${rect.y}" width="${rect.width}" height="${rect.height}" preserveAspectRatio="none"`;
      }

      if (cornerRadius > 0) {
        clipPaths.push(`<clipPath id="${clipId}"><rect x="${rect.x}" y="${rect.y}" width="${rect.width}" height="${rect.height}" rx="${cornerRadius}" /></clipPath>`);
        itemElements.push(`<image ${imageProps} href="${escape(imageUrl)}" clip-path="url(#${clipId})" />`);
      } else {
        itemElements.push(`<image ${imageProps} href="${escape(imageUrl)}" />`);
      }
    }

    if (itemType === "emoji") {
      const emoji = String(resolve(item, "emoji", card, layout) ?? "⭐");
      const fontSize = Number(resolve(item, "fontSize", card, layout)) || 32;
      const textX = rect.x + rect.width / 2;
      const textY = rect.y + rect.height / 2;
      itemElements.push(`<text x="${textX}" y="${textY}" text-anchor="middle" dominant-baseline="central" font-size="${fontSize}" fill="#000000">${escape(emoji)}</text>`);
    }

    if (itemType === "copy") {
      const targetId = (item as any).copyTargetId;
      if (!targetId) return;
      // Find target items: either a single item or all items in a section
      const targetItem = findItem(layout.root, targetId);
      const targetSection = targetItem ? null : findSection(layout.root, targetId);
      const targets = targetItem ? [targetItem] : (targetSection ? getAllSectionItems(targetSection) : []);
      if (!targets.length) return;
      // Render each target's content at the copy's rect, scaled to fit
      const targetRects = targets.map(t => computed.items.get(t.id)).filter(Boolean) as Rect[];
      if (!targetRects.length) return;
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
      itemElements.push(`<g transform="translate(${tx},${ty}) scale(${scaleX},${scaleY})">`);
      // Re-render targets inside the group (they'll use their original rects, scaled by the group transform)
      targets.forEach(t => {
        const tRect = computed.items.get(t.id);
        if (!tRect) return;
        const tType = t.type ?? "text";
        if (tType === "text") {
          const value = String(resolve(t, "defaultValue", card, layout) ?? "");
          if (!value) return;
          const fontSize = Number(resolve(t, "fontSize", card, layout)) || 16;
          const align = String(resolve(t, "align", card, layout) ?? "center") as "left" | "center" | "right";
          const vAlign = String(resolve(t, "verticalAlign", card, layout) ?? "middle");
          const color = String(resolve(t, "color", card, layout) ?? palette.ink);
          const fontKey = String(resolve(t, "font", card, layout) ?? "");
          const slotName = fontKey && options.fontSlots?.[fontKey] ? fontKey : fontSlots[0];
          const fontSlot = options.fontSlots?.[slotName];
          const fontFamily = fontSlot ? `'${fontSlot.name}'` : "'sans-serif'";
          const textX = align === "left" ? tRect.x : align === "right" ? tRect.x + tRect.width : tRect.x + tRect.width / 2;
          const textY = vAlign === "top" ? tRect.y : vAlign === "bottom" ? tRect.y + tRect.height : tRect.y + tRect.height / 2;
          itemElements.push(`<text x="${textX}" y="${textY}" text-anchor="${textAnchorFor(align)}" dominant-baseline="${baselineFor(vAlign as any)}" font-family="${fontFamily}" font-size="${fontSize}" fill="${color}">${escape(value)}</text>`);
        } else if (tType === "emoji") {
          const emoji = String(resolve(t, "emoji", card, layout) ?? "⭐");
          const fontSize = Number(resolve(t, "fontSize", card, layout)) || 32;
          itemElements.push(`<text x="${tRect.x + tRect.width / 2}" y="${tRect.y + tRect.height / 2}" text-anchor="middle" dominant-baseline="central" font-size="${fontSize}" fill="#000000">${escape(emoji)}</text>`);
        } else if (tType === "frame") {
          const sw = Number(resolve(t, "strokeWidth", card, layout)) || 2;
          const sc = String(resolve(t, "strokeColor", card, layout) ?? palette.ink);
          const fc = String(resolve(t, "fillColor", card, layout) ?? "none");
          const cr = Number(resolve(t, "cornerRadius", card, layout)) || 0;
          itemElements.push(`<rect x="${tRect.x}" y="${tRect.y}" width="${tRect.width}" height="${tRect.height}" rx="${cr}" fill="${fc}" stroke="${sc}" stroke-width="${sw}" />`);
        }
      });
      itemElements.push(`</g>`);
    }
  });

  const itemTexts = itemElements.join("");

  const usedSlots = new Set<string>();
  items.forEach((item) => {
    if ((item.type ?? "text") === "text") {
      const textItem = item as CardLayoutTextItem;
      const slotName = textItem.font && options.fontSlots?.[textItem.font] ? textItem.font : fontSlots[0];
      if (slotName) usedSlots.add(slotName);
    }
  });

  let fontStyles = "";
  if (options.fonts) {
    const rules = Array.from(usedSlots)
      .filter((slot) => options.fonts![slot])
      .map((slot) => {
        const fd = options.fonts![slot];
        const b64 = fd.data.toString("base64");
        return `@font-face { font-family: '${fd.name}'; src: url('data:font/woff2;base64,${b64}') format('woff2'); }`;
      })
      .join("\n      ");
    if (rules) fontStyles = `<style>${rules}</style>`;
  }

  const defs = (clipPaths.length > 0 || fontStyles) ? `<defs>${fontStyles}${clipPaths.join("")}</defs>` : "";
  const renderedItems = itemTexts;

  return `<?xml version="1.0" encoding="UTF-8"?>
<svg width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" fill="none" xmlns="http://www.w3.org/2000/svg">
  ${defs}
  <rect x="0" y="0" width="${width}" height="${height}" rx="${radius}" fill="${palette.paper}" />
  ${options.back ? `<clipPath id="card-clip"><rect x="0" y="0" width="${width}" height="${height}" rx="${radius}" /></clipPath><image x="0" y="0" width="${width}" height="${height}" href="${escape(options.back)}" preserveAspectRatio="${options.backFit === 'contain' ? 'xMidYMid meet' : options.backFit === 'fill' ? 'none' : 'xMidYMid slice'}" clip-path="url(#card-clip)" />` : ''}
  ${renderedItems}
</svg>`;
};

type LayoutSvgOptions = {
  showWireframes?: boolean;
  selectedNodeId?: string | null;
};

export const renderLayoutSvg = (layoutMm: CardLayout, options: LayoutSvgOptions = {}): string => {
  const layout = layoutToPx(layoutMm);
  const { showWireframes = true, selectedNodeId = null } = options;
  const { palette } = theme;
  const { width, height, radius } = layout;
  const computed = computeLayout(layout);

  const selectedColor = "#2563eb";

  const sectionRects = Array.from(computed.sections.entries())
    .map(([id, rect]) => {
      const isSelected = id === selectedNodeId;
      if (!showWireframes && !isSelected) return "";
      const section = findSection(layout.root, id);
      const label = section ? section.name || section.id : id;
      const stroke = isSelected ? selectedColor : palette.muted;
      const strokeWidth = isSelected ? 2.5 : 1;
      return `
  <rect x="${rect.x}" y="${rect.y}" width="${rect.width}" height="${rect.height}" rx="12" fill="none" stroke="${stroke}" stroke-width="${strokeWidth}" stroke-dasharray="6 6" />
  <text x="${rect.x + 8}" y="${rect.y + 18}" font-size="12" fill="${stroke}" font-family="${DEBUG_FONT}">${escape(label)}</text>`;
    })
    .join("");

  const itemRects = Array.from(computed.items.entries())
    .map(([id, rect]) => {
      const isSelected = id === selectedNodeId;
      if (!showWireframes && !isSelected) return "";
      const item = findItem(layout.root, id);
      const stroke = isSelected ? selectedColor : palette.ink;
      const strokeWidth = isSelected ? 2.5 : 1;
      return `
  <rect x="${rect.x}" y="${rect.y}" width="${rect.width}" height="${rect.height}" rx="10" fill="${isSelected ? selectedColor + "08" : "none"}" stroke="${stroke}" stroke-width="${strokeWidth}" />
  ${item ? `<text x="${rect.x + 6}" y="${rect.y + 16}" font-size="11" fill="${stroke}" font-family="${DEBUG_FONT}">${escape(item.name || item.id)}</text>` : ""}`;
    })
    .join("");

  return `<?xml version="1.0" encoding="UTF-8"?>
<svg width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" fill="none" xmlns="http://www.w3.org/2000/svg">
  <rect x="0" y="0" width="${width}" height="${height}" rx="${radius}" fill="${palette.paper}" />
  ${sectionRects}
  ${itemRects}
</svg>`;
};
