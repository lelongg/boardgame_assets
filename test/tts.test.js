import assert from "node:assert/strict";
import { test } from "node:test";
import JSZip from "jszip";
import {
  toSlug,
  groupCardsIntoDecks,
  computeAtlasGrid,
  buildDeckObjectState,
  buildTtsJson,
  createServerTtsSink,
  createZipTtsSink,
} from "../src/tts.ts";

const makeCards = (n, extra = {}) =>
  Array.from({ length: n }, (_, i) => ({ id: `c${i}`, name: `Card ${i}`, fields: {}, ...extra }));

const pngBlob = (tag) => new Blob([new Uint8Array([0x89, 0x50, 0x4e, 0x47, tag])], { type: "image/png" });

// Verbatim copy of the JSON building previously inlined in FilesPanel.exportTts,
// used to prove the extracted builder is byte-identical.
const legacyTtsJson = (groups, layout, baseUrl) => {
  const toSlugLegacy = (s) => s.toLowerCase().trim().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "") || "deck";
  const objectStates = [];
  let deckIdCounter = 1;
  const cardAspect = layout.height / layout.width;
  for (const group of groups) {
    const slug = toSlugLegacy(group.name);
    const cardCount = Math.min(group.cards.length, 69 - 1);
    const numWidth = Math.min(10, cardCount + 1);
    const numHeight = Math.ceil((cardCount + 1) / numWidth);
    const deckId = deckIdCounter++;
    const contained = group.cards.slice(0, cardCount).map((c, i) => ({
      GUID: `c${String(deckId * 100 + i).padStart(4, "0")}`,
      Name: "Card", Nickname: c.name, CardID: deckId * 100 + i,
      Transform: { posX: 0, posY: 0, posZ: 0, rotX: 0, rotY: 180, rotZ: 180, scaleX: 1, scaleY: 1, scaleZ: 1 },
    }));
    objectStates.push({
      GUID: `deck${String(deckId).padStart(2, "0")}`,
      Name: "DeckCustom", Nickname: group.name,
      Transform: { posX: (deckId - 1) * 3, posY: 1, posZ: 0, rotX: 0, rotY: 180, rotZ: 180, scaleX: 1, scaleY: 1, scaleZ: 1 },
      DeckIDs: contained.map((o) => o.CardID),
      CustomDeck: { [String(deckId)]: { FaceURL: `${baseUrl}/${slug}_face.png`, BackURL: `${baseUrl}/${slug}_back.png`, NumWidth: numWidth, NumHeight: numHeight, BackIsHidden: true, UniqueBack: false } },
      ContainedObjects: contained,
    });
  }
  return JSON.stringify({ ObjectStates: objectStates }, null, 2);
};

const buildJson = (groups, layout, urlFor) =>
  buildTtsJson(groups.map((group, i) => {
    const grid = computeAtlasGrid(group.cards.length, layout.width, layout.height);
    const slug = toSlug(group.name);
    return buildDeckObjectState(i + 1, group, grid.cardCount, grid, urlFor(`${slug}_face.png`), urlFor(`${slug}_back.png`));
  }));

test("toSlug normalises names and falls back to 'deck'", () => {
  assert.equal(toSlug("  Hero Cards! "), "hero-cards");
  assert.equal(toSlug("Été/Winter 2"), "t-winter-2");
  assert.equal(toSlug("!!!"), "deck");
});

test("computeAtlasGrid: 1 card", () => {
  assert.deepEqual(computeAtlasGrid(1, 63, 88), { cardCount: 1, numWidth: 2, numHeight: 1, cardW: 2048, cardH: Math.floor(2048 * (88 / 63)) });
});

test("computeAtlasGrid: 10 cards wraps the hidden slot onto a second row", () => {
  assert.deepEqual(computeAtlasGrid(10, 63, 88), { cardCount: 10, numWidth: 10, numHeight: 2, cardW: 409, cardH: Math.floor(409 * (88 / 63)) });
});

