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
        items: []
      }
    ],
    items: []
  }
});
