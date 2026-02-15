export const defaultTemplate = () => ({
  version: 2,
  id: "default",
  name: "Default",
  width: 750,
  height: 1050,
  radius: 28,
  bleed: 18,
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
            fieldId: "name",
            anchor: { x: 0, y: 0.5 },
            attach: {
              targetType: "section",
              targetId: "header",
              anchor: { x: 0, y: 0.5 }
            },
            widthPct: 90,
            heightPct: 60,
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
            widthPct: 90,
            heightPct: 90,
            strokeWidth: 3,
            cornerRadius: 12
          },
          {
            type: "image",
            id: "artwork",
            name: "Artwork",
            fieldId: "image",
            anchor: { x: 0.5, y: 0 },
            attach: {
              targetType: "section",
              targetId: "body",
              anchor: { x: 0.5, y: 0.1 }
            },
            widthPct: 70,
            heightPct: 50,
            fit: "cover",
            cornerRadius: 8
          },
          {
            type: "text",
            id: "description",
            name: "Description",
            fieldId: "description",
            anchor: { x: 0.5, y: 0 },
            attach: {
              targetType: "item",
              targetId: "artwork",
              anchor: { x: 0.5, y: 1 }
            },
            widthPct: 80,
            heightPct: 30,
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
