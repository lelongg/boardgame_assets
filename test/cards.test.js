import assert from "node:assert/strict";
import { test } from "node:test";
import { cards } from "../src/data/cards.js";

test("cards have unique ids and names", () => {
  const ids = new Set();
  const names = new Set();
  for (const card of cards) {
    assert.equal(typeof card.id, "string");
    assert.equal(typeof card.name, "string");
    assert.equal(card.fields?.name, card.name);
    assert.ok(!ids.has(card.id), `duplicate id: ${card.id}`);
    assert.ok(!names.has(card.name), `duplicate name: ${card.name}`);
    ids.add(card.id);
    names.add(card.name);
  }
});
