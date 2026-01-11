import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import url from "node:url";
import { renderCardSvg, renderTemplateSvg } from "./render/cardSvg.js";
import { defaultTemplate } from "./template.js";
import { normalizeCard, normalizeTemplate } from "./normalize.js";
import type { CardData, CardTemplate } from "./types.js";

const port = Number(process.argv[2] ?? 5173);
const webRoot = path.resolve("src/web");
const dataRoot = path.resolve("games");

fs.mkdirSync(dataRoot, { recursive: true });

const contentTypes = new Map([
  [".html", "text/html; charset=utf-8"],
  [".css", "text/css; charset=utf-8"],
  [".js", "text/javascript; charset=utf-8"],
  [".svg", "image/svg+xml"],
  [".json", "application/json; charset=utf-8"],
  [".png", "image/png"],
  [".jpg", "image/jpeg"],
  [".jpeg", "image/jpeg"],
  [".webp", "image/webp"]
]);

const send = (res: http.ServerResponse, status: number, body: string, type = "application/json; charset=utf-8") => {
  res.statusCode = status;
  res.setHeader("Content-Type", type);
  res.end(body);
};

const readJson = <T>(filePath: string, fallback: T): T => {
  if (!fs.existsSync(filePath)) return fallback;
  const data = fs.readFileSync(filePath, "utf8");
  return JSON.parse(data) as T;
};

const writeJson = (filePath: string, value: unknown) => {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, JSON.stringify(value, null, 2), "utf8");
};

const parseBody = (req: http.IncomingMessage) =>
  new Promise<unknown>((resolve, reject) => {
    let data = "";
    req.on("data", (chunk) => {
      data += chunk;
      if (data.length > 2_000_000) req.destroy();
    });
    req.on("end", () => {
      if (!data) return resolve(null);
      try {
        resolve(JSON.parse(data));
      } catch (err) {
        reject(err);
      }
    });
  });

const slugify = (value: string) =>
  value
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");

const gamePath = (gameId: string) => path.join(dataRoot, gameId, "game.json");
const templatePath = (gameId: string) => path.join(dataRoot, gameId, "template.json");
const cardsDir = (gameId: string) => path.join(dataRoot, gameId, "cards");
const cardPath = (gameId: string, cardId: string) => path.join(cardsDir(gameId), `${cardId}.json`);

type GameMeta = {
  id: string;
  name: string;
  createdAt: string;
  updatedAt: string;
};

const listGames = (): GameMeta[] => {
  if (!fs.existsSync(dataRoot)) return [];
  return fs
    .readdirSync(dataRoot, { withFileTypes: true })
    .filter((dir) => dir.isDirectory())
    .map((dir) => readJson<GameMeta | null>(gamePath(dir.name), null))
    .filter(Boolean) as GameMeta[];
};

const listCards = (gameId: string): CardData[] => {
  const dir = cardsDir(gameId);
  if (!fs.existsSync(dir)) return [];
  return fs
    .readdirSync(dir)
    .filter((file) => file.endsWith(".json"))
    .map((file) => readJson<Partial<CardData> | null>(path.join(dir, file), null))
    .filter(Boolean)
    .map((card) => normalizeCard(card));
};

const loadTemplate = (gameId: string): CardTemplate => {
  const fallback = defaultTemplate();
  if (!fs.existsSync(templatePath(gameId))) {
    writeJson(templatePath(gameId), fallback);
    return fallback;
  }
  const raw = readJson<unknown>(templatePath(gameId), null);
  if (!raw || (typeof raw === "object" && (raw as any).version !== 2)) {
    writeJson(templatePath(gameId), fallback);
    return fallback;
  }
  return normalizeTemplate(raw);
};

const serveStatic = (req: http.IncomingMessage, res: http.ServerResponse) => {
  const parsed = url.parse(req.url ?? "/");
  const requestPath = decodeURIComponent(parsed.pathname ?? "/");
  const safePath = path.normalize(requestPath).replace(/^\.\.(?:\\|\/|$)/, "");
  const filePath = path.join(webRoot, safePath === "/" ? "index.html" : safePath);

  fs.readFile(filePath, (err, data) => {
    if (err) {
      res.statusCode = err.code === "ENOENT" ? 404 : 500;
      res.setHeader("Content-Type", "text/plain; charset=utf-8");
      res.end(err.code === "ENOENT" ? "Not found" : "Server error");
      return;
    }

    const ext = path.extname(filePath);
    const contentType = contentTypes.get(ext) ?? "application/octet-stream";
    res.statusCode = 200;
    res.setHeader("Content-Type", contentType);
    res.end(data);
  });
};

