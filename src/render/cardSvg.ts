import type { AnchorPoint, CardData, CardTemplate, CardTemplateItem, CardTemplateSection, CardTemplateTextItem, CardTemplateFrameItem, CardTemplateImageItem, CardTemplateEmojiItem } from "../types.js";
import { theme } from "../theme.js";

const DEBUG_FONT = "'Space Grotesk', sans-serif";

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

type LayoutResult = {
  sections: Map<string, Rect>;
  items: Map<string, Rect>;
};

type FontData = { name: string; data: Buffer };

type RenderOptions = {
  debug?: boolean;
  fonts?: Record<string, FontData>;
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

const layoutSections = (section: CardTemplateSection, rect: Rect, result: LayoutResult) => {
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
  section: CardTemplateSection,
  result: LayoutResult,
  list: { item: CardTemplateItem; sectionId: string }[]
) => {
  section.items.forEach((item) => list.push({ item, sectionId: section.id }));
  section.children.forEach((child) => collectItemPlacements(child, result, list));
};

const placeItem = (item: CardTemplateItem, sectionRect: Rect, targetRect: Rect): Rect => {
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

const layoutItems = (template: CardTemplate, result: LayoutResult) => {
  const placements: { item: CardTemplateItem; sectionId: string }[] = [];
  collectItemPlacements(template.root, result, placements);

  const placementMap = new Map<string, { item: CardTemplateItem; sectionId: string }>();
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

const computeLayout = (template: CardTemplate): LayoutResult => {
  const result: LayoutResult = {
    sections: new Map(),
    items: new Map()
  };

  const rootRect: Rect = {
    x: template.bleed,
    y: template.bleed,
    width: template.width - template.bleed * 2,
    height: template.height - template.bleed * 2
  };

  layoutSections(template.root, rootRect, result);
  layoutItems(template, result);

  return result;
};

const collectItems = (section: CardTemplateSection, list: CardTemplateItem[]) => {
  list.push(...section.items);
  section.children.forEach((child) => collectItems(child, list));
};

const findSection = (section: CardTemplateSection, id: string): CardTemplateSection | null => {
  if (section.id === id) return section;
  for (const child of section.children) {
    const found = findSection(child, id);
    if (found) return found;
  }
  return null;
};

const findItem = (section: CardTemplateSection, id: string): CardTemplateItem | null => {
  const item = section.items.find((candidate) => candidate.id === id);
  if (item) return item;
  for (const child of section.children) {
    const found = findItem(child, id);
    if (found) return found;
  }
  return null;
};

export const renderCardSvg = (card: CardData, template: CardTemplate, options: RenderOptions = {}): string => {
  const { palette } = theme;
  const { width, height, radius } = template;
  const layout = computeLayout(template);
  const fontSlots = Object.keys(template.fonts ?? {});
  const items: CardTemplateItem[] = [];
  collectItems(template.root, items);

  // Collect clip paths for images with rounded corners (to avoid duplicates in defs)
  const clipPaths: string[] = [];
  const itemElements: string[] = [];

  items.forEach((item) => {
    const rect = layout.items.get(item.id);
    if (!rect) return;
    
    // Handle different item types (default to text for backward compatibility)
    const itemType = item.type ?? "text";
    
    if (itemType === "text") {
      const textItem = item as CardTemplateTextItem;
      const value = textItem.fieldId === "name" ? card.name : (textItem.fieldId ? card.fields[textItem.fieldId] : null) ?? textItem.defaultValue ?? "";
      if (!value) return;
      const slotName = textItem.font && template.fonts?.[textItem.font] ? textItem.font : fontSlots[0];
      const fontSlot = template.fonts?.[slotName];
      const fontFamily = fontSlot ? `'${fontSlot.name}'` : "'sans-serif'";
      const align = textItem.align ?? "center";
      const vAlign = textItem.verticalAlign ?? "middle";
      const textX = align === "left" ? rect.x : align === "right" ? rect.x + rect.width : rect.x + rect.width / 2;
      const textY = vAlign === "top" ? rect.y : vAlign === "bottom" ? rect.y + rect.height : rect.y + rect.height / 2;
      const styledLines = parseRichText(value);
      const baseAttrs = `text-anchor="${textAnchorFor(align)}" dominant-baseline="${baselineFor(vAlign)}" font-family="${fontFamily}" font-size="${textItem.fontSize}" fill="${textItem.color ?? palette.ink}"`;
      if (styledLines.length === 1) {
        itemElements.push(`<text x="${textX}" y="${textY}" ${baseAttrs}>${renderStyledLine(styledLines[0])}</text>`);
      } else {
        const tspans = styledLines.map((line, i) =>
          `<tspan x="${textX}" ${i === 0 ? `y="${textY}"` : `dy="${textItem.fontSize * 1.2}"`}>${renderStyledLine(line)}</tspan>`
        ).join('');
        itemElements.push(`<text ${baseAttrs}>${tspans}</text>`);
      }
    }
    
    if (itemType === "frame") {
      const frameItem = item as CardTemplateFrameItem;
      const strokeWidth = frameItem.strokeWidth ?? 2;
      const strokeColor = frameItem.strokeColor ?? palette.ink;
      const fillColor = frameItem.fillColor ?? "none";
      const cornerRadius = frameItem.cornerRadius ?? 8;
      itemElements.push(`<rect x="${rect.x}" y="${rect.y}" width="${rect.width}" height="${rect.height}" rx="${cornerRadius}" fill="${fillColor}" stroke="${strokeColor}" stroke-width="${strokeWidth}" />`);
    }
    
    if (itemType === "image") {
      const imageItem = item as CardTemplateImageItem;
      const imageUrl = (imageItem.fieldId ? card.fields[imageItem.fieldId] : null) ?? imageItem.defaultValue ?? "";
      if (!imageUrl) return;
      const cornerRadius = imageItem.cornerRadius ?? 0;
      const clipId = `clip-${imageItem.id}`;
      const fit = imageItem.fit ?? "cover";

      // Calculate image dimensions based on fit mode
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
      const emojiItem = item as CardTemplateEmojiItem;
      const emoji = emojiItem.emoji ?? "⭐";
      const fontSize = emojiItem.fontSize ?? 32;
      const textX = rect.x + rect.width / 2;
      const textY = rect.y + rect.height / 2;
      itemElements.push(`<text x="${textX}" y="${textY}" text-anchor="middle" dominant-baseline="central" font-size="${fontSize}" font-family="'Apple Color Emoji','Segoe UI Emoji','Noto Color Emoji',sans-serif">${escape(emoji)}</text>`);
    }
  });

  const itemTexts = itemElements.join("");

  const usedSlots = new Set<string>();
  items.forEach((item) => {
    if ((item.type ?? "text") === "text") {
      const textItem = item as CardTemplateTextItem;
      const slotName = textItem.font && template.fonts?.[textItem.font] ? textItem.font : fontSlots[0];
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

  return `<?xml version="1.0" encoding="UTF-8"?>
<svg width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" fill="none" xmlns="http://www.w3.org/2000/svg">
  ${defs}
  <rect x="0" y="0" width="${width}" height="${height}" rx="${radius}" fill="${palette.paper}" />
  ${itemTexts}
</svg>`;
};

type TemplateSvgOptions = {
  showWireframes?: boolean;
  selectedNodeId?: string | null;
};

export const renderTemplateSvg = (template: CardTemplate, options: TemplateSvgOptions = {}): string => {
  const { showWireframes = true, selectedNodeId = null } = options;
  const { palette } = theme;
  const { width, height, radius } = template;
  const layout = computeLayout(template);

  const selectedColor = "#2563eb";

  const sectionRects = Array.from(layout.sections.entries())
    .map(([id, rect]) => {
      const isSelected = id === selectedNodeId;
      if (!showWireframes && !isSelected) return "";
      const section = findSection(template.root, id);
      const label = section ? section.name || section.id : id;
      const stroke = isSelected ? selectedColor : palette.muted;
      const strokeWidth = isSelected ? 2.5 : 1;
      return `
  <rect x="${rect.x}" y="${rect.y}" width="${rect.width}" height="${rect.height}" rx="12" fill="none" stroke="${stroke}" stroke-width="${strokeWidth}" stroke-dasharray="6 6" />
  <text x="${rect.x + 8}" y="${rect.y + 18}" font-size="12" fill="${stroke}" font-family="${DEBUG_FONT}">${escape(label)}</text>`;
    })
    .join("");

  const itemRects = Array.from(layout.items.entries())
    .map(([id, rect]) => {
      const isSelected = id === selectedNodeId;
      if (!showWireframes && !isSelected) return "";
      const item = findItem(template.root, id);
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
