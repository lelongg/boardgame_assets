// Server/tests entry point for the card renderer. The actual implementation
// lives in src/render/core.ts and is shared with the app entry (src/render.ts).
// This module only maps the historical server option names onto the core ones:
//  - `fonts` carries the font binaries, inlined as @font-face rules;
//  - `fontSlots` maps slot → family name.
import type { CardData, CardLayout } from "../types.js";
import {
  computeLayoutPx,
  renderCardSvg as renderCardSvgCore,
  type EmbeddedFont,
  type FontSlot,
} from "./core.js";

export { PX_PER_MM, renderLayoutSvg } from "./core.js";

/** Same px-based semantics as the historical server export (the layout must
 *  already be converted to pixels). For mm layouts use computeLayout from src/render.ts. */
export const computeLayout = computeLayoutPx;

type RenderOptions = {
  debug?: boolean;
  fonts?: Record<string, EmbeddedFont>;
  fontSlots?: Record<string, FontSlot>;
  back?: string;
  backFit?: "cover" | "contain" | "fill";
  svgTextOnly?: boolean;
};

export const renderCardSvg = (card: CardData, layoutMm: CardLayout, options: RenderOptions = {}): string =>
  renderCardSvgCore(card, layoutMm, {
    debug: options.debug,
    back: options.back,
    backFit: options.backFit,
    fonts: options.fontSlots,
    embedFonts: options.fonts,
    svgTextOnly: options.svgTextOnly,
  });