const server = http.createServer(async (req, res) => {
  const parsed = new URL(req.url ?? "/", `http://${req.headers.host}`);
  const segments = parsed.pathname.split("/").filter(Boolean);

  if (segments[0] !== "api" && segments[0] !== "print") {
    serveStatic(req, res);
    return;
  }

  if (segments[0] === "print") {
    const gameId = segments[1];
    if (!gameId) return send(res, 400, "Missing game", "text/plain; charset=utf-8");
    const cards = listCards(gameId);
    const html = buildPrintHtml(gameId, cards);
    send(res, 200, html, "text/html; charset=utf-8");
    return;
  }

  try {
    if (segments.length === 2 && segments[1] === "games") {
      if (req.method === "GET") {
        return send(res, 200, JSON.stringify(listGames()));
      }
      if (req.method === "POST") {
        const body = (await parseBody(req)) as { name?: string } | null;
        const name = body?.name?.trim();
        if (!name) return send(res, 400, JSON.stringify({ error: "Name required" }));
        const idBase = slugify(name) || `game-${Date.now()}`;
        let id = idBase;
        let suffix = 1;
        while (fs.existsSync(path.join(dataRoot, id))) {
          id = `${idBase}-${suffix++}`;
        }
        const now = new Date().toISOString();
        const game: GameMeta = { id, name, createdAt: now, updatedAt: now };
        writeJson(gamePath(id), game);
        writeJson(templatePath(id), defaultTemplate());
        return send(res, 201, JSON.stringify(game));
      }
    }

    if (segments.length >= 3 && segments[1] === "games") {
      const gameId = segments[2];

      if (segments.length === 3) {
        if (req.method === "GET") {
          const game = readJson<GameMeta | null>(gamePath(gameId), null);
          if (!game) return send(res, 404, JSON.stringify({ error: "Not found" }));
          return send(res, 200, JSON.stringify(game));
        }
        if (req.method === "PUT") {
          const body = (await parseBody(req)) as { name?: string } | null;
          const name = body?.name?.trim();
          if (!name) return send(res, 400, JSON.stringify({ error: "Name required" }));
          const game = readJson<GameMeta | null>(gamePath(gameId), null);
          if (!game) return send(res, 404, JSON.stringify({ error: "Not found" }));
          const updated = { ...game, name, updatedAt: new Date().toISOString() };
          writeJson(gamePath(gameId), updated);
          return send(res, 200, JSON.stringify(updated));
        }
        if (req.method === "DELETE") {
          fs.rmSync(path.join(dataRoot, gameId), { recursive: true, force: true });
          return send(res, 204, "", "text/plain; charset=utf-8");
        }
      }

      if (segments.length === 4 && segments[3] === "template") {
        if (req.method === "GET") {
          const template = loadTemplate(gameId);
          return send(res, 200, JSON.stringify(template));
        }
        if (req.method === "PUT") {
          const body = (await parseBody(req)) as CardTemplate | null;
          if (!body) return send(res, 400, JSON.stringify({ error: "Template required" }));
          writeJson(templatePath(gameId), body);
          touchGame(gameId);
          return send(res, 200, JSON.stringify(body));
        }
      }

      if (segments.length === 5 && segments[3] === "template" && segments[4] === "preview" && req.method === "POST") {
        const body = (await parseBody(req)) as CardTemplate | null;
        if (!body) return send(res, 400, JSON.stringify({ error: "Template required" }));
        return send(res, 200, renderTemplateSvg(body), "image/svg+xml");
      }

      if (segments.length === 4 && segments[3] === "template.svg" && req.method === "GET") {
        const template = loadTemplate(gameId);
        return send(res, 200, renderTemplateSvg(template), "image/svg+xml");
      }

      if (segments.length === 4 && segments[3] === "render" && req.method === "POST") {
        const body = (await parseBody(req)) as
          | { card?: Partial<CardData>; template?: CardTemplate; debug?: boolean; debugAttach?: Record<string, unknown> }
          | Partial<CardData>
          | null;
        const candidate = (body && "card" in body ? body.card : body) ?? {};
        const card = normalizeCard(candidate);
        const template = body && "template" in body && body.template ? body.template : loadTemplate(gameId);
        const debug = Boolean(body && "debug" in body && body.debug);
        const svg = renderCardSvg(card, template, { debug });
        const debugAttach = body && "debugAttach" in body ? body.debugAttach : null;
        const withDebug = debugAttach ? injectDebugLabel(svg, debugAttach) : svg;
        return send(res, 200, withDebug, "image/svg+xml");
      }

      if (segments.length === 4 && segments[3] === "cards") {
        if (req.method === "GET") {
          return send(res, 200, JSON.stringify(listCards(gameId)));
        }
        if (req.method === "POST") {
          const body = (await parseBody(req)) as Partial<CardData> | null;
          const name = body?.name?.trim();
          if (!name) return send(res, 400, JSON.stringify({ error: "Name required" }));
          const idBase = slugify(name) || `card-${Date.now()}`;
          let id = idBase;
          let suffix = 1;
          while (fs.existsSync(cardPath(gameId, id))) {
            id = `${idBase}-${suffix++}`;
          }
          const card = normalizeCard({ ...body, id });
          writeJson(cardPath(gameId, id), card);
          touchGame(gameId);
          return send(res, 201, JSON.stringify(card));
        }
      }

      if (segments.length >= 5 && segments[3] === "cards") {
        const isSvg = segments[4].endsWith(".svg");
        const cardId = segments[4].replace(/\.svg$/, "");

        if (segments.length === 5 && isSvg) {
          const raw = readJson<Partial<CardData> | null>(cardPath(gameId, cardId), null);
          if (!raw) return send(res, 404, JSON.stringify({ error: "Not found" }));
          const card = normalizeCard(raw);
          const template = loadTemplate(gameId);
          return send(res, 200, renderCardSvg(card, template), "image/svg+xml");
        }

        if (segments.length === 5 && req.method === "GET") {
          const raw = readJson<Partial<CardData> | null>(cardPath(gameId, cardId), null);
          if (!raw) return send(res, 404, JSON.stringify({ error: "Not found" }));
          return send(res, 200, JSON.stringify(normalizeCard(raw)));
        }

        if (segments.length === 5 && req.method === "PUT") {
          const body = (await parseBody(req)) as Partial<CardData> | null;
          const raw = readJson<Partial<CardData> | null>(cardPath(gameId, cardId), null);
          if (!raw) return send(res, 404, JSON.stringify({ error: "Not found" }));
          const updated = normalizeCard({ ...raw, ...body, id: cardId });
          writeJson(cardPath(gameId, cardId), updated);
          touchGame(gameId);
          return send(res, 200, JSON.stringify(updated));
        }

        if (segments.length === 5 && req.method === "DELETE") {
          fs.rmSync(cardPath(gameId, cardId), { force: true });
          touchGame(gameId);
          return send(res, 204, "", "text/plain; charset=utf-8");
        }
      }
    }

    if (segments.length === 2 && segments[1] === "render" && req.method === "POST") {
      const body = (await parseBody(req)) as { card?: Partial<CardData> } | Partial<CardData> | null;
      const candidate = (body && "card" in body ? body.card : body) ?? {};
      const card = normalizeCard(candidate);
      return send(res, 200, renderCardSvg(card, defaultTemplate()), "image/svg+xml");
    }

    return send(res, 404, JSON.stringify({ error: "Not found" }));
  } catch (err) {
    const message = err instanceof Error ? err.message : "Server error";
    return send(res, 500, JSON.stringify({ error: message }));
  }
});