test("computeAtlasGrid: 68 cards fills a 10x7 grid", () => {
  assert.deepEqual(computeAtlasGrid(68, 100, 100), { cardCount: 68, numWidth: 10, numHeight: 7, cardW: 409, cardH: 409 });
});

test("computeAtlasGrid: more than 68 cards is capped at 68", () => {
  assert.deepEqual(computeAtlasGrid(150, 100, 100), computeAtlasGrid(68, 100, 100));
  assert.equal(computeAtlasGrid(69, 100, 100).cardCount, 68);
});

test("computeAtlasGrid honours custom limits", () => {
  assert.deepEqual(computeAtlasGrid(5, 100, 200, 1000, 4), { cardCount: 3, numWidth: 4, numHeight: 1, cardW: 250, cardH: 500 });
});

test("groupCardsIntoDecks: collection mode yields one deck with the collection back", () => {
  const cards = [...makeCards(2, { collectionName: "A" }), ...makeCards(1, { collectionName: "B" })];
  const groups = groupCardsIntoDecks(cards, { collectionId: "col1", collectionName: "Heroes", backLayoutId: "back1" });
  assert.deepEqual(groups, [{ name: "Heroes", cards, backLayoutId: "back1" }]);
  assert.equal(groupCardsIntoDecks(cards, { collectionId: "col1" })[0].name, "deck");
});

test("groupCardsIntoDecks: game mode groups by collectionName in first-seen order", () => {
  const a1 = { id: "a1", name: "A1", fields: {}, collectionName: "Alpha", collectionBackLayoutId: "backA" };
  const b1 = { id: "b1", name: "B1", fields: {}, collectionName: "Beta" };
  const a2 = { id: "a2", name: "A2", fields: {}, collectionName: "Alpha", collectionBackLayoutId: "ignored" };
  const loose = { id: "x", name: "X", fields: {} };
  const groups = groupCardsIntoDecks([a1, b1, a2, loose], { collectionName: "unused", backLayoutId: "unused" });
  assert.deepEqual(groups, [
    { name: "Alpha", cards: [a1, a2], backLayoutId: "backA" },
    { name: "Beta", cards: [b1], backLayoutId: undefined },
    { name: "deck", cards: [loose], backLayoutId: undefined },
  ]);
});

test("buildDeckObjectState/buildTtsJson shape", () => {
  const groups = [
    { name: "Alpha", cards: makeCards(3) },
    { name: "Beta", cards: makeCards(12) },
  ];
  const parsed = JSON.parse(buildJson(groups, { width: 63, height: 88 }, (f) => f));
  assert.equal(parsed.ObjectStates.length, 2);
  const [d1, d2] = parsed.ObjectStates;
  assert.equal(d1.GUID, "deck01");
  assert.equal(d1.Nickname, "Alpha");
  assert.deepEqual(d1.DeckIDs, [100, 101, 102]);
  assert.deepEqual(Object.keys(d1.CustomDeck), ["1"]);
  assert.deepEqual(d1.CustomDeck["1"], { FaceURL: "alpha_face.png", BackURL: "alpha_back.png", NumWidth: 4, NumHeight: 1, BackIsHidden: true, UniqueBack: false });
  assert.equal(d1.ContainedObjects[2].GUID, "c0102");
  assert.equal(d1.ContainedObjects[2].Nickname, "Card 2");
  assert.equal(d2.GUID, "deck02");
  assert.equal(d2.Transform.posX, 3);
  assert.deepEqual(d2.DeckIDs, Array.from({ length: 12 }, (_, i) => 200 + i));
  assert.deepEqual(Object.keys(d2.CustomDeck), ["2"]);
  assert.equal(d2.CustomDeck["2"].NumWidth, 10);
  assert.equal(d2.CustomDeck["2"].NumHeight, 2);
});

test("buildTtsJson output is byte-identical to the previous inline implementation", () => {
  const layout = { width: 63, height: 88 };
  const baseUrl = "http://localhost:5173/api/games/g1/tts";
  const groups = [
    { name: "Heroes & Villains", cards: makeCards(5) },
    { name: "Big", cards: makeCards(80) },
    { name: "", cards: makeCards(1) },
  ];
  assert.equal(buildJson(groups, layout, (f) => `${baseUrl}/${f}`), legacyTtsJson(groups, layout, baseUrl));
});

