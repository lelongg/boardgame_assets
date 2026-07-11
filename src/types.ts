export type CardData = {
  id: string;
  name: string;
  fields: Record<string, string>;
};

export type AnchorPoint = {
  x: 0 | 0.5 | 1;
  y: 0 | 0.5 | 1;
};

export type PropertyBinding = {
  field: string;
};

// Layer blend modes (CSS mix-blend-mode values), applied to the item's group.
export const BLEND_MODES = [
  "normal",
  "multiply",
  "screen",
  "overlay",
  "darken",
  "lighten",
  "color-dodge",
  "color-burn",
  "hard-light",
  "soft-light",
  "difference",
  "exclusion",
  "hue",
  "saturation",
  "color",
  "luminosity",
] as const;
export type BlendMode = (typeof BLEND_MODES)[number];

// Base properties shared by all item types
type CardLayoutItemBase = {
  id: string;
  name: string;
  visible?: boolean;
  anchor: AnchorPoint;
  attach: {
    targetType: "section" | "item";
    targetId: string;
    anchor: AnchorPoint;
  };
  widthMm: number;
  heightMm: number;
  offsetX?: number;
  offsetY?: number;
  rotation?: number;
  // Mirror the item horizontally / vertically around its center
  flipH?: boolean;
  flipV?: boolean;
  // Opacity in percent (0-100); unset means fully opaque
  opacity?: number;
  blendMode?: BlendMode;
  // Image URL used as an alpha mask, stretched over the item's rect
  maskUrl?: string;
  bindings?: Record<string, PropertyBinding>;
};

// Text item - displays text from a field
export type CardLayoutTextItem = CardLayoutItemBase & {
  type?: "text";  // Optional to support legacy items
  defaultValue?: string;
  fontSize: number;
  align: "left" | "center" | "right";
  verticalAlign?: "top" | "middle" | "bottom";
  font?: string;
  color?: string;
};

// Frame item - displays a decorative frame/border
export type CardLayoutFrameItem = CardLayoutItemBase & {
  type: "frame";
  strokeWidth?: number;
  strokeColor?: string;
  fillColor?: string;
  cornerRadius?: number;
};

// Image item - displays an image from a URL field
export type CardLayoutImageItem = CardLayoutItemBase & {
  type: "image";
  defaultValue?: string;
  fit?: "cover" | "contain" | "fill";
  cornerRadius?: number;
};

// Emoji item - displays an emoji, optionally bound to a card field
export type CardLayoutEmojiItem = CardLayoutItemBase & {
  type: "emoji";
  emoji?: string;
  fontSize: number;
};

// Clone item - renders the same content as another item or section's items
// (formerly "copy"; the normalizer migrates legacy data)
export type CardLayoutCloneItem = CardLayoutItemBase & {
  type: "clone";
  cloneTargetId?: string;
  scale?: number;
};

// Numbers item - displays text from a field using tabular figures (CSS tabular-nums)
// for properly aligned digits. Same shape as a text item.
export type CardLayoutNumbersItem = CardLayoutItemBase & {
  type: "numbers";
  defaultValue?: string;
  fontSize: number;
  align: "left" | "center" | "right";
  verticalAlign?: "top" | "middle" | "bottom";
  font?: string;
  color?: string;
};

// Union type for all item types
export type CardLayoutItem =
  | CardLayoutTextItem
  | CardLayoutFrameItem
  | CardLayoutImageItem
  | CardLayoutEmojiItem
  | CardLayoutCloneItem
  | CardLayoutNumbersItem;

export type CardLayoutSection = {
  id: string;
  name: string;
  visible?: boolean;
  bindings?: Record<string, PropertyBinding>;
  layout: "row" | "column" | "stack" | "grid";
  columns?: number;
  repeatCount?: number;
  repeatOffsetX?: number;
  repeatOffsetY?: number;
  sizePct: number;
  gap: number;
  children: CardLayoutSection[];
  items: CardLayoutItem[];
};

export type FontSlot = {
  name: string;
  file: string;
  source: "upload" | "google";
};

export type CardLayout = {
  version: 2;
  id: string;
  name: string;
  width: number;
  height: number;
  radius: number;
  bleed: number;
  bindingMeta?: Record<string, { default?: string; values?: string[] }>;
  root: CardLayoutSection;
};

export type Collection = {
  id: string;
  name: string;
  layoutId: string;
  // Card back layout, rendered like the front. No back when unset.
  backLayoutId?: string;
};
