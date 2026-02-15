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
import type { AnchorPoint, CardData, CardTemplate, CardTemplateItem, CardTemplateSection, CardTemplateFrameItem, CardTemplateImageItem, CardTemplateTextItem } from "./types";

/**
 * Normalize an anchor point to ensure x and y are valid values (0, 0.5, or 1).
 */
const normalizeAnchorPoint = (anchor: unknown): AnchorPoint => {
    const obj = anchor && typeof anchor === "object" ? anchor as Record<string, unknown> : {};
    const normalizeCoord = (coord: unknown): 0 | 0.5 | 1 => {
        const num = safeNumber(coord, 0);
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
 * Normalize a card template item to ensure all fields have valid values.
 */
const normalizeItem = (item: unknown): CardTemplateItem => {
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
    const type = hasType ? safeEnum(obj.type, ["text", "frame", "image"] as const, "text" as const) : null;
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
        const frameItem: CardTemplateFrameItem = {
            ...base,
            type: "frame" as const,
            strokeWidth: obj.strokeWidth !== undefined && obj.strokeWidth !== null ? safeNumber(obj.strokeWidth, 2) : undefined,
            strokeColor: obj.strokeColor !== undefined && obj.strokeColor !== null ? safeString(obj.strokeColor, "#000000") : undefined,
            fillColor: obj.fillColor !== undefined && obj.fillColor !== null ? safeString(obj.fillColor, "none") : undefined,
            cornerRadius: obj.cornerRadius !== undefined && obj.cornerRadius !== null ? safeNumber(obj.cornerRadius, 8) : undefined
        };
        return frameItem;
    }
    if (type === "image") {
        const imageItem: CardTemplateImageItem = {
            ...base,
            type: "image" as const,
            fieldId: safeString(obj.fieldId, "image"),
            fit: obj.fit !== undefined && obj.fit !== null ? safeEnum(obj.fit, ["cover", "contain", "fill"] as const, "cover" as const) : undefined,
            cornerRadius: obj.cornerRadius !== undefined && obj.cornerRadius !== null ? safeNumber(obj.cornerRadius, 0) : undefined
        };
        return imageItem;
    }
    // Default to text item (with optional type for legacy support)
    const textItem: CardTemplateTextItem = {
        ...base,
        type: type === "text" ? ("text" as const) : undefined,
        fieldId: safeString(obj.fieldId, "name"),
        fontSize: safeNumber(obj.fontSize, 16),
        align: safeEnum(obj.align, ["left", "center", "right"] as const, "left" as const),
        font: obj.font !== undefined && obj.font !== null ? safeEnum(obj.font, ["title", "body"] as const, "body" as const) : undefined,
        color: obj.color !== undefined && obj.color !== null ? safeString(obj.color, "#000000") : undefined
    };
    return textItem;
};
/**
 * Normalize a card template section recursively.
 */
const normalizeSection = (section: unknown): CardTemplateSection => {
    const obj = section && typeof section === "object" ? section as Record<string, unknown> : {};
    const id = safeString(obj.id, `section-${Date.now()}`);
    const name = safeString(obj.name, "New Section");
    const layout = safeEnum(obj.layout, ["row", "column", "stack"] as const, "stack" as const);
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
        sizePct,
        gap,
        children,
        items
    };
};
/**
 * Normalize a card template to ensure all fields have valid values.
 * This protects against empty strings, null, or undefined values in JSON files.
 */
export const normalizeTemplate = (template: unknown): CardTemplate => {
    const obj = template && typeof template === "object" ? template as Record<string, unknown> : {};
    return {
        version: 2,
        id: safeString(obj.id, "default"),
        name: safeString(obj.name, "Default"),
        width: safeNumber(obj.width, 750),
        height: safeNumber(obj.height, 1050),
        radius: safeNumber(obj.radius, 28),
        bleed: safeNumber(obj.bleed, 18),
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
