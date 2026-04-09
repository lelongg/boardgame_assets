import { useState, useEffect, useRef } from 'react'
import { useParams } from 'react-router-dom'
import { createStorage } from '../storage'
import { renderCardSvg } from '../render'
import type { CardData, CardTemplate } from '../types'

type DeckEntry = { card: CardData; template: CardTemplate; collectionName: string }

const svgToImage = (svg: string): Promise<HTMLImageElement> =>
  new Promise((resolve, reject) => {
    const img = new Image()
    img.onload = () => resolve(img)
    img.onerror = reject
    const blob = new Blob([svg], { type: 'image/svg+xml' })
    img.src = URL.createObjectURL(blob)
  })

const embedImages = async (svg: string): Promise<string> => {
  const matches = svg.match(/href="(\/api\/[^"]+)"/g) || []
  for (const m of matches) {
    const url = m.slice(6, -1)
    try {
      const resp = await fetch(url)
      if (resp.ok) {
        const blob = await resp.blob()
        const b64 = await new Promise<string>(r => { const reader = new FileReader(); reader.onload = () => r(reader.result as string); reader.readAsDataURL(blob) })
        svg = svg.replace(`href="${url}"`, `href="${b64}"`)
      }
    } catch { /* skip */ }
  }
  return svg
}

const MAX_ATLAS_SIZE = 4096
const TTS_MAX_CARDS = 69

