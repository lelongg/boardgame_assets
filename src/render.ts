import { theme } from "./theme.js";
import type { AnchorPoint, CardData, CardTemplate, CardTemplateItem, CardTemplateSection } from "./types.js";

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
  item: CardTemplateItem;
  sectionId: string;
};

type RenderOptions = {
  debug?: boolean;
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

const layoutSections = (section: CardTemplateSection, rect: Rect, result: LayoutResult): void => {
  result.sections.set(section.id, rect);

  if (!section.children.length) return;

  if (section.layout === "stack") {
    section.children.forEach((child) => layoutSections(child, rect, result));
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

const collectItemPlacements = (section: CardTemplateSection, result: LayoutResult, list: ItemPlacement[]): void => {
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

const layoutItems = (template: CardTemplate, result: LayoutResult): void => {
  const placements: ItemPlacement[] = [];
  collectItemPlacements(template.root, result, placements);

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

export const computeLayout = (template: CardTemplate): LayoutResult => {
  const result = {
    sections: new Map(),
    items: new Map()
  };

  const rootRect = {
    x: template.bleed,
    y: template.bleed,
    width: template.width - template.bleed * 2,
    height: template.height - template.bleed * 2
  };

  layoutSections(template.root, rootRect, result);
  layoutItems(template, result);

  return result;
};

const collectItems = (section: CardTemplateSection, list: CardTemplateItem[]): void => {
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
  const fontSlots = Object.keys(template.fonts ?? {});
  const layout = computeLayout(template);
  const items: CardTemplateItem[] = [];
  collectItems(template.root, items);

  const renderedItems = items
    .map((item) => {
      const rect = layout.items.get(item.id);
      if (!rect) return "";

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
        const value = item.fieldId === "name" ? card.name : (item.fieldId ? card.fields[item.fieldId] : null) ?? (item as any).defaultValue ?? "";
        if (!value) return "";
        const cornerRadius = item.cornerRadius ?? 0;
        const fit = item.fit ?? "cover";
        
        // Create a clip path for the image - sanitize ID to only contain safe characters
        const clipId = `clip-${String(item.id).replace(/[^a-zA-Z0-9-_]/g, '')}`;
        const clipPath = cornerRadius > 0 
          ? `<clipPath id="${clipId}"><rect x="${rect.x}" y="${rect.y}" width="${rect.width}" height="${rect.height}" rx="${cornerRadius}" /></clipPath>`
          : "";
        
        // Map fit values to preserveAspectRatio
        const preserveAspectRatio = fit === "contain" ? "xMidYMid meet" : fit === "fill" ? "none" : "xMidYMid slice";
        const clipAttr = cornerRadius > 0 ? ` clip-path="url(#${clipId})"` : "";
        
        return `${clipPath}<image x="${rect.x}" y="${rect.y}" width="${rect.width}" height="${rect.height}" href="${escape(value)}" preserveAspectRatio="${preserveAspectRatio}"${clipAttr} />`;
      }
      
      // Render text item (default) - type guard
      if (item.type === "frame" || item.type === "image") return "";
      const value = item.fieldId === "name" ? card.name : (item.fieldId ? card.fields[item.fieldId] : null) ?? (item as any).defaultValue ?? "";
      if (!value) return "";
      const slotName = item.font && template.fonts?.[item.font] ? item.font : fontSlots[0];
      const fontSlot = template.fonts?.[slotName];
      const fontFamily = fontSlot ? `'${fontSlot.name}'` : "'sans-serif'";
      const fontSize = item.fontSize ?? 20;
      const align = item.align ?? "center";
      const vAlign = (item as any).verticalAlign ?? "middle";
      const color = escape(item.color ?? palette.ink);
      const textX = align === "left" ? rect.x : align === "right" ? rect.x + rect.width : rect.x + rect.width / 2;
      const textY = vAlign === "top" ? rect.y : vAlign === "bottom" ? rect.y + rect.height : rect.y + rect.height / 2;
      const baseAttrs = `text-anchor="${textAnchorFor(align)}" dominant-baseline="${baselineFor(vAlign)}" font-family="${fontFamily}" font-size="${fontSize}" fill="${color}"`;
      const styledLines = parseRichText(value);
      if (styledLines.length === 1) {
        return `<text x="${textX}" y="${textY}" ${baseAttrs}>${renderStyledLine(styledLines[0])}</text>`;
      }
      const tspans = styledLines.map((line, i) =>
        `<tspan x="${textX}" ${i === 0 ? `y="${textY}"` : `dy="${fontSize * 1.2}"`}>${renderStyledLine(line)}</tspan>`
      ).join('');
      return `<text ${baseAttrs}>${tspans}</text>`;
    })
    .join("");

  const debugRects = options.debug
    ? items
        .map((item) => {
          const rect = layout.items.get(item.id);
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
          const rect = layout.items.get(item.id);
          if (!rect) return "";
          const targetRect =
            item.attach.targetType === "item"
              ? layout.items.get(item.attach.targetId)
              : layout.sections.get(item.attach.targetId);
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
  ${debugLabel}
  ${debugRects}
  ${debugAnchors}
  ${renderedItems}
</svg>`;
};

export const renderTemplateSvg = (template: CardTemplate, options: {
  showSections?: boolean;
  showItems?: boolean;
  selectedNodeId?: string | null;
} = {}): string => {
  const { showSections = true, showItems = true, selectedNodeId = null } = options;
  const { palette } = theme;
  const { width, height, radius } = template;
  const fontSlots = Object.keys(template.fonts ?? {});
  const layout = computeLayout(template);

  // Render card content using empty card (defaults will show)
  const emptyCard: CardData = { id: '', name: 'Card Name', fields: {} };
  const items: CardTemplateItem[] = [];
  collectItems(template.root, items);

  const renderedContent = items.map((item) => {
    const rect = layout.items.get(item.id);
    if (!rect) return "";
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
      const value = (item.fieldId ? emptyCard.fields[item.fieldId] : null) ?? (item as any).defaultValue ?? "";
      if (!value) return "";
      const cr = item.cornerRadius ?? 0;
      const fit = item.fit ?? "cover";
      const clipId = `clip-${String(item.id).replace(/[^a-zA-Z0-9-_]/g, '')}`;
      const clipPath = cr > 0 ? `<clipPath id="${clipId}"><rect x="${rect.x}" y="${rect.y}" width="${rect.width}" height="${rect.height}" rx="${cr}" /></clipPath>` : "";
      const par = fit === "contain" ? "xMidYMid meet" : fit === "fill" ? "none" : "xMidYMid slice";
      const ca = cr > 0 ? ` clip-path="url(#${clipId})"` : "";
      return `${clipPath}<image x="${rect.x}" y="${rect.y}" width="${rect.width}" height="${rect.height}" href="${escape(value)}" preserveAspectRatio="${par}"${ca} />`;
    }
    if (item.type === "frame" || item.type === "image") return "";
    const value = item.fieldId === "name" ? emptyCard.name : (item.fieldId ? emptyCard.fields[item.fieldId] : null) ?? (item as any).defaultValue ?? "";
    if (!value) return "";
    const slotName = item.font && template.fonts?.[item.font] ? item.font : fontSlots[0];
    const fontSlot = template.fonts?.[slotName];
    const fontFamily = fontSlot ? `'${fontSlot.name}'` : "'sans-serif'";
    const fontSize = item.fontSize ?? 20;
    const align = item.align ?? "left";
    const vAlign = (item as any).verticalAlign ?? "top";
    const color = escape(item.color ?? palette.ink);
    const textX = align === "left" ? rect.x : align === "right" ? rect.x + rect.width : rect.x + rect.width / 2;
    const textY = vAlign === "top" ? rect.y : vAlign === "bottom" ? rect.y + rect.height : rect.y + rect.height / 2;
    const baseAttrs = `text-anchor="${textAnchorFor(align)}" dominant-baseline="${baselineFor(vAlign)}" font-family="${fontFamily}" font-size="${fontSize}" fill="${color}"`;
    const styledLines = parseRichText(value);
    if (styledLines.length === 1) {
      return `<text x="${textX}" y="${textY}" ${baseAttrs}>${renderStyledLine(styledLines[0])}</text>`;
    }
    const tspans = styledLines.map((line, i) =>
      `<tspan x="${textX}" ${i === 0 ? `y="${textY}"` : `dy="${fontSize * 1.2}"`}>${renderStyledLine(line)}</tspan>`
    ).join('');
    return `<text ${baseAttrs}>${tspans}</text>`;
  }).join("");

  // Section wireframes
  const sectionRects = showSections ? Array.from(layout.sections.entries())
    .map(([id, rect]) => {
      const isSelected = id === selectedNodeId;
      const strokeColor = isSelected ? SELECTION_COLOR : palette.muted;
      const strokeWidth = isSelected ? SELECTION_STROKE_WIDTH : "1";
      const fillColor = isSelected ? `rgba(198, 90, 50, ${SECTION_SELECTION_OPACITY})` : "none";
      return `<rect x="${rect.x}" y="${rect.y}" width="${rect.width}" height="${rect.height}" rx="12" fill="${fillColor}" stroke="${strokeColor}" stroke-width="${strokeWidth}" stroke-dasharray="6 6" />`;
    }).join("") : "";

  // Item wireframes
  const itemRects = showItems ? Array.from(layout.items.entries())
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
  ${contentWithoutClipPaths}
  ${sectionRects}
  ${itemRects}
</svg>`;
};

/** Fetch template fonts and embed them as base64 @font-face rules into the SVG.
 *  Blob SVGs displayed via <img> can't access the page's @font-face rules. */
export const embedFontsInSvg = async (svg: string, template: CardTemplate): Promise<string> => {
  const fonts = template.fonts;
  if (!fonts) return svg;
  const rules: string[] = [];
  for (const slot of Object.values(fonts)) {
    if (!slot.file) continue;
    try {
      const resp = await fetch(`/api/fonts/${slot.file}`);
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
  const styleBlock = `<defs><style>${rules.join('\n')}</style></defs>`;
  // Insert after the opening <svg ...> tag
  return svg.replace(/(<svg[^>]*>)/, `$1${styleBlock}`);
};

export const injectDebugLabel = (svg: string, debugAttach: unknown): string => {
  const label = `ATTACH ${JSON.stringify(debugAttach)}`.replaceAll("<", "&lt;").replaceAll(">", "&gt;");
  const insert = `<text x="24" y="70" font-size="12" fill="#d64545" font-family="Space Grotesk, sans-serif">${label}</text>`;
  return svg.replace("</svg>", `${insert}</svg>`);
};
