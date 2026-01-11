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
  fieldId: string;
  fontSize: number;
  align: "left" | "center" | "right";
  font?: "title" | "body";
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
  fieldId: string;
  fit?: "cover" | "contain" | "fill";
  cornerRadius?: number;
};

// Union type for all item types
export type CardTemplateItem = 
  | CardTemplateTextItem 
  | CardTemplateFrameItem 
  | CardTemplateImageItem;

export type CardTemplateSection = {
  id: string;
  name: string;
  layout: "row" | "column" | "stack";
  sizePct: number;
  gap: number;
  children: CardTemplateSection[];
  items: CardTemplateItem[];
};

export type CardTemplate = {
  version: 2;
  id: string;
  name: string;
  width: number;
  height: number;
  radius: number;
  bleed: number;
  root: CardTemplateSection;
};