export default function ExportTTSPage() {
  const { gameId } = useParams<{ gameId: string }>()
  const [entries, setEntries] = useState<DeckEntry[]>([])
  const [status, setStatus] = useState('Loading...')
  const [atlasUrl, setAtlasUrl] = useState<string | null>(null)
  const [generating, setGenerating] = useState(false)
  const canvasRef = useRef<HTMLCanvasElement>(null)

  useEffect(() => {
    const init = async () => {
      try {
        const s = await createStorage()
        if (!gameId) return
        const collections = await s.listCollections(gameId)
        const all: DeckEntry[] = []
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
        setStatus(`${all.length} cards loaded`)
      } catch (err) {
        setStatus('Error loading data.')
        console.error(err)
      }
    }
    init()
  }, [gameId])

  const generateAtlas = async () => {
    if (!entries.length) return
    setGenerating(true)
    setStatus('Rendering cards...')

    try {
      const cardCount = Math.min(entries.length, TTS_MAX_CARDS - 1) // Reserve last slot for hidden card
      const firstTemplate = entries[0].template

      // Calculate grid dimensions
      const numWidth = Math.min(10, cardCount + 1) // +1 for hidden card
      const numHeight = Math.ceil((cardCount + 1) / numWidth)

      // Calculate card size to fit within atlas limits
      const cardAspect = firstTemplate.height / firstTemplate.width
      const cardWidth = Math.floor(MAX_ATLAS_SIZE / numWidth)
      const cardHeight = Math.floor(cardWidth * cardAspect)
      const atlasWidth = cardWidth * numWidth
      const atlasHeight = cardHeight * numHeight

      const canvas = canvasRef.current
      if (!canvas) return
      canvas.width = atlasWidth
      canvas.height = atlasHeight
      const ctx = canvas.getContext('2d')
      if (!ctx) return

      // Fill background
      ctx.fillStyle = '#f6f1e9'
      ctx.fillRect(0, 0, atlasWidth, atlasHeight)

      // Render each card
      for (let i = 0; i < cardCount; i++) {
        setStatus(`Rendering card ${i + 1}/${cardCount}...`)
        const { card, template } = entries[i]
        let svg = renderCardSvg(card, template)
        svg = await embedImages(svg)

        const img = await svgToImage(svg)
        const col = i % numWidth
        const row = Math.floor(i / numWidth)
        ctx.drawImage(img, col * cardWidth, row * cardHeight, cardWidth, cardHeight)
        URL.revokeObjectURL(img.src)
      }

      // Last slot: hidden card (card back)
      const hiddenIdx = cardCount
      const hiddenCol = hiddenIdx % numWidth
      const hiddenRow = Math.floor(hiddenIdx / numWidth)
      ctx.fillStyle = '#1b1a17'
      ctx.fillRect(hiddenCol * cardWidth, hiddenRow * cardHeight, cardWidth, cardHeight)
      ctx.fillStyle = '#f6f1e9'
      ctx.font = `${Math.floor(cardWidth * 0.15)}px sans-serif`
      ctx.textAlign = 'center'
      ctx.textBaseline = 'middle'
      ctx.fillText('?', hiddenCol * cardWidth + cardWidth / 2, hiddenRow * cardHeight + cardHeight / 2)

      // Generate atlas URL
      const url = canvas.toDataURL('image/png')
      setAtlasUrl(url)

      // Generate TTS JSON
      const deckId = 1
      const containedObjects = entries.slice(0, cardCount).map((entry, i) => ({
        GUID: `card${String(i).padStart(2, '0')}`,
        Name: 'Card',
        Nickname: entry.card.name,
        CardID: deckId * 100 + i,
        Transform: { posX: 0, posY: 0, posZ: 0, rotX: 0, rotY: 180, rotZ: 180, scaleX: 1, scaleY: 1, scaleZ: 1 },
      }))

      const ttsJson = {
        ObjectStates: [{
          GUID: 'deck01',
          Name: 'DeckCustom',
          Nickname: 'Card Deck',
          Transform: { posX: 0, posY: 1, posZ: 0, rotX: 0, rotY: 180, rotZ: 180, scaleX: 1, scaleY: 1, scaleZ: 1 },
          DeckIDs: containedObjects.map(o => o.CardID),
          CustomDeck: {
            [String(deckId)]: {
              FaceURL: 'REPLACE_WITH_ATLAS_URL',
              BackURL: 'REPLACE_WITH_BACK_URL',
              NumWidth: numWidth,
              NumHeight: numHeight,
              BackIsHidden: true,
              UniqueBack: false,
            }
          },
          ContainedObjects: containedObjects,
        }]
      }

      // Store JSON for download
      canvas.dataset.ttsJson = JSON.stringify(ttsJson, null, 2)
      canvas.dataset.numWidth = String(numWidth)
      canvas.dataset.numHeight = String(numHeight)

      setStatus(`Atlas generated: ${atlasWidth}×${atlasHeight}px, ${numWidth}×${numHeight} grid, ${cardCount} cards`)
    } catch (err) {
      setStatus('Error generating atlas.')
      console.error(err)
    } finally {
      setGenerating(false)
    }
  }

  const downloadAtlas = () => {
    if (!atlasUrl) return
    const a = document.createElement('a')
    a.href = atlasUrl
    a.download = 'deck_face.png'
    a.click()
  }

  const downloadJson = () => {
    const canvas = canvasRef.current
    if (!canvas?.dataset.ttsJson) return
    const a = document.createElement('a')
    a.href = URL.createObjectURL(new Blob([canvas.dataset.ttsJson], { type: 'application/json' }))
    a.download = 'tts_deck.json'
    a.click()
  }

  return (
    <div style={{ fontFamily: 'system-ui, sans-serif', background: '#f4efe6', minHeight: '100vh' }}>
      <div style={{ position: 'sticky', top: 0, zIndex: 10, background: 'white', borderBottom: '1px solid #e5e5e5', padding: '8px 16px', display: 'flex', alignItems: 'center', gap: '12px', flexWrap: 'wrap' }}>
        <button
          onClick={generateAtlas}
          disabled={generating || !entries.length}
          style={{ padding: '6px 16px', borderRadius: 6, border: '1px solid #1b1a17', background: '#1b1a17', color: 'white', cursor: generating ? 'wait' : 'pointer', fontSize: 14 }}
        >
          {generating ? 'Generating...' : 'Generate Atlas'}
        </button>
        {atlasUrl && (
          <>
            <button onClick={downloadAtlas} style={{ padding: '6px 16px', borderRadius: 6, border: '1px solid #d1d5db', background: 'white', cursor: 'pointer', fontSize: 14 }}>
              Download Atlas PNG
            </button>
            <button onClick={downloadJson} style={{ padding: '6px 16px', borderRadius: 6, border: '1px solid #d1d5db', background: 'white', cursor: 'pointer', fontSize: 14 }}>
              Download TTS JSON
            </button>
          </>
        )}
        <button onClick={() => window.history.back()} style={{ padding: '6px 16px', borderRadius: 6, border: '1px solid #d1d5db', background: 'white', cursor: 'pointer', fontSize: 14 }}>
          Back
        </button>
        <span style={{ color: '#6b7280', fontSize: 14 }}>{status}</span>
      </div>

      <div style={{ padding: 16, textAlign: 'center' }}>
        <canvas ref={canvasRef} style={{ maxWidth: '100%', border: atlasUrl ? '1px solid #d1d5db' : 'none', borderRadius: 8, background: 'white' }} />
        {!atlasUrl && !generating && entries.length > 0 && (
          <p style={{ color: '#6b7280', marginTop: 16 }}>Click "Generate Atlas" to create the TTS deck image</p>
        )}
        {atlasUrl && (
          <div style={{ marginTop: 16, textAlign: 'left', maxWidth: 600, margin: '16px auto', background: 'white', padding: 16, borderRadius: 8, border: '1px solid #e5e5e5' }}>
            <h3 style={{ margin: '0 0 8px', fontSize: 16 }}>How to use in Tabletop Simulator:</h3>
            <ol style={{ margin: 0, paddingLeft: 20, lineHeight: 1.8, fontSize: 14, color: '#374151' }}>
              <li>Download the Atlas PNG and host it online (e.g. Imgur, Discord)</li>
              <li>In TTS, go to Objects → Components → Cards → Custom Deck</li>
              <li>Paste the hosted image URL as the Face URL</li>
              <li>Set columns to <strong>{canvasRef.current?.dataset.numWidth}</strong> and rows to <strong>{canvasRef.current?.dataset.numHeight}</strong></li>
              <li>Or: download the TTS JSON and import via Saved Objects</li>
            </ol>
          </div>
        )}
      </div>
    </div>
  )
}
