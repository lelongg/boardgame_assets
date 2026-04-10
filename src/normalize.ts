import type { AnchorPoint, CardData, CardLayout, CardLayoutItem, CardLayoutSection, CardLayoutFrameItem, CardLayoutImageItem, CardLayoutTextItem, CardLayoutEmojiItem, FontSlot } from "./types";

/**
 * Safely parse a number from a value that might be empty, null, or undefined.
 * Returns the default value if parsing fails or the value is empty.
 */
const safeNumber = (value: unknown, defaultValue: number): number => {
    if (value === null || value === undefined || value === "") {
        return defaultValue;
    }
    const parsed = Number(value);
    return isNaN(parsed) ? defaultValue : parsed;
};
/**
 * Safely parse a string from a value, returning default if empty.
 */
const safeString = (value: unknown, defaultValue: string): string => {
    if (value === null || value === undefined || value === "") {
        return defaultValue;
    }
    return String(value);
};
/**
 * Safely parse an enum value, returning default if not in allowed values.
 */
const safeEnum = <T extends string>(value: unknown, allowedValues: readonly T[], defaultValue: T): T => {
    const str = String(value ?? "");
    return (allowedValues as readonly string[]).includes(str) ? (str as T) : defaultValue;
};

const DEFAULT_FONTS: Record<string, FontSlot> = {
    title: { name: "Fraunces", file: "", source: "google" },
    body: { name: "Space Grotesk", file: "", source: "google" }
};

const normalizeFonts = (fonts: unknown): Record<string, FontSlot> => {
    if (!fonts || typeof fonts !== "object" || Array.isArray(fonts)) {
        return { ...DEFAULT_FONTS };
    }
    const result: Record<string, FontSlot> = {};
    for (const [key, value] of Object.entries(fonts as Record<string, unknown>)) {
        const slot = value && typeof value === "object" ? value as Record<string, unknown> : {};
        result[key] = {
            name: safeString(slot.name, "Sans Serif"),
            file: safeString(slot.file, ""),
            source: safeEnum(slot.source, ["upload", "google"] as const, "google")
        };
    }
    return Object.keys(result).length > 0 ? result : { ...DEFAULT_FONTS };
};

/**
 * Normalize an anchor point to ensure x and y are valid values (0, 0.5, or 1).
 */
const normalizeAnchorPoint = (anchor: unknown): AnchorPoint => {
    const obj = anchor && typeof anchor === "object" ? anchor as Record<string, unknown> : {};
    const normalizeCoord = (coord: unknown): 0 | 0.5 | 1 => {
        const num = safeNumber(coord, 0.5);
        if (num >= 0.75)
            return 1;
        if (num >= 0.25)
            return 0.5;
        return 0;
    };
    return {
        x: normalizeCoord(obj.x),
        y: normalizeCoord(obj.y)
    };
};
/**
 * Normalize a card layout item to ensure all fields have valid values.
 */