const touchGame = (gameId: string) => {
  const game = readJson<GameMeta | null>(gamePath(gameId), null);
  if (!game) return;
  writeJson(gamePath(gameId), { ...game, updatedAt: new Date().toISOString() });
};

const injectDebugLabel = (svg: string, debugAttach: Record<string, unknown>) => {
  const label = `ATTACH ${JSON.stringify(debugAttach)}`.replaceAll("<", "&lt;").replaceAll(">", "&gt;");
  const insert = `<text x=\"24\" y=\"70\" font-size=\"12\" fill=\"#d64545\" font-family=\"Space Grotesk, sans-serif\">${label}</text>`;
  return svg.replace("</svg>", `${insert}</svg>`);
};

const buildPrintHtml = (gameId: string, cards: CardData[]) => {
  const items = cards
    .map(
      (card) =>
        `<div class="sheet-card"><img src="/api/games/${gameId}/cards/${card.id}.svg" alt="${card.name}" /></div>`
    )
    .join("\n");

  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>Print Sheet - ${gameId}</title>
    <style>
      @page { margin: 10mm; }
      body {
        margin: 0;
        font-family: "Space Grotesk", sans-serif;
        background: #f4efe6;
        color: #1b1a17;
      }
      header {
        padding: 16px 18px 6px;
      }
      h1 { margin: 0; font-size: 20px; }
      .sheet {
        display: grid;
        grid-template-columns: repeat(3, 1fr);
        gap: 12px;
        padding: 12px;
      }
      .sheet-card {
        background: #fffaf2;
        border: 1px solid #d7cdbd;
        border-radius: 12px;
        padding: 6px;
        break-inside: avoid;
      }
      .sheet-card img {
        width: 100%;
        display: block;
      }
      @media print {
        header { display: none; }
        body { background: white; }
      }
    </style>
  </head>
  <body>
    <header>
      <h1>Print Sheet — ${gameId}</h1>
      <p>Use your browser print dialog.</p>
    </header>
    <section class="sheet">${items}</section>
  </body>
</html>`;
};

server.listen(port, "0.0.0.0", () => {
  console.log(`Editor running at http://localhost:${port}/`);
});
