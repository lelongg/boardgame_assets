import assert from "node:assert/strict";
import { test, before, after } from "node:test";
import { spawn } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

// Integration tests against the REAL src/server.ts (spawned as a subprocess
// with a temp working directory, so dataRoot = <tmp>/games).

const PORT = 5197;
const BASE = `http://127.0.0.1:${PORT}`;
const projectRoot = path.resolve(import.meta.dirname, "..");

let serverProc;
let tmpRoot;

before(async () => {
  tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), "bg-server-test-"));
  fs.writeFileSync(path.join(tmpRoot, "secret.txt"), "TOP-SECRET");
  serverProc = spawn(
    path.join(projectRoot, "node_modules", ".bin", "tsx"),
    [path.join(projectRoot, "src", "server.ts"), String(PORT)],
    { cwd: tmpRoot, stdio: ["ignore", "pipe", "pipe"] }
  );
  // Wait until the server answers.
  for (let i = 0; i < 100; i++) {
    try {
      const r = await fetch(`${BASE}/api/games`);
      if (r.ok) return;
    } catch { /* not up yet */ }
    await new Promise(r => setTimeout(r, 100));
  }
  throw new Error("server did not start");
});

after(() => {
  serverProc?.kill();
  fs.rmSync(tmpRoot, { recursive: true, force: true });
});

test("server: encoded path traversal cannot read files outside the data dir", async () => {
  const resp = await fetch(`${BASE}/api/games/g1/images/..%2f..%2f..%2fsecret.txt`);
  assert.equal(resp.status, 400, "traversal segment must be rejected");
  const body = await resp.text();
  assert.ok(!body.includes("TOP-SECRET"), "secret file content must never leak");
});

test("server: encoded traversal in gameId cannot delete outside the data dir", async () => {
  const resp = await fetch(`${BASE}/api/games/..%2f..`, { method: "DELETE" });
  assert.equal(resp.status, 400);
  assert.ok(fs.existsSync(path.join(tmpRoot, "secret.txt")), "files outside dataRoot must survive");
});

test("server: plain .. segments are rejected", async () => {
  const resp = await fetch(`${BASE}/api/games/g1/fonts/..%2fgame.json`);
  assert.equal(resp.status, 400);
});

test("server: one corrupt game.json does not break the games list", async () => {
  const create = await fetch(`${BASE}/api/games`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name: "Good Game" }),
  });
  assert.equal(create.status, 201);

  fs.mkdirSync(path.join(tmpRoot, "games", "corrupt-game"), { recursive: true });
  fs.writeFileSync(path.join(tmpRoot, "games", "corrupt-game", "game.json"), "{not json");

  const list = await fetch(`${BASE}/api/games`);
  assert.equal(list.status, 200, "list must not 500 on one corrupt file");
  const games = await list.json();
  assert.ok(games.some(g => g.name === "Good Game"), "valid games must still be listed");
});

test("server: updateGame merges arbitrary fields like the other backends", async () => {
  const create = await fetch(`${BASE}/api/games`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name: "Merge Game" }),
  });
  const game = await create.json();

  const update = await fetch(`${BASE}/api/games/${game.id}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ description: "hello" }),
  });
  assert.equal(update.status, 200);
  const updated = await update.json();
  assert.equal(updated.description, "hello", "non-name fields must persist");
  assert.equal(updated.name, "Merge Game", "name must be preserved when not updated");
  assert.equal(updated.id, game.id);
});

test("server: rendered card SVG uses the game's configured fonts", async () => {
  const create = await fetch(`${BASE}/api/games`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name: "Font Game" }),
  });
  const game = await create.json();

  // Write a font + manifest directly into the game's data dir.
  const fontsDir = path.join(tmpRoot, "games", game.id, "fonts");
  fs.mkdirSync(fontsDir, { recursive: true });
  fs.writeFileSync(path.join(fontsDir, "abc123.woff2"), Buffer.from([0, 1, 2, 3]));
  fs.writeFileSync(path.join(fontsDir, "fonts.json"), JSON.stringify({
    body: { name: "My Test Font", file: "abc123.woff2", source: "upload" },
  }));

  const render = await fetch(`${BASE}/api/games/${game.id}/render`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      card: { id: "c1", name: "C", fields: {} },
      layout: {
        id: "l1", name: "L", width: 63.5, height: 88.9, radius: 2, bleed: 1,
        root: {
          id: "root", name: "Root", layout: "stack", sizePct: 100, gap: 0, children: [],
          items: [{
            id: "t1", name: "T", type: "text", defaultValue: "Hello", font: "body",
            fontSize: 16, align: "center", verticalAlign: "middle", color: "#000",
            anchor: { x: 0.5, y: 0.5 }, attach: { targetType: "section", targetId: "root", anchor: { x: 0.5, y: 0.5 } },
            widthMm: 40, heightMm: 20,
          }],
        },
      },
    }),
  });
  assert.equal(render.status, 200);
  const svg = await render.text();
  assert.ok(svg.includes("My Test Font"), "configured font family must appear in the SVG");
  assert.ok(svg.includes("@font-face"), "font binary must be embedded via @font-face");
});
