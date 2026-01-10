export type CardData = {
  id: string;
  name: string;
  fields: Record<string, string>;
};

export type AnchorPoint = {
  x: 0 | 0.5 | 1;
  y: 0 | 0.5 | 1;
};

export type CardTemplateItem = {
  id: string;
  name: string;
  fieldId: string;
  anchor: AnchorPoint;
  attach: {
    targetType: "section" | "item";
    targetId: string;
    anchor: AnchorPoint;
  };
  widthPct: number;
  heightPct: number;
  fontSize: number;
  align: "left" | "center" | "right";
  font?: "title" | "body";
  color?: string;
};

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