test("createZipTtsSink (non-localFile path) bundles PNGs, JSON with relative URLs and README", async () => {
  const downloads = [];
  const sink = createZipTtsSink((blob, name) => downloads.push({ blob, name }));
  const faceUrl = await sink.put("heroes_face.png", pngBlob(1));
  const backUrl = await sink.put("heroes_back.png", pngBlob(2));
  assert.equal(faceUrl, "heroes_face.png");
  assert.equal(backUrl, "heroes_back.png");

  const group = { name: "Heroes", cards: makeCards(2) };
  const grid = computeAtlasGrid(2, 63, 88);
  const json = buildTtsJson([buildDeckObjectState(1, group, grid.cardCount, grid, faceUrl, backUrl)]);
  await sink.finish(json, "My Game - Heroes");

  assert.equal(downloads.length, 1);
  assert.equal(downloads[0].name, "My Game - Heroes - TTS.zip");
  assert.ok(downloads[0].blob instanceof Blob);

  const zip = await JSZip.loadAsync(await downloads[0].blob.arrayBuffer());
  assert.deepEqual(Object.keys(zip.files).sort(), ["My Game - Heroes - TTS.json", "README.txt", "heroes_back.png", "heroes_face.png"]);
  assert.deepEqual([...await zip.file("heroes_face.png").async("uint8array")], [0x89, 0x50, 0x4e, 0x47, 1]);
  assert.deepEqual([...await zip.file("heroes_back.png").async("uint8array")], [0x89, 0x50, 0x4e, 0x47, 2]);

  const zippedJson = await zip.file("My Game - Heroes - TTS.json").async("string");
  assert.equal(zippedJson, json);
  const deck = JSON.parse(zippedJson).ObjectStates[0].CustomDeck["1"];
  assert.equal(deck.FaceURL, "heroes_face.png");
  assert.equal(deck.BackURL, "heroes_back.png");

  const readme = await zip.file("README.txt").async("string");
  assert.match(readme, /FaceURL\/BackURL/);
  assert.match(readme, /public/i);
});

test("createServerTtsSink uploads to the server route and returns absolute URLs", async () => {
  const calls = [];
  const fetchStub = async (url, init) => { calls.push({ url, init }); return new Response(null, { status: 200 }); };
  const downloads = [];
  const sink = createServerTtsSink("g1", fetchStub, "http://localhost:5173", (blob, name) => downloads.push({ blob, name }));

  const png = pngBlob(3);
  const url = await sink.put("foo_face.png", png);
  assert.equal(url, "http://localhost:5173/api/games/g1/tts/foo_face.png");
  assert.equal(calls.length, 1);
  assert.equal(calls[0].url, "http://localhost:5173/api/games/g1/tts/upload");
  assert.equal(calls[0].init.method, "POST");
  assert.equal(calls[0].init.body, png);
  assert.equal(calls[0].init.headers["Content-Disposition"], 'attachment; filename="foo_face.png"');

  await sink.finish('{"ObjectStates":[]}', "My Game");
  assert.equal(calls.length, 1, "finish must not hit the server");
  assert.equal(downloads.length, 1);
  assert.equal(downloads[0].name, "My Game - TTS.json");
  assert.equal(downloads[0].blob.type, "application/json");
  assert.equal(await downloads[0].blob.text(), '{"ObjectStates":[]}');
});

test("createServerTtsSink surfaces the file name and HTTP status on failure", async () => {
  const fetchStub = async () => new Response("not found", { status: 404 });
  const sink = createServerTtsSink("g1", fetchStub, "http://example.test", () => assert.fail("no download expected"));
  await assert.rejects(sink.put("foo_face.png", pngBlob(4)), { message: "Upload of foo_face.png failed: HTTP 404" });
});