const normalizeItem = (item: unknown): CardLayoutItem => {
    const obj = item && typeof item === "object" ? item as Record<string, unknown> : {};
    // Base properties
    const id = safeString(obj.id, `item-${Date.now()}`);
    const name = safeString(obj.name, "New Item");
    const anchor = normalizeAnchorPoint(obj.anchor);
    const attach = obj.attach && typeof obj.attach === "object"
        ? obj.attach as Record<string, unknown>
        : {};
    const attachTargetType = safeEnum(attach.targetType, ["section", "item"] as const, "section");
    const attachTargetId = safeString(attach.targetId, "root");
    const attachAnchor = normalizeAnchorPoint(attach.anchor);
    const widthPct = safeNumber(obj.widthPct, 50);
    const heightPct = safeNumber(obj.heightPct, 50);
    // Determine item type - only if explicitly set
    const hasType = obj.type !== undefined && obj.type !== null && obj.type !== "";
    const type = hasType ? safeEnum(obj.type, ["text", "frame", "image", "emoji"] as const, "text" as const) : null;
    // Common base
    const base = {
        id,
        name,
        anchor,
        attach: {
            targetType: attachTargetType,
            targetId: attachTargetId,
            anchor: attachAnchor
        },
        widthPct,
        heightPct
    };
    if (type === "frame") {
        const frameItem: CardLayoutFrameItem = {
            ...base,
            type: "frame" as const,
            strokeWidth: safeNumber(obj.strokeWidth, 2),
            strokeColor: safeString(obj.strokeColor, "#000000"),
            fillColor: safeString(obj.fillColor, "none"),
            cornerRadius: obj.cornerRadius !== undefined && obj.cornerRadius !== null ? safeNumber(obj.cornerRadius, 8) : undefined
        };
        return frameItem;
    }
    if (type === "image") {
        const imageItem: CardLayoutImageItem = {
            ...base,
            type: "image" as const,
            fieldId: obj.fieldId !== undefined && obj.fieldId !== null && obj.fieldId !== '' ? safeString(obj.fieldId, "") : undefined,
            defaultValue: obj.defaultValue !== undefined && obj.defaultValue !== null && obj.defaultValue !== '' ? safeString(obj.defaultValue, "") : undefined,
            values: Array.isArray(obj.values) ? obj.values.filter((v: unknown) => typeof v === 'string') : undefined,
            fit: obj.fit !== undefined && obj.fit !== null ? safeEnum(obj.fit, ["cover", "contain", "fill"] as const, "cover" as const) : undefined,
            cornerRadius: obj.cornerRadius !== undefined && obj.cornerRadius !== null ? safeNumber(obj.cornerRadius, 0) : undefined
        };
        return imageItem;
    }
    if (type === "emoji") {
        const emojiItem: CardLayoutEmojiItem = {
            ...base,
            type: "emoji" as const,
            fieldId: obj.fieldId !== undefined && obj.fieldId !== null && obj.fieldId !== '' ? safeString(obj.fieldId, "") : undefined,
            emoji: typeof obj.emoji === 'string' ? obj.emoji : '⭐',
            values: Array.isArray(obj.values) ? obj.values.filter((v: unknown) => typeof v === 'string') : undefined,
            fontSize: safeNumber(obj.fontSize, 32),
        };
        return emojiItem;
    }
    // Default to text item (with optional type for legacy support)
    const textItem: CardLayoutTextItem = {
        ...base,
        type: type === "text" ? ("text" as const) : undefined,
        fieldId: obj.fieldId !== undefined && obj.fieldId !== null && obj.fieldId !== '' ? safeString(obj.fieldId, "") : undefined,
        defaultValue: obj.defaultValue !== undefined && obj.defaultValue !== null && obj.defaultValue !== '' ? safeString(obj.defaultValue, "") : undefined,
        values: Array.isArray(obj.values) ? obj.values.filter((v: unknown) => typeof v === 'string') : undefined,
        fontSize: safeNumber(obj.fontSize, 16),
        align: safeEnum(obj.align, ["left", "center", "right"] as const, "center" as const),
        verticalAlign: safeEnum(obj.verticalAlign, ["top", "middle", "bottom"] as const, "middle" as const),
        font: obj.font !== undefined && obj.font !== null && obj.font !== "" ? safeString(obj.font, "body") : undefined,
        color: safeString(obj.color, "#000000"),
    };
    return textItem;
};
/**
 * Normalize a card layout section recursively.
 */
const normalizeSection = (section: unknown): CardLayoutSection => {
    const obj = section && typeof section === "object" ? section as Record<string, unknown> : {};
    const id = safeString(obj.id, `section-${Date.now()}`);
    const name = safeString(obj.name, "New Section");
    const layout = safeEnum(obj.layout, ["row", "column", "stack", "grid"] as const, "stack" as const);
    const columns = typeof obj.columns === 'number' && obj.columns >= 1 ? Math.round(obj.columns) : 2;
    const sizePct = safeNumber(obj.sizePct, 100);
    const gap = safeNumber(obj.gap, 0);
    const children = Array.isArray(obj.children)
        ? obj.children.map(child => normalizeSection(child))
        : [];
    const items = Array.isArray(obj.items)
        ? obj.items.map(item => normalizeItem(item))
        : [];
    return {
        id,
        name,
        layout,
        columns,
        sizePct,
        gap,
        children,
        items
    };
};
/**
 * Normalize a card layout to ensure all fields have valid values.
 * This protects against empty strings, null, or undefined values in JSON files.
 */
// Convert old pixel values to mm (300 DPI)
const pxToMm = (px: number) => Math.round(px * 25.4 / 300 * 10) / 10;

export const normalizeLayout = (layout: unknown): CardLayout => {
    const obj = layout && typeof layout === "object" ? layout as Record<string, unknown> : {};
    let width = safeNumber(obj.width, 63.5);
    let height = safeNumber(obj.height, 88.9);
    let radius = safeNumber(obj.radius, 2.5);
    let bleed = safeNumber(obj.bleed, 1.5);
    // Migrate old pixel-based layouts (width > 300 is clearly pixels, not mm)
    if (width > 300) {
        width = pxToMm(width);
        height = pxToMm(height);
        radius = pxToMm(radius);
        bleed = pxToMm(bleed);
    }
    return {
        version: 2,
        id: safeString(obj.id, "default"),
        name: safeString(obj.name, "Default"),
        width,
        height,
        radius,
        bleed,
        fonts: normalizeFonts(obj.fonts),
        root: normalizeSection(obj.root)
    };
};
/**
 * Normalize card data to ensure all fields have valid values.
 * This protects against empty strings, null, or undefined values in JSON files.
 */
export const normalizeCard = (card: unknown): CardData => {
    const obj = card && typeof card === "object" ? card as Record<string, unknown> : {};
    const fields = obj.fields && typeof obj.fields === "object" && obj.fields !== null
        ? obj.fields
        : {};
    const name = safeString(obj.name, "New Card");
    const id = safeString(obj.id, name.toLowerCase().replace(/[^a-z0-9]+/g, "-"));
    return {
        id,
        name,
        fields: Object.fromEntries(Object.entries(fields).map(([key, value]) => [key, safeString(value, "")]))
    };
};
