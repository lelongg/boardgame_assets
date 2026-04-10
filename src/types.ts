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
  values?: string[];
};

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
  widthPct: number;
  heightPct: number;
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

// Union type for all item types
export type CardLayoutItem =
  | CardLayoutTextItem
  | CardLayoutFrameItem
  | CardLayoutImageItem
  | CardLayoutEmojiItem;

export type CardLayoutSection = {
  id: string;
  name: string;
  visible?: boolean;
  layout: "row" | "column" | "stack" | "grid";
  columns?: number;
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
  fonts: Record<string, FontSlot>;
  root: CardLayoutSection;
};

export type Collection = {
  id: string;
  name: string;
  layoutId: string;
};
