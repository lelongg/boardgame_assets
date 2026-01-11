/**
 * Safely parse a number from a value that might be empty, null, or undefined.
 * Returns the default value if parsing fails or the value is empty.
 */
const safeNumber = (value, defaultValue) => {
    if (value === null || value === undefined || value === "") {
        return defaultValue;
    }
    const parsed = Number(value);
    return isNaN(parsed) ? defaultValue : parsed;
};
/**
 * Safely parse a string from a value, returning default if empty.
 */
const safeString = (value, defaultValue) => {
    if (value === null || value === undefined || value === "") {
        return defaultValue;
    }
    return String(value);
};
/**
 * Safely parse an enum value, returning default if not in allowed values.
 */
const safeEnum = (value, allowedValues, defaultValue) => {
    const str = String(value ?? "");
    return allowedValues.includes(str) ? str : defaultValue;
};
/**
 * Normalize an anchor point to ensure x and y are valid values (0, 0.5, or 1).
 */
const normalizeAnchorPoint = (anchor) => {
    const obj = anchor && typeof anchor === "object" ? anchor : {};
    const normalizeCoord = (coord) => {
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
const normalizeItem = (item) => {
    const obj = item && typeof item === "object" ? item : {};
    // Base properties
    const id = safeString(obj.id, `item-${Date.now()}`);
    const name = safeString(obj.name, "New Item");
    const anchor = normalizeAnchorPoint(obj.anchor);
    const attach = obj.attach && typeof obj.attach === "object"
        ? obj.attach
        : {};
    const attachTargetType = safeEnum(attach.targetType, ["section", "item"], "section");
    const attachTargetId = safeString(attach.targetId, "root");
    const attachAnchor = normalizeAnchorPoint(attach.anchor);
    const widthPct = safeNumber(obj.widthPct, 50);
    const heightPct = safeNumber(obj.heightPct, 50);
    // Determine item type - only if explicitly set
    const hasType = obj.type !== undefined && obj.type !== null && obj.type !== "";
    const type = hasType ? safeEnum(obj.type, ["text", "frame", "image"], "text") : null;
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
        const frameItem = {
            ...base,
            type: "frame",
            strokeWidth: obj.strokeWidth !== undefined && obj.strokeWidth !== null ? safeNumber(obj.strokeWidth, 2) : undefined,
            strokeColor: obj.strokeColor !== undefined && obj.strokeColor !== null ? safeString(obj.strokeColor, "#000000") : undefined,
            fillColor: obj.fillColor !== undefined && obj.fillColor !== null ? safeString(obj.fillColor, "none") : undefined,
            cornerRadius: obj.cornerRadius !== undefined && obj.cornerRadius !== null ? safeNumber(obj.cornerRadius, 8) : undefined
        };
        return frameItem;
    }
    if (type === "image") {
        const imageItem = {
            ...base,
            type: "image",
            fieldId: safeString(obj.fieldId, "image"),
            fit: obj.fit !== undefined && obj.fit !== null ? safeEnum(obj.fit, ["cover", "contain", "fill"], "cover") : undefined,
            cornerRadius: obj.cornerRadius !== undefined && obj.cornerRadius !== null ? safeNumber(obj.cornerRadius, 0) : undefined
        };
        return imageItem;
    }
    // Default to text item (with optional type for legacy support)
    const textItem = {
        ...base,
        type: type === "text" ? "text" : undefined,
        fieldId: safeString(obj.fieldId, "name"),
        fontSize: safeNumber(obj.fontSize, 16),
        align: safeEnum(obj.align, ["left", "center", "right"], "left"),
        font: obj.font !== undefined && obj.font !== null ? safeEnum(obj.font, ["title", "body"], "body") : undefined,
        color: obj.color !== undefined && obj.color !== null ? safeString(obj.color, "#000000") : undefined
    };
    return textItem;
};
/**
 * Normalize a card template section recursively.
 */
const normalizeSection = (section) => {
    const obj = section && typeof section === "object" ? section : {};
    const id = safeString(obj.id, `section-${Date.now()}`);
    const name = safeString(obj.name, "New Section");
    const layout = safeEnum(obj.layout, ["row", "column", "stack"], "stack");
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
export const normalizeTemplate = (template) => {
    const obj = template && typeof template === "object" ? template : {};
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
export const normalizeCard = (card) => {
    const obj = card && typeof card === "object" ? card : {};
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
