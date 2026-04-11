import type { AnchorPoint, CardData, CardLayout, CardLayoutItem, CardLayoutSection, CardLayoutFrameItem, CardLayoutImageItem, CardLayoutTextItem, CardLayoutEmojiItem, PropertyBinding } from "./types";

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
/**
 * Normalize bindings map, migrating legacy fieldId+values if present.
 */
const normalizeBindings = (obj: Record<string, unknown>): Record<string, PropertyBinding> | undefined => {
    const raw = obj.bindings && typeof obj.bindings === "object" && !Array.isArray(obj.bindings)
        ? obj.bindings as Record<string, unknown>
        : {};
    const result: Record<string, PropertyBinding> = {};
    for (const [key, val] of Object.entries(raw)) {
        if (val && typeof val === "object" && !Array.isArray(val)) {
            const b = val as Record<string, unknown>;
            const field = safeString(b.field, "");
            if (field) result[key] = { field };
        }
    }
    return Object.keys(result).length > 0 ? result : undefined;
};

const normalizeItem = (item: unknown, cardWidth: number, cardHeight: number): CardLayoutItem => {
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
    // Migration: convert legacy widthPct/heightPct (% of card) to mm
    const widthMm = obj.widthMm != null ? safeNumber(obj.widthMm, 30)
        : obj.widthPct != null ? Math.round(cardWidth * safeNumber(obj.widthPct, 50) / 100 * 10) / 10
        : 30;
    const heightMm = obj.heightMm != null ? safeNumber(obj.heightMm, 20)
        : obj.heightPct != null ? Math.round(cardHeight * safeNumber(obj.heightPct, 50) / 100 * 10) / 10
        : 20;
    // Determine item type - only if explicitly set
    const hasType = obj.type !== undefined && obj.type !== null && obj.type !== "";
    const type = hasType ? safeEnum(obj.type, ["text", "frame", "image", "emoji", "copy"] as const, "text" as const) : null;
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
        widthMm,
        heightMm,
        offsetX: obj.offsetX !== undefined && obj.offsetX !== null ? safeNumber(obj.offsetX, 0) : undefined,
        offsetY: obj.offsetY !== undefined && obj.offsetY !== null ? safeNumber(obj.offsetY, 0) : undefined,
        rotation: obj.rotation !== undefined && obj.rotation !== null ? safeNumber(obj.rotation, 0) : undefined,
    };
    if (type === "frame") {
        const frameItem: CardLayoutFrameItem = {
            ...base,
            bindings: normalizeBindings(obj),
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
            bindings: normalizeBindings(obj),
            type: "image" as const,
            defaultValue: obj.defaultValue !== undefined && obj.defaultValue !== null && obj.defaultValue !== '' ? safeString(obj.defaultValue, "") : undefined,
            fit: obj.fit !== undefined && obj.fit !== null ? safeEnum(obj.fit, ["cover", "contain", "fill"] as const, "cover" as const) : undefined,
            cornerRadius: obj.cornerRadius !== undefined && obj.cornerRadius !== null ? safeNumber(obj.cornerRadius, 0) : undefined
        };
        return imageItem;
    }
    if (type === "emoji") {
        const emojiItem: CardLayoutEmojiItem = {
            ...base,
            bindings: normalizeBindings(obj),
            type: "emoji" as const,
            emoji: typeof obj.emoji === 'string' ? obj.emoji : '⭐',
            fontSize: safeNumber(obj.fontSize, 32),
        };
        return emojiItem;
    }
    if (type === "copy") {
        return {
            ...base,
            bindings: normalizeBindings(obj),
            type: "copy" as const,
            copyTargetId: typeof obj.copyTargetId === 'string' ? obj.copyTargetId : undefined,
            scale: obj.scale !== undefined && obj.scale !== null ? safeNumber(obj.scale, 1) : undefined,
        };
    }
    // Default to text item (with optional type for legacy support)
    const textItem: CardLayoutTextItem = {
        ...base,
        bindings: normalizeBindings(obj),
        type: type === "text" ? ("text" as const) : undefined,
        defaultValue: obj.defaultValue !== undefined && obj.defaultValue !== null && obj.defaultValue !== '' ? safeString(obj.defaultValue, "") : undefined,
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
const normalizeSection = (section: unknown, cardWidth: number, cardHeight: number): CardLayoutSection => {
    const obj = section && typeof section === "object" ? section as Record<string, unknown> : {};
    const id = safeString(obj.id, `section-${Date.now()}`);
    const name = safeString(obj.name, "New Section");
    const layout = safeEnum(obj.layout, ["row", "column", "stack", "grid"] as const, "stack" as const);
    const columns = typeof obj.columns === 'number' && obj.columns >= 1 ? Math.round(obj.columns) : 2;
    const repeatCount = obj.repeatCount !== undefined && obj.repeatCount !== null ? safeNumber(obj.repeatCount, 1) : undefined;
    const repeatOffsetX = obj.repeatOffsetX !== undefined && obj.repeatOffsetX !== null ? safeNumber(obj.repeatOffsetX, 0) : undefined;
    const repeatOffsetY = obj.repeatOffsetY !== undefined && obj.repeatOffsetY !== null ? safeNumber(obj.repeatOffsetY, 0) : undefined;
    const sizePct = safeNumber(obj.sizePct, 100);
    const gap = safeNumber(obj.gap, 0);
    const children = Array.isArray(obj.children)
        ? obj.children.map(child => normalizeSection(child, cardWidth, cardHeight))
        : [];
    const items = Array.isArray(obj.items)
        ? obj.items.map(item => normalizeItem(item, cardWidth, cardHeight))
        : [];
    return {
        id,
        name,
        bindings: normalizeBindings(obj),
        layout,
        columns,
        repeatCount,
        repeatOffsetX,
        repeatOffsetY,
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
    const root = normalizeSection(obj.root, width, height);
    // Parse bindingMeta
    const bindingMeta: Record<string, { default?: string; values?: string[] }> = {};
    const existingMeta = obj.bindingMeta && typeof obj.bindingMeta === "object" && !Array.isArray(obj.bindingMeta)
        ? obj.bindingMeta as Record<string, unknown> : {};
    for (const [k, v] of Object.entries(existingMeta)) {
        if (v && typeof v === "object" && !Array.isArray(v)) {
            const m = v as Record<string, unknown>;
            const entry: { default?: string; values?: string[] } = {};
            if (typeof m.default === 'string') entry.default = m.default;
            if (Array.isArray(m.values)) entry.values = m.values.filter((s: unknown) => typeof s === 'string');
            if (entry.default || entry.values?.length) bindingMeta[k] = entry;
        }
    }
    return {
        version: 2,
        id: safeString(obj.id, "default"),
        name: safeString(obj.name, "Default"),
        width,
        height,
        radius,
        bleed,
        bindingMeta: Object.keys(bindingMeta).length > 0 ? bindingMeta : undefined,
        root,
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
