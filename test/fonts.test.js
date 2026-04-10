import assert from "node:assert/strict";
import { test, describe, before, after } from "node:test";
import { spawn } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

const PORT = 5199;
const BASE = `http://localhost:${PORT}`;

let serverProcess;
let gameId;

const waitForServer = async (url, timeout = 10000) => {
  const start = Date.now();
  while (Date.now() - start < timeout) {
    try {
      const res = await fetch(url);
      if (res.ok || res.status === 404) return;
    } catch {}
    await new Promise((r) => setTimeout(r, 100));
  }
  throw new Error("Server did not start in time");
};

before(async () => {
  serverProcess = spawn("node", ["--import", "tsx", "src/server.ts", String(PORT)], {
    cwd: path.resolve("."),
    stdio: "pipe",
  });

  serverProcess.stderr.on("data", (d) => {
    // Uncomment for debugging: console.error(d.toString());
  });

  await waitForServer(`${BASE}/api/games`);

  // Create a test game
  const res = await fetch(`${BASE}/api/games`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name: "Font Test Game" }),
  });
  const game = await res.json();
  gameId = game.id;
});

after(async () => {
  // Delete test game
  if (gameId) {
    await fetch(`${BASE}/api/games/${gameId}`, { method: "DELETE" }).catch(() => {});
  }
  if (serverProcess) serverProcess.kill("SIGTERM");
});

let downloadedFontFile;

describe("Font endpoints", () => {
  test("POST /api/games/:gameId/fonts/google downloads a Google Font", async () => {
    const res = await fetch(`${BASE}/api/games/${gameId}/fonts/google`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: "Fraunces" }),
    });
    assert.equal(res.status, 200, "Should return 200");
    const body = await res.json();
    assert.ok(body.fonts, "Response should have a fonts property");
    const entry = Object.values(body.fonts).find(f => f.name === "Fraunces");
    assert.ok(entry, "Should have a Fraunces font entry");
    assert.ok(entry.file.endsWith(".woff2"), "File should be .woff2");

    // Verify file exists on disk
    const fontPath = path.join("games", gameId, "fonts", entry.file);
    assert.ok(fs.existsSync(fontPath), "Font file should exist on disk");

    downloadedFontFile = entry.file;
  });

  test("POST /api/games/:gameId/fonts/google returns 400 for unknown font", async () => {
    const res = await fetch(`${BASE}/api/games/${gameId}/fonts/google`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: "ThisFontDoesNotExist99999" }),
    });
    assert.equal(res.status, 400, "Should return 400 for unknown font");
  });

  test("GET /api/games/:gameId/fonts/:file serves the font file", async () => {
    assert.ok(downloadedFontFile, "Should have a downloaded font file from previous test");
    const res = await fetch(`${BASE}/api/games/${gameId}/fonts/${downloadedFontFile}`);
    assert.equal(res.status, 200, "Should return 200");
    assert.equal(res.headers.get("content-type"), "font/woff2", "Content-Type should be font/woff2");
    const buf = await res.arrayBuffer();
    assert.ok(buf.byteLength > 0, "Font data should not be empty");
  });

  test("POST /api/games/:gameId/fonts/upload accepts a font upload", async () => {
    const fakeFont = Buffer.alloc(64, 0x42);
    const res = await fetch(`${BASE}/api/games/${gameId}/fonts/upload`, {
      method: "POST",
      headers: {
        "Content-Type": "application/octet-stream",
        "Content-Disposition": 'attachment; filename="test-font.ttf"',
      },
      body: fakeFont,
    });
    assert.equal(res.status, 200, "Should return 200");
    const body = await res.json();
    assert.ok(body.fonts, "Response should have fonts property");
  });

  test("DELETE /api/games/:gameId/fonts/:file removes the font file", async () => {
    assert.ok(downloadedFontFile, "Should have a downloaded font file from previous test");
    const fontPath = path.join("games", gameId, "fonts", downloadedFontFile);
    assert.ok(fs.existsSync(fontPath), "Font file should exist before delete");

    const res = await fetch(`${BASE}/api/games/${gameId}/fonts/${downloadedFontFile}`, {
      method: "DELETE",
    });
    assert.equal(res.status, 200, "Should return 200");
    assert.ok(!fs.existsSync(fontPath), "Font file should be removed from disk");
  });

  test("GET /api/games/:gameId/fonts/:file returns 404 for deleted font", async () => {
    const res = await fetch(`${BASE}/api/games/${gameId}/fonts/${downloadedFontFile}`);
    assert.equal(res.status, 404, "Should return 404 for deleted font");
  });
});
