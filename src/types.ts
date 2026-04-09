export type CardData = {
  id: string;
  name: string;
  fields: Record<string, string>;
};

export type AnchorPoint = {
  x: 0 | 0.5 | 1;
  y: 0 | 0.5 | 1;
};

// Base properties shared by all item types
type CardTemplateItemBase = {
  id: string;
  name: string;
  anchor: AnchorPoint;
  attach: {
    targetType: "section" | "item";
    targetId: string;
    anchor: AnchorPoint;
  };
  widthPct: number;
  heightPct: number;
};

// Text item - displays text from a field
export type CardTemplateTextItem = CardTemplateItemBase & {
  type?: "text";  // Optional to support legacy items
  fieldId?: string;
  defaultValue?: string;
  fontSize: number;
  align: "left" | "center" | "right";
  verticalAlign?: "top" | "middle" | "bottom";
  font?: string;
  color?: string;
};

// Frame item - displays a decorative frame/border
export type CardTemplateFrameItem = CardTemplateItemBase & {
  type: "frame";
  strokeWidth?: number;
  strokeColor?: string;
  fillColor?: string;
  cornerRadius?: number;
};

// Image item - displays an image from a URL field
export type CardTemplateImageItem = CardTemplateItemBase & {
  type: "image";
  fieldId?: string;
  defaultValue?: string;
  fit?: "cover" | "contain" | "fill";
  cornerRadius?: number;
};

// Emoji item - displays an emoji, optionally bound to a card field
export type CardTemplateEmojiItem = CardTemplateItemBase & {
  type: "emoji";
  fieldId?: string;
  emoji?: string;
  fontSize: number;
};

// Union type for all item types
export type CardTemplateItem =
  | CardTemplateTextItem
  | CardTemplateFrameItem
  | CardTemplateImageItem
  | CardTemplateEmojiItem;

export type CardTemplateSection = {
  id: string;
  name: string;
  layout: "row" | "column" | "stack" | "grid";
  columns?: number;
  sizePct: number;
  gap: number;
  children: CardTemplateSection[];
  items: CardTemplateItem[];
};

export type FontSlot = {
  name: string;
  file: string;
  source: "upload" | "google";
};

export type CardTemplate = {
  version: 2;
  id: string;
  name: string;
  width: number;
  height: number;
  radius: number;
  bleed: number;
  fonts: Record<string, FontSlot>;
  root: CardTemplateSection;
};

export type Collection = {
  id: string;
  name: string;
  templateId: string;
};
