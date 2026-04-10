import type { CardData, CardLayout } from "../types";

const SUITS = [
  { symbol: "♠️", name: "Spades", color: "#1a1a1a" },
  { symbol: "♥️", name: "Hearts", color: "#cc0000" },
  { symbol: "♦️", name: "Diamonds", color: "#cc0000" },
  { symbol: "♣️", name: "Clubs", color: "#1a1a1a" },
] as const;

const RANKS = [
  { symbol: "A", name: "Ace", order: 1 },
  { symbol: "2", name: "2", order: 2 },
  { symbol: "3", name: "3", order: 3 },
  { symbol: "4", name: "4", order: 4 },
  { symbol: "5", name: "5", order: 5 },
  { symbol: "6", name: "6", order: 6 },
  { symbol: "7", name: "7", order: 7 },
  { symbol: "8", name: "8", order: 8 },
  { symbol: "9", name: "9", order: 9 },
  { symbol: "10", name: "10", order: 10 },
  { symbol: "J", name: "Jack", order: 11 },
  { symbol: "Q", name: "Queen", order: 12 },
  { symbol: "K", name: "King", order: 13 },
] as const;


export const classicDeckCards = (): CardData[] => {
  const cards: CardData[] = [];

  for (const suit of SUITS) {
    for (const rank of RANKS) {
      cards.push({
        id: `${rank.symbol.toLowerCase()}-of-${suit.name.toLowerCase()}`,
        name: `${rank.name} of ${suit.name}`,
        fields: {
          "defaultValue:rank": rank.symbol,
          "emoji:suit": suit.symbol,
          "color:color": suit.color,
        },
      });
    }
  }

  cards.push(
    {
      id: "red-joker",
      name: "Red Joker",
      fields: { "defaultValue:rank": "★", "emoji:suit": "★", "color:color": "#cc0000" },
    },
    {
      id: "black-joker",
      name: "Black Joker",
      fields: { "defaultValue:rank": "★", "emoji:suit": "★", "color:color": "#1a1a1a" },
    },
  );

  return cards;
};

export const classicDeckLayout = (): CardLayout => ({
  version: 2,
  id: "default",
  name: "Playing Card",
  width: 63.5,
  height: 88.9,
  radius: 2.5,
  bleed: 1.5,
  fonts: {
    title: { name: "Fraunces", file: "", source: "google" as const },
    body: { name: "Space Grotesk", file: "", source: "google" as const },
  },
  root: {
    id: "root",
    name: "Root",
    layout: "column",
    sizePct: 100,
    gap: 0,
    children: [
      {
        id: "top",
        name: "Top",
        layout: "stack",
        sizePct: 20,
        gap: 0,
        children: [],
        items: [
          {
            type: "text",
            id: "rank-top",
            name: "Rank",
            bindings: { defaultValue: { field: "rank", values: ["A", "2", "3", "4", "5", "6", "7", "8", "9", "10", "J", "Q", "K", "★"] } },
            anchor: { x: 0, y: 0 },
            attach: { targetType: "section", targetId: "top", anchor: { x: 0, y: 0 } },
            widthPct: 28,
            heightPct: 65,
            fontSize: 52,
            align: "center",
            verticalAlign: "middle",
            font: "title",
          },
          {
            type: "emoji",
            id: "suit-top",
            name: "Suit",
            bindings: { emoji: { field: "suit", values: ["♠️", "♥️", "♦️", "♣️", "★"] } },
            anchor: { x: 0.5, y: 0 },
            attach: { targetType: "item", targetId: "rank-top", anchor: { x: 0.5, y: 1 } },
            widthPct: 28,
            heightPct: 35,
            fontSize: 24,
          },
        ],
      },
      {
        id: "center",
        name: "Center",
        layout: "stack",
        sizePct: 60,
        gap: 0,
        children: [],
        items: [
          {
            type: "emoji",
            id: "suit-center",
            name: "Suit Large",
            bindings: { emoji: { field: "suit", values: ["♠️", "♥️", "♦️", "♣️", "★"] } },
            anchor: { x: 0.5, y: 0.5 },
            attach: { targetType: "section", targetId: "center", anchor: { x: 0.5, y: 0.5 } },
            widthPct: 50,
            heightPct: 50,
            fontSize: 120,
          },
        ],
      },
      {
        id: "bottom",
        name: "Bottom",
        layout: "stack",
        sizePct: 20,
        gap: 0,
        children: [],
        items: [
          {
            type: "text",
            id: "rank-bottom",
            name: "Rank",
            bindings: { defaultValue: { field: "rank", values: ["A", "2", "3", "4", "5", "6", "7", "8", "9", "10", "J", "Q", "K", "★"] } },
            anchor: { x: 1, y: 1 },
            attach: { targetType: "section", targetId: "bottom", anchor: { x: 1, y: 1 } },
            widthPct: 28,
            heightPct: 65,
            fontSize: 52,
            align: "center",
            verticalAlign: "middle",
            font: "title",
          },
          {
            type: "emoji",
            id: "suit-bottom",
            name: "Suit",
            bindings: { emoji: { field: "suit", values: ["♠️", "♥️", "♦️", "♣️", "★"] } },
            anchor: { x: 0.5, y: 1 },
            attach: { targetType: "item", targetId: "rank-bottom", anchor: { x: 0.5, y: 0 } },
            widthPct: 28,
            heightPct: 35,
            fontSize: 24,
          },
        ],
      },
    ],
    items: [],
  },
});
