import type { AnchorPoint, CardData, CardTemplate, CardTemplateItem, CardTemplateSection } from "../types.js";
import { theme } from "../theme.js";

const escape = (value: string) =>
  value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");

type Rect = { x: number; y: number; width: number; height: number };

type LayoutResult = {
  sections: Map<string, Rect>;
  items: Map<string, Rect>;
};

type RenderOptions = {
  debug?: boolean;
};

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

const textAnchorFor = (align: "left" | "center" | "right") => {
  if (align === "center") return "middle";
  if (align === "right") return "end";
  return "start";
};

const baselineFor = (anchor: AnchorPoint) => {
  if (anchor.y === 0) return "hanging";
  if (anchor.y === 0.5) return "middle";
  return "baseline";
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
  const { palette, typography } = theme;
  const { width, height, radius } = template;
  const layout = computeLayout(template);
  const items: CardTemplateItem[] = [];
  collectItems(template.root, items);

  const renderItem = (item: CardTemplateItem, rect: Rect | undefined): string => {
    if (!rect) return "";
    
    // Handle different item types (default to text for backward compatibility)
    const itemType = item.type ?? "text";
    
    if (itemType === "text") {
      const textItem = item as CardTemplateTextItem;
      const value = textItem.fieldId === "name" ? card.name : card.fields[textItem.fieldId] ?? "";
      if (!value) return "";
      const anchor = anchorPosition(rect, textItem.anchor);
      const fontFamily = textItem.font === "title" ? typography.title : typography.body;
      return `<text x="${anchor.x}" y="${anchor.y}" text-anchor="${textAnchorFor(textItem.align)}" dominant-baseline="${baselineFor(textItem.anchor)}" font-family="${fontFamily}" font-size="${textItem.fontSize}" fill="${textItem.color ?? palette.ink}">${escape(value)}</text>`;
    }
    
    if (itemType === "frame") {
      const frameItem = item as CardTemplateFrameItem;
      const strokeWidth = frameItem.strokeWidth ?? 2;
      const strokeColor = frameItem.strokeColor ?? palette.ink;
      const fillColor = frameItem.fillColor ?? "none";
      const cornerRadius = frameItem.cornerRadius ?? 8;
      return `<rect x="${rect.x}" y="${rect.y}" width="${rect.width}" height="${rect.height}" rx="${cornerRadius}" fill="${fillColor}" stroke="${strokeColor}" stroke-width="${strokeWidth}" />`;
    }
    
    if (itemType === "image") {
      const imageItem = item as CardTemplateImageItem;
      const imageUrl = card.fields[imageItem.fieldId] ?? "";
      if (!imageUrl) return "";
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
        return `
  <defs>
    <clipPath id="${clipId}">
      <rect x="${rect.x}" y="${rect.y}" width="${rect.width}" height="${rect.height}" rx="${cornerRadius}" />
    </clipPath>
  </defs>
  <image ${imageProps} href="${escape(imageUrl)}" clip-path="url(#${clipId})" />`;
      }
      
      return `<image ${imageProps} href="${escape(imageUrl)}" />`;
    }
    
    return "";
  };

  const itemTexts = items
    .map((item) => {
      const rect = layout.items.get(item.id);
      return renderItem(item, rect);
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
            : `<text x="${targetPoint.x + 8}" y="${targetPoint.y + 4}" font-size="12" fill="#d64545" font-family="${theme.typography.body}">missing ${escape(item.attach.targetType)}:${escape(item.attach.targetId)}</text>`;
          return `
  <circle cx="${targetPoint.x}" cy="${targetPoint.y}" r="8" fill="none" stroke="#d64545" stroke-width="3" />
  <circle cx="${itemPoint.x}" cy="${itemPoint.y}" r="6" fill="#2f6f4e" stroke="#ffffff" stroke-width="1" />
  ${missingLabel}`;
        })
        .join("")
    : "";

  const debugLabel = options.debug
    ? `<text x="24" y="36" font-size="20" fill="#d64545" font-family="${theme.typography.body}">DEBUG RENDER</text>`
    : "";

  return `<?xml version="1.0" encoding="UTF-8"?>
<svg width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" fill="none" xmlns="http://www.w3.org/2000/svg">
  <rect x="0" y="0" width="${width}" height="${height}" rx="${radius}" fill="${palette.paper}" />
  ${debugLabel}
  ${debugRects}
  ${debugAnchors}
  ${itemTexts}
</svg>`;
};

export const renderTemplateSvg = (template: CardTemplate): string => {
  const { palette } = theme;
  const { width, height, radius } = template;
  const layout = computeLayout(template);

  const sectionRects = Array.from(layout.sections.entries())
    .map(([id, rect]) => {
      const section = findSection(template.root, id);
      const label = section ? section.name || section.id : id;
      const anchors = anchorPoints
        .map((anchor) => {
          const point = anchorPosition(rect, anchor);
          return `<circle cx="${point.x}" cy="${point.y}" r="3" fill="${palette.muted}" />`;
        })
        .join("");

      return `
  <rect x="${rect.x}" y="${rect.y}" width="${rect.width}" height="${rect.height}" rx="12" fill="none" stroke="${palette.muted}" stroke-width="1" stroke-dasharray="6 6" />
  <text x="${rect.x + 8}" y="${rect.y + 18}" font-size="12" fill="${palette.muted}" font-family="${theme.typography.body}">${escape(label)}</text>
  ${anchors}`;
    })
    .join("");

  const itemRects = Array.from(layout.items.entries())
    .map(([id, rect]) => {
      const item = findItem(template.root, id);
      const anchors = anchorPoints
        .map((anchor) => {
          const point = anchorPosition(rect, anchor);
          return `<circle cx="${point.x}" cy="${point.y}" r="2.5" fill="${palette.ink}" />`;
        })
        .join("");

      return `
  <rect x="${rect.x}" y="${rect.y}" width="${rect.width}" height="${rect.height}" rx="10" fill="none" stroke="${palette.ink}" stroke-width="1" />
  ${item ? `<text x="${rect.x + 6}" y="${rect.y + 16}" font-size="11" fill="${palette.ink}" font-family="${theme.typography.body}">${escape(item.name || item.id)}</text>` : ""}
  ${anchors}`;
    })
    .join("");

  return `<?xml version="1.0" encoding="UTF-8"?>
<svg width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" fill="none" xmlns="http://www.w3.org/2000/svg">
  <rect x="0" y="0" width="${width}" height="${height}" rx="${radius}" fill="${palette.paper}" />
  ${sectionRects}
  ${itemRects}
</svg>`;
};
