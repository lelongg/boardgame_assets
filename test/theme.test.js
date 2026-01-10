import assert from "node:assert/strict";
import { test } from "node:test";
import { theme } from "../src/theme.js";

test("theme has expected size and palette structure", () => {
  assert.equal(typeof theme.width, "number");
  assert.equal(typeof theme.height, "number");
  assert.ok(theme.width > 0);
  assert.ok(theme.height > 0);
  assert.ok(theme.bleed < theme.width);
  assert.ok(theme.bleed < theme.height);
  assert.equal(typeof theme.palette.paper, "string");
  assert.equal(typeof theme.palette.ink, "string");
  assert.equal(typeof theme.palette.accent.forge, "string");
});
