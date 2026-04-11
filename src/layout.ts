import type { CardLayout } from "./types";

export const defaultLayout = (): CardLayout => ({
  version: 2,
  id: "default",
  name: "Default",
  width: 63.5,
  height: 88.9,
  radius: 2.5,
  bleed: 1.5,
  root: {
    id: "root",
    name: "Root",
    layout: "column",
    sizePct: 100,
    gap: 18,
    children: [
      {
        id: "header",
        name: "Header",
        layout: "stack",
        sizePct: 20,
        gap: 0,
        children: [],
        items: [
          {
            type: "text",
            id: "title",
            name: "Title",
            bindings: { defaultValue: { field: "name" } },
            anchor: { x: 0, y: 0.5 },
            attach: {
              targetType: "section",
              targetId: "header",
              anchor: { x: 0, y: 0.5 }
            },
            widthMm: 57,
            heightMm: 8.5,
            fontSize: 44,
            align: "left",
            font: "title"
          }
        ]
      },
      {
        id: "body",
        name: "Body",
        layout: "stack",
        sizePct: 80,
        gap: 0,
        children: [],
        items: [
          {
            type: "frame",
            id: "border",
            name: "Border",
            anchor: { x: 0.5, y: 0.5 },
            attach: {
              targetType: "section",
              targetId: "body",
              anchor: { x: 0.5, y: 0.5 }
            },
            widthMm: 57,
            heightMm: 51,
            strokeWidth: 3,
            cornerRadius: 12
          },
          {
            type: "image",
            id: "artwork",
            name: "Artwork",
            bindings: { defaultValue: { field: "image" } },
            anchor: { x: 0.5, y: 0 },
            attach: {
              targetType: "section",
              targetId: "body",
              anchor: { x: 0.5, y: 0 }
            },
            widthMm: 44.5,
            heightMm: 28.5,
            fit: "cover",
            cornerRadius: 8
          },
          {
            type: "text",
            id: "description",
            name: "Description",
            bindings: { defaultValue: { field: "description" } },
            anchor: { x: 0.5, y: 0 },
            attach: {
              targetType: "item",
              targetId: "artwork",
              anchor: { x: 0.5, y: 1 }
            },
            widthMm: 51,
            heightMm: 17,
            fontSize: 18,
            align: "center",
            font: "body"
          }
        ]
      }
    ],
    items: []
  }
});
