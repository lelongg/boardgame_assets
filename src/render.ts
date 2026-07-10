// App entry point for the card renderer. The actual implementation lives in
// src/render/core.ts and is shared with the server entry (src/render/cardSvg.ts).
// This module only adds the browser-side helpers (font/image embedding via fetch).
export {
  computeLayout,
  renderCardSvg,
  renderLayoutSvg,
  injectDebugLabel,
  type RenderOptions,
  type LayoutSvgOptions,
} from "./render/core.js";

/** Fetch layout fonts and embed them as base64 @font-face rules into the SVG.
 *  Blob SVGs displayed via <img> can't access the page's @font-face rules. */
const fontCache = new Map<string, string>();

export const buildFontCss = async (gameId: string, gameFonts: Record<string, { name: string; file: string }>): Promise<string> => {
  if (!Object.keys(gameFonts).length) return '';
  const rules: string[] = [];
  for (const slot of Object.values(gameFonts)) {
    if (!slot.file) continue;
    const cacheKey = `${gameId}/${slot.file}`;
    try {
      let b64 = fontCache.get(cacheKey);
      if (!b64) {
        const resp = await fetch(`/api/games/${gameId}/fonts/${slot.file}`);
        if (!resp.ok) continue;
        const blob = await resp.blob();
        b64 = await new Promise<string>((resolve) => {
          const reader = new FileReader();
          reader.onload = () => resolve(reader.result as string);
          reader.readAsDataURL(blob);
        });
        fontCache.set(cacheKey, b64);
      }
      rules.push(`@font-face { font-family: '${slot.name}'; src: url('${b64}'); }`);
    } catch { /* skip */ }
  }
  return rules.join('\n');
};

const injectFontCss = (svg: string, css: string): string => {
  if (!css) return svg;
  return svg.replace(/(<svg[^>]*>)/, `$1<defs><style>${css}</style></defs>`);
};

export const embedFontsInSvg = async (svg: string, gameId: string, gameFonts: Record<string, { name: string; file: string }>): Promise<string> => {
  const css = await buildFontCss(gameId, gameFonts);
  return injectFontCss(svg, css);
};

/** Fetch images referenced via /api/ URLs and embed them as base64 data URIs.
 *  Blob SVGs displayed via <img> can't fetch external URLs. */
const imageCache = new Map<string, string>();
const imagePending = new Map<string, Promise<string | null>>();

const blobToDataUrl = (blob: Blob): Promise<string> =>
  new Promise((resolve) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.readAsDataURL(blob);
  });

const fetchAndCacheImage = (url: string): Promise<string | null> => {
  const cached = imageCache.get(url);
  if (cached) return Promise.resolve(cached);
  let pending = imagePending.get(url);
  if (pending) return pending;
  pending = (async () => {
    try {
      // Try asset cache directly first (avoids fetch → 404 → fallback chain on IndexedDB)
      const { getAsset } = await import('./storage/assetCache');
      const entry = await getAsset(url);
      if (entry) {
        const b64 = await blobToDataUrl(entry.blob);
        imageCache.set(url, b64);
        return b64;
      }
      // Fall back to fetch (works on localFile server)
      const resp = await fetch(url);
      if (!resp.ok) return null;
      const blob = await resp.blob();
      const b64 = await blobToDataUrl(blob);
      imageCache.set(url, b64);
      return b64;
    } catch { return null; }
    finally { imagePending.delete(url); }
  })();
  imagePending.set(url, pending);
  return pending;
};

export const embedImagesInSvg = async (svg: string): Promise<string> => {
  const urls = [...new Set((svg.match(/href="(\/api\/[^"]+)"/g) || []).map(m => m.slice(6, -1)))];
  if (!urls.length) return svg;
  const results = await Promise.all(urls.map(fetchAndCacheImage));
  for (let i = 0; i < urls.length; i++) {
    if (results[i]) svg = svg.replaceAll(`href="${urls[i]}"`, `href="${results[i]}"`);
  }
  return svg;
};
