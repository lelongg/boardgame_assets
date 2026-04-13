import { useEffect } from 'react'

type FontMap = Record<string, { name: string; file: string }>

// Module-level cache: fontUrl → base64 data URL
// Survives React component unmounts/remounts (navigation)
const fontDataUrlCache = new Map<string, string>()

async function fetchFontAsDataUrl(url: string): Promise<string> {
  const cached = fontDataUrlCache.get(url)
  if (cached) return cached

  const resp = await fetch(url)
  if (!resp.ok) throw new Error(`Font fetch failed: ${resp.status}`)
  const blob = await resp.blob()
  const b64 = await new Promise<string>(resolve => {
    const reader = new FileReader()
    reader.onload = () => resolve(reader.result as string)
    reader.readAsDataURL(blob)
  })
  fontDataUrlCache.set(url, b64)
  return b64
}

/**
 * Loads game fonts into a <style> tag for preview rendering.
 * Caches base64 data URLs across navigations to avoid refetching.
 */
export default function useFontStyles(gameId: string | undefined, fonts: FontMap | undefined, styleId?: string) {
  useEffect(() => {
    if (!fonts || !Object.keys(fonts).length || !gameId) return
    let cancelled = false
    const id = styleId ?? `game-fonts-${gameId}`
    let style = document.getElementById(id) as HTMLStyleElement | null
    if (!style) { style = document.createElement('style'); style.id = id; document.head.appendChild(style) }
    const load = async () => {
      const rules: string[] = []
      for (const f of Object.values(fonts)) {
        if (!f.file || cancelled) continue
        try {
          const url = `/api/games/${gameId}/fonts/${f.file}`
          const b64 = await fetchFontAsDataUrl(url)
          rules.push(`@font-face { font-family: '${f.name}'; src: url('${b64}'); }`)
        } catch { /* skip */ }
      }
      if (!cancelled && style) style.textContent = rules.join('\n')
    }
    load()
    return () => { cancelled = true; if (style) style.textContent = '' }
  }, [fonts, gameId, styleId])
}

/** Clear cached data URLs for a specific game's fonts (e.g. after font upload/delete). */
export function invalidateFontCache(gameId: string) {
  for (const key of fontDataUrlCache.keys()) {
    if (key.includes(`/api/games/${gameId}/fonts/`)) {
      fontDataUrlCache.delete(key)
    }
  }
}
