import { useState, useEffect } from 'react'
import { useParams } from 'react-router-dom'
import { createStorage } from '../storage'
import { renderCardSvg, embedFontsInSvg } from '../render'
import type { CardData, CardTemplate } from '../types'

type CardWithTemplate = { card: CardData; template: CardTemplate; collectionName: string }

export default function PrintPage() {
  const { gameId, collectionId } = useParams<{ gameId: string; collectionId?: string }>()
  const [entries, setEntries] = useState<CardWithTemplate[]>([])
  const [svgs, setSvgs] = useState<string[]>([])
  const [status, setStatus] = useState('Loading...')
  const [cols, setCols] = useState(3)

  useEffect(() => {
    const init = async () => {
      try {
        const s = await createStorage()
        if (!gameId) return

        const collections = collectionId
          ? [await s.getCollection(gameId, collectionId)]
          : await s.listCollections(gameId)

        const all: CardWithTemplate[] = []
        for (const col of collections) {
          const [tpl, cards] = await Promise.all([
            s.getTemplate(gameId, col.templateId),
            s.listCards(gameId, col.id),
          ])
          for (const card of cards) {
            all.push({ card, template: tpl, collectionName: col.name })
          }
        }

        setEntries(all)
        setStatus(`${all.length} cards${collections.length > 1 ? ` across ${collections.length} collections` : ''}`)
      } catch (err) {
        setStatus('Error loading data.')
        console.error(err)
      }
    }
    init()
  }, [gameId, collectionId])

  // Render SVGs client-side
  useEffect(() => {
    if (!entries.length) return
    let cancelled = false

    const render = async () => {
      const rendered: string[] = []
      for (const { card, template } of entries) {
        if (cancelled) return
        let svg = renderCardSvg(card, template)
        svg = await embedFontsInSvg(svg, template)
        const matches = svg.match(/href="(\/api\/[^"]+)"/g) || []
        for (const m of matches) {
          const url = m.slice(6, -1)
          try {
            const resp = await fetch(url)
            if (resp.ok) {
              const blob = await resp.blob()
              const b64 = await new Promise<string>(r => {
                const reader = new FileReader()
                reader.onload = () => r(reader.result as string)
                reader.readAsDataURL(blob)
              })
              svg = svg.replace(`href="${url}"`, `href="${b64}"`)
            }
          } catch { /* skip */ }
        }
        rendered.push(svg)
      }
      if (!cancelled) setSvgs(rendered)
    }
    render()
    return () => { cancelled = true }
  }, [entries])

  return (
    <div className="print-page">
      <style>{`
        @media screen {
          .print-page { font-family: system-ui, sans-serif; background: #f4efe6; min-height: 100vh; }
          .print-toolbar { position: sticky; top: 0; z-index: 10; background: white; border-bottom: 1px solid #e5e5e5; padding: 8px 16px; display: flex; align-items: center; gap: 12px; }
          .print-toolbar button { padding: 6px 16px; border-radius: 6px; border: 1px solid #d1d5db; background: white; cursor: pointer; font-size: 14px; }
          .print-toolbar button:hover { background: #f3f4f6; }
          .print-toolbar button.primary { background: #1b1a17; color: white; border-color: #1b1a17; }
          .print-toolbar button.primary:hover { background: #333; }
          .print-toolbar select { padding: 4px 8px; border-radius: 4px; border: 1px solid #d1d5db; font-size: 14px; }
          .print-toolbar .status { color: #6b7280; font-size: 14px; }
          .print-sheet { display: grid; gap: 8px; padding: 16px; max-width: 1200px; margin: 0 auto; }
          .print-card { background: white; border-radius: 8px; padding: 4px; box-shadow: 0 1px 3px rgba(0,0,0,0.1); }
          .print-card img { width: 100%; display: block; }
        }
        @media print {
          .print-toolbar { display: none !important; }
          .print-page { background: white; }
          .print-sheet { display: grid; gap: 4mm; padding: 0; margin: 0; }
          .print-card { padding: 0; box-shadow: none; border-radius: 0; break-inside: avoid; }
          .print-card img { width: 100%; display: block; }
          @page { margin: 10mm; }
        }
      `}</style>

      <div className="print-toolbar">
        <button className="primary" onClick={() => window.print()}>Print</button>
        <button onClick={() => window.history.back()}>Back</button>
        <label>
          Columns:
          <select value={cols} onChange={e => setCols(Number(e.target.value))}>
            {[1, 2, 3, 4, 5, 6].map(n => <option key={n} value={n}>{n}</option>)}
          </select>
        </label>
        <span className="status">{status}</span>
      </div>

      <div className="print-sheet" style={{ gridTemplateColumns: `repeat(${cols}, 1fr)` }}>
        {svgs.map((svg, i) => (
          <div key={entries[i]?.card.id ?? i} className="print-card">
            <img
              src={URL.createObjectURL(new Blob([svg], { type: 'image/svg+xml' }))}
              alt={entries[i]?.card.name ?? `Card ${i + 1}`}
            />
          </div>
        ))}
      </div>
    </div>
  )
}
