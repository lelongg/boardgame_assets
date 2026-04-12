import { useState, useEffect, useMemo, useRef } from 'react'
import { useParams, useSearchParams, useNavigate } from 'react-router-dom'
import { ArrowLeft, Download, ChevronLeft, ChevronRight, Home, Settings } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { FloatingInput, FloatingSelect } from '@/components/ui/floating-field'
import { createStorage } from '../storage'
import { renderCardSvg, embedFontsInSvg, embedImagesInSvg } from '../render'
import { NumberEditor } from '@/components/layout/ControlPanel'
import type { CardData, CardLayout } from '../types'

// --- Types ---

type PaperPreset = 'a3' | 'a4' | 'letter' | 'custom'

type PrintConfig = {
  paper: PaperPreset
  customWidth: number
  customHeight: number
  landscape: boolean
  marginTop: number
  marginRight: number
  marginBottom: number
  marginLeft: number
  gap: number
  columnsMode: 'auto' | 'manual'
  manualColumns: number
  printMode: 'front' | 'back' | 'fold' | 'duplex'
  foldEdge: 'left' | 'right' | 'top' | 'bottom'
  cutMarks: boolean
  cutMarkLength: number
  cutMarkOffset: number
  includeBleed: boolean
  screenDpi: number
  exportDpi: number
}

const PAPER_SIZES: Record<string, [number, number]> = {
  a3: [297, 420],
  a4: [210, 297],
  letter: [215.9, 279.4],
}

const DEFAULT_CONFIG: PrintConfig = {
  paper: 'a4',
  customWidth: 210,
  customHeight: 297,
  landscape: false,
  marginTop: 10,
  marginRight: 10,
  marginBottom: 10,
  marginLeft: 10,
  gap: 2,
  columnsMode: 'auto',
  manualColumns: 3,
  printMode: 'front',
  foldEdge: 'right',
  cutMarks: false,
  cutMarkLength: 3,
  cutMarkOffset: 1,
  includeBleed: false,
  screenDpi: 96,
  exportDpi: 300,
}

// --- Layout computation ---

function computePageLayout(config: PrintConfig, cardWidthMm: number, cardHeightMm: number, bleedMm: number) {
  const [baseW, baseH] = config.paper === 'custom'
    ? [config.customWidth, config.customHeight]
    : PAPER_SIZES[config.paper]
  const pageW = config.landscape ? baseH : baseW
  const pageH = config.landscape ? baseW : baseH

  const baseCw = cardWidthMm + (config.includeBleed ? bleedMm * 2 : 0)
  const baseCh = cardHeightMm + (config.includeBleed ? bleedMm * 2 : 0)

  // In fold mode, the slot is doubled along the fold edge
  const foldH = config.printMode === 'fold' && (config.foldEdge === 'left' || config.foldEdge === 'right')
  const foldV = config.printMode === 'fold' && (config.foldEdge === 'top' || config.foldEdge === 'bottom')
  const cw = foldH ? baseCw * 2 : baseCw
  const ch = foldV ? baseCh * 2 : baseCh

  const printW = pageW - config.marginLeft - config.marginRight
  const printH = pageH - config.marginTop - config.marginBottom

  const cols = config.columnsMode === 'manual'
    ? config.manualColumns
    : Math.max(1, Math.floor((printW + config.gap) / (cw + config.gap)))
  const rows = Math.max(1, Math.floor((printH + config.gap) / (ch + config.gap)))
  const perPage = cols * rows

  // Center the grid in printable area
  const gridW = cols * cw + (cols - 1) * config.gap
  const gridH = rows * ch + (rows - 1) * config.gap
  const offsetX = config.marginLeft + (printW - gridW) / 2
  const offsetY = config.marginTop + (printH - gridH) / 2

  return { pageW, pageH, cw, ch, baseCw, baseCh, cols, rows, perPage, offsetX, offsetY }
}

// --- Component ---

type CardEntry = { card: CardData; layout: CardLayout; collectionName: string; back?: string; backFit?: string }

export default function PrintPage() {
  const { gameId, collectionId } = useParams<{ gameId: string; collectionId?: string }>()
  const [searchParams] = useSearchParams()
  const navigate = useNavigate()
  const [entries, setEntries] = useState<CardEntry[]>([])
  const [gameName, setGameName] = useState('')
  const [gameFonts, setGameFonts] = useState<Record<string, { name: string; file: string }>>({})
  const [svgs, setSvgs] = useState<string[]>([])
  const [status, setStatus] = useState('Loading...')
  const [exporting, setExporting] = useState(false)
  const [showOptions, setShowOptions] = useState(true)
  const [currentPage, setCurrentPage] = useState(0)
  const [config, setConfig] = useState<PrintConfig>(() => {
    try {
      const saved = localStorage.getItem('printConfig')
      return saved ? { ...DEFAULT_CONFIG, ...JSON.parse(saved) } : DEFAULT_CONFIG
    } catch { return DEFAULT_CONFIG }
  })
  const previewRef = useRef<HTMLDivElement>(null)
  const [view, setView] = useState({ x: 0, y: 0, zoom: 1 })
  const dragging = useRef<{ startX: number; startY: number; originX: number; originY: number } | null>(null)

  // Persist config
  useEffect(() => {
    localStorage.setItem('printConfig', JSON.stringify(config))
  }, [config])

  // Reset view when page changes
  useEffect(() => {
    setView({ x: 0, y: 0, zoom: 1 })
  }, [currentPage])

  // Wheel zoom + trackpad pinch gesture
  useEffect(() => {
    const el = previewRef.current
    if (!el) return
    const onWheel = (e: WheelEvent) => {
      e.preventDefault()
      const rect = el.getBoundingClientRect()
      // Cursor position relative to container center (where the page center sits at pan=0)
      const cx = e.clientX - rect.left - rect.width / 2
      const cy = e.clientY - rect.top - rect.height / 2

      const factor = e.ctrlKey
        ? (1 - e.deltaY * 0.01)  // Pinch-to-zoom
        : (e.deltaY > 0 ? 0.9 : 1.1)  // Scroll wheel

      setView(prev => {
        const nextZoom = Math.min(10, Math.max(0.1, prev.zoom * factor))
        return {
          zoom: nextZoom,
          x: cx - (cx - prev.x) * nextZoom / prev.zoom,
          y: cy - (cy - prev.y) * nextZoom / prev.zoom,
        }
      })
    }
    el.addEventListener('wheel', onWheel, { passive: false })
    return () => el.removeEventListener('wheel', onWheel)
  })

  const patch = (partial: Partial<PrintConfig>) => setConfig(prev => ({ ...prev, ...partial }))

  // Load card data
  useEffect(() => {
    const init = async () => {
      try {
        const s = await createStorage()
        if (!gameId) return

        const [gameData, fonts] = await Promise.all([s.getGame(gameId), s.listFonts(gameId)])
        setGameName(gameData.name || '')
        setGameFonts(fonts)

        const collections = collectionId
          ? [await s.getCollection(gameId, collectionId)]
          : await s.listCollections(gameId)

        const cardIds = searchParams.get('cards')?.split(',').filter(Boolean)
        const cardIdSet = cardIds?.length ? new Set(cardIds) : null

        const all: CardEntry[] = []
        for (const col of collections) {
          const [tpl, cards] = await Promise.all([
            s.getLayout(gameId, col.layoutId),
            s.listCards(gameId, col.id),
          ])
          for (const card of cards) {
            if (cardIdSet && !cardIdSet.has(card.id)) continue
            all.push({ card, layout: tpl, collectionName: col.name, back: col.back, backFit: col.backFit })
          }
        }

        setEntries(all)
        setStatus(`${all.length} card${all.length !== 1 ? 's' : ''} ready`)
      } catch (err) {
        setStatus('Error loading data.')
        console.error(err)
      }
    }
    init()
  }, [gameId, collectionId])

  // Render SVGs
  useEffect(() => {
    if (!entries.length) return
    let cancelled = false
    ;(async () => {
      const rendered: string[] = []
      for (const { card, layout } of entries) {
        if (cancelled) return
        let svg = renderCardSvg(card, layout, { fonts: gameFonts })
        svg = await embedFontsInSvg(svg, gameId!, gameFonts)
        svg = await embedImagesInSvg(svg)
        rendered.push(svg)
      }
      if (!cancelled) setSvgs(rendered)
    })()
    return () => { cancelled = true }
  }, [entries])

  // Page layout
  const layout = entries[0]?.layout
  const pageLayout = useMemo(() => {
    if (!layout) return null
    return computePageLayout(config, layout.width, layout.height, layout.bleed)
  }, [config, layout])

  const isDuplex = config.printMode === 'duplex'
  const frontPages = pageLayout ? Math.ceil(entries.length / pageLayout.perPage) : 0
  const totalPages = isDuplex ? frontPages * 2 : frontPages

  // Clamp current page
  useEffect(() => {
    if (currentPage >= totalPages && totalPages > 0) setCurrentPage(totalPages - 1)
  }, [totalPages])

  // --- PDF Export ---
  const exportPdf = async () => {
    if (!pageLayout || !layout || svgs.length === 0) return
    setExporting(true)
    setStatus('Generating PDF...')

    try {
      const { jsPDF } = await import('jspdf')

      const DPI = config.exportDpi
      const mmToPx = (mm: number) => Math.round(mm * DPI / 25.4)

      // Rasterize SVG string to PNG data URL via canvas
      const rasterizeSvg = (svgStr: string, widthMm: number, heightMm: number): Promise<string> => {
        return new Promise((resolve, reject) => {
          const w = mmToPx(widthMm)
          const h = mmToPx(heightMm)
          const img = new Image()
          img.onload = () => {
            const canvas = document.createElement('canvas')
            canvas.width = w
            canvas.height = h
            const ctx = canvas.getContext('2d')!
            ctx.drawImage(img, 0, 0, w, h)
            resolve(canvas.toDataURL('image/png'))
          }
          img.onerror = () => reject(new Error('Failed to rasterize SVG'))
          img.src = `data:image/svg+xml,${encodeURIComponent(svgStr)}`
        })
      }

      const { cw, ch, cols, perPage, offsetX, offsetY } = pageLayout
      const doc = new jsPDF({
        orientation: config.landscape ? 'landscape' : 'portrait',
        unit: 'mm',
        format: config.paper === 'custom' ? [config.customWidth, config.customHeight] : config.paper,
      })

      const isFoldPdf = config.printMode === 'fold'
      const isDuplexPdf = config.printMode === 'duplex'
      const foldHPdf = isFoldPdf && (config.foldEdge === 'left' || config.foldEdge === 'right')

      const renderPage = async (startIdx: number, isBack: boolean) => {
        const pageCardSvgs = svgs.slice(startIdx, startIdx + perPage)
        for (let i = 0; i < pageCardSvgs.length; i++) {
          const rawCol = i % cols
          const col = isBack ? (cols - 1 - rawCol) : rawCol
          const row = Math.floor(i / cols)
          const x = offsetX + col * (cw + config.gap)
          const y = offsetY + row * (ch + config.gap)
          const entry = entries[startIdx + i]

          if (!isBack && (config.printMode === 'front' || isFoldPdf || isDuplexPdf)) {
            const fx = isFoldPdf ? (config.foldEdge === 'right' ? x : foldHPdf ? x + baseCw : x) : x
            const fy = isFoldPdf ? (config.foldEdge === 'bottom' ? y : !foldHPdf ? y + baseCh : y) : y
            const png = await rasterizeSvg(pageCardSvgs[i], baseCw, baseCh)
            doc.addImage(png, 'PNG', fx, fy, baseCw, baseCh)
          }

          if (isBack && entry?.back) {
            doc.addImage(entry.back, 'JPEG', x, y, baseCw, baseCh)
          }

          if (!isBack && config.printMode === 'back' && entry?.back) {
            doc.addImage(entry.back, 'JPEG', x, y, baseCw, baseCh)
          }

          if (!isBack && isFoldPdf && entry?.back) {
            const bx = config.foldEdge === 'right' ? x + baseCw : foldHPdf ? x : x
            const by = config.foldEdge === 'bottom' ? y + baseCh : !foldHPdf ? y : y
            doc.saveGraphicsState()
            if (foldHPdf) {
              doc.setCurrentTransformationMatrix(doc.Matrix(-1, 0, 0, 1, (bx + baseCw) * 2 / doc.internal.scaleFactor, 0))
              doc.addImage(entry.back, 'JPEG', bx, by, baseCw, baseCh)
            } else {
              doc.setCurrentTransformationMatrix(doc.Matrix(1, 0, 0, -1, 0, (by + baseCh) * 2 / doc.internal.scaleFactor))
              doc.addImage(entry.back, 'JPEG', bx, by, baseCw, baseCh)
            }
            doc.restoreGraphicsState()
          }

          if (config.cutMarks) {
            drawCutMarks(doc, x, y, cw, ch, config.cutMarkLength, config.cutMarkOffset)
          }
        }
      }

      for (let fp = 0; fp < frontPages; fp++) {
        if (fp > 0) doc.addPage()
        await renderPage(fp * perPage, false)

        if (isDuplexPdf) {
          doc.addPage()
          await renderPage(fp * perPage, true)
        }
      }

      const colName = entries[0]?.collectionName || 'cards'
      doc.save(`${gameName ? `${gameName} - ` : ''}${colName}.pdf`)
      setStatus('PDF exported.')
    } catch (err) {
      console.error('PDF export error:', err)
      setStatus('Error generating PDF.')
    } finally {
      setExporting(false)
    }
  }

  if (!layout || !pageLayout) {
    return (
      <div className="flex h-screen items-center justify-center">
        <p className="text-muted-foreground">{status}</p>
      </div>
    )
  }

  const { pageW, pageH, cw, ch, baseCw, baseCh, cols, rows, perPage, offsetX, offsetY } = pageLayout
  const isFold = config.printMode === 'fold'
  const foldH = isFold && (config.foldEdge === 'left' || config.foldEdge === 'right')
  const foldV = isFold && (config.foldEdge === 'top' || config.foldEdge === 'bottom')

  // mm → CSS px using calibrated screen DPI. At zoom=1 the page is real-life size.
  const s = config.screenDpi / 25.4

  // In duplex mode: even pages = fronts, odd pages = backs (same cards, mirrored column order)
  const duplexIsBack = isDuplex && currentPage % 2 === 1
  const duplexFrontPage = isDuplex ? Math.floor(currentPage / 2) : currentPage
  const pageStartIdx = duplexFrontPage * perPage
  const pageCards = entries.slice(pageStartIdx, pageStartIdx + perPage)

  const isTransformed = view.x !== 0 || view.y !== 0 || Math.abs(view.zoom - 1) > 0.001
  const resetView = () => setView({ x: 0, y: 0, zoom: 1 })

  const handlePointerDown = (e: React.PointerEvent) => {
    dragging.current = { startX: e.clientX, startY: e.clientY, originX: view.x, originY: view.y }
    ;(e.target as HTMLElement).setPointerCapture(e.pointerId)
  }
  const handlePointerMove = (e: React.PointerEvent) => {
    const d = dragging.current
    if (!d) return
    setView(prev => ({
      ...prev,
      x: d.originX + e.clientX - d.startX,
      y: d.originY + e.clientY - d.startY,
    }))
  }
  const handlePointerUp = () => { dragging.current = null }

  return (
    <div className="flex flex-col h-screen bg-background">
      {/* Toolbar */}
      <div className="flex items-center gap-3 border-b px-4 py-2 shrink-0">
        <Button variant="ghost" size="sm" onClick={() => navigate(-1)}>
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <h1 className="text-sm font-semibold">PDF Export</h1>
        <span className="text-sm text-muted-foreground ml-auto">{status}</span>
        <Button size="sm" disabled={exporting || svgs.length === 0} onClick={exportPdf}>
          <Download className="h-4 w-4 mr-2" />
          {exporting ? 'Exporting...' : 'Export PDF'}
        </Button>
        <Button size="sm" variant={showOptions ? 'default' : 'outline'} onClick={() => setShowOptions(!showOptions)} title="Toggle options">
          <Settings className="h-4 w-4" />
        </Button>
      </div>

      <div className="flex flex-1 overflow-hidden">
        {/* Preview */}
        <div className="flex-1 flex flex-col overflow-hidden">
          {/* Header bar — matches ZoomablePreview style */}
          <div className="flex items-center justify-end gap-0.5 px-1 h-8 border-b shrink-0">
            {totalPages > 1 && <>
              <button
                disabled={currentPage === 0}
                onClick={() => setCurrentPage(p => p - 1)}
                className="rounded p-1 text-muted-foreground hover:text-foreground transition-colors disabled:opacity-30 disabled:pointer-events-none"
                title="Previous page"
              >
                <ChevronLeft className="h-4 w-4" />
              </button>
              <span className="text-xs text-muted-foreground px-1">
                {currentPage + 1} / {totalPages}
              </span>
              <button
                disabled={currentPage >= totalPages - 1}
                onClick={() => setCurrentPage(p => p + 1)}
                className="rounded p-1 text-muted-foreground hover:text-foreground transition-colors disabled:opacity-30 disabled:pointer-events-none"
                title="Next page"
              >
                <ChevronRight className="h-4 w-4" />
              </button>
              <div className="w-px h-4 bg-border mx-0.5" />
            </>}
            <span className="text-xs text-muted-foreground px-1">{Math.round(view.zoom * 100)}%</span>
            <button
              disabled={!isTransformed}
              onClick={resetView}
              className="rounded p-1 text-muted-foreground hover:text-foreground transition-colors disabled:opacity-30 disabled:pointer-events-none"
              title="Reset view"
            >
              <Home className="h-4 w-4" />
            </button>
          </div>

          {/* Pan/zoom area */}
          <div
            ref={previewRef}
            className="flex-1 relative overflow-hidden cursor-grab active:cursor-grabbing touch-none flex items-center justify-center"
            style={{ background: 'repeating-conic-gradient(#e5e5e5 0% 25%, #f5f5f5 0% 50%)', backgroundSize: '16px 16px' }}
            onPointerDown={handlePointerDown}
            onPointerMove={handlePointerMove}
            onPointerUp={handlePointerUp}
          >
            <div style={{ transform: `translate(${view.x}px, ${view.y}px) scale(${view.zoom})`, transformOrigin: 'center center' }}>
              <div
                className="bg-white shadow-lg relative select-none"
                style={{ width: pageW * s, height: pageH * s }}
              >
                {/* Margin guides */}
                <div className="absolute border border-dashed border-blue-200 pointer-events-none" style={{
                  left: config.marginLeft * s,
                  top: config.marginTop * s,
                  width: (pageW - config.marginLeft - config.marginRight) * s,
                  height: (pageH - config.marginTop - config.marginBottom) * s,
                }} />

                {/* Card slots */}
                {pageCards.map((entry, i) => {
                  const rawCol = i % cols
                  const col = duplexIsBack ? (cols - 1 - rawCol) : rawCol
                  const row = Math.floor(i / cols)
                  const x = offsetX + col * (cw + config.gap)
                  const y = offsetY + row * (ch + config.gap)
                  const svgIdx = pageStartIdx + i
                  const showFront = config.printMode !== 'back' && !duplexIsBack
                  const showBack = config.printMode === 'back' || isFold || duplexIsBack

                  // Position of front and back within the slot
                  const frontStyle: React.CSSProperties = isFold ? {
                    position: 'absolute',
                    left: (config.foldEdge === 'right' ? 0 : foldH ? baseCw * s : 0),
                    top: (config.foldEdge === 'bottom' ? 0 : foldV ? baseCh * s : 0),
                    width: baseCw * s,
                    height: baseCh * s,
                  } : { width: '100%', height: '100%' }

                  const backStyle: React.CSSProperties = isFold ? {
                    position: 'absolute',
                    left: (config.foldEdge === 'right' ? baseCw * s : foldH ? 0 : 0),
                    top: (config.foldEdge === 'bottom' ? baseCh * s : foldV ? 0 : 0),
                    width: baseCw * s,
                    height: baseCh * s,
                    // Mirror the back so it aligns when folded
                    transform: foldH ? 'scaleX(-1)' : 'scaleY(-1)',
                  } : { width: '100%', height: '100%' }

                  return (
                    <div key={entry.card.id} className="absolute" style={{
                      left: x * s,
                      top: y * s,
                      width: cw * s,
                      height: ch * s,
                    }}>
                      {showFront && (
                        <div style={frontStyle}>
                          {svgs[svgIdx] ? (
                            <img
                              src={`data:image/svg+xml,${encodeURIComponent(svgs[svgIdx])}`}
                              alt={entry.card.name}
                              className="w-full h-full pointer-events-none"
                              draggable={false}
                            />
                          ) : (
                            <div className="w-full h-full bg-muted animate-pulse" />
                          )}
                        </div>
                      )}
                      {showBack && entry.back && (
                        <div style={config.printMode === 'back' ? { width: '100%', height: '100%' } : backStyle}>
                          <img
                            src={entry.back}
                            alt="Back"
                            className="w-full h-full pointer-events-none"
                            style={{ objectFit: (entry.backFit as any) || 'cover' }}
                            draggable={false}
                          />
                        </div>
                      )}
                      {showBack && !entry.back && config.printMode === 'back' && (
                        <div className="w-full h-full bg-muted flex items-center justify-center text-xs text-muted-foreground">No back</div>
                      )}
                      {isFold && (
                        <div className="absolute pointer-events-none" style={{
                          ...(foldH
                            ? { left: baseCw * s - 0.5, top: 0, width: 1, height: '100%', borderLeft: '1px dashed rgba(0,0,0,0.2)' }
                            : { left: 0, top: baseCh * s - 0.5, width: '100%', height: 1, borderTop: '1px dashed rgba(0,0,0,0.2)' }
                          ),
                        }} />
                      )}
                    </div>
                  )
                })}

                {/* Cut marks — drawn on top, not clipped */}
                {config.cutMarks && pageCards.map((entry, i) => {
                  const col = i % cols
                  const row = Math.floor(i / cols)
                  const x = (offsetX + col * (cw + config.gap)) * s
                  const y = (offsetY + row * (ch + config.gap)) * s
                  const w = cw * s
                  const h = ch * s
                  const ml = config.cutMarkLength * s
                  const mo = config.cutMarkOffset * s
                  return <CutMarksSvg key={`cm-${entry.card.id}`} x={x} y={y} w={w} h={h} ml={ml} mo={mo} />
                })}

                {/* Empty slots */}
                {Array.from({ length: perPage - pageCards.length }).map((_, i) => {
                  const idx = pageCards.length + i
                  const col = idx % cols
                  const row = Math.floor(idx / cols)
                  const x = offsetX + col * (cw + config.gap)
                  const y = offsetY + row * (ch + config.gap)
                  return (
                    <div key={`empty-${idx}`} className="absolute border border-dashed border-muted-foreground/20" style={{
                      left: x * s,
                      top: y * s,
                      width: cw * s,
                      height: ch * s,
                    }} />
                  )
                })}
              </div>
            </div>

            {/* Calibration ruler — fixed in viewport, not affected by pan/zoom */}
            <div className="absolute bottom-4 left-4 flex items-center gap-2 pointer-events-none">
              <div className="border-t-2 border-foreground" style={{ width: Math.round(50 * config.screenDpi / 25.4) }} />
              <span className="text-xs text-muted-foreground whitespace-nowrap">50 mm</span>
            </div>
          </div>
        </div>

        {/* Config panel */}
        <div className={`border-l overflow-y-auto shrink-0 transition-all ${showOptions ? 'w-64 p-3' : 'w-0 p-0 overflow-hidden'}`}>
          <div className="space-y-3 min-w-[14rem] text-sm">

          {/* Print mode */}
          <div className="space-y-1">
            <FloatingSelect
              label="Mode"
              value={config.printMode}
              onValueChange={v => patch({ printMode: v as PrintConfig['printMode'] })}
              options={[
                { value: 'front', label: 'Front only' },
                { value: 'back', label: 'Back only' },
                { value: 'duplex', label: 'Duplex' },
                { value: 'fold', label: 'Fold' },
              ]}
              triggerClassName="h-7 text-xs"
            />
            {config.printMode === 'fold' && (
              <FloatingSelect
                label="Fold edge"
                value={config.foldEdge}
                onValueChange={v => patch({ foldEdge: v as PrintConfig['foldEdge'] })}
                options={[
                  { value: 'right', label: 'Fold right' },
                  { value: 'left', label: 'Fold left' },
                  { value: 'bottom', label: 'Fold bottom' },
                  { value: 'top', label: 'Fold top' },
                ]}
                triggerClassName="h-7 text-xs"
              />
            )}
          </div>

          {/* Paper */}
          <div className="space-y-1">
            <FloatingSelect
              label="Paper"
              value={config.paper}
              onValueChange={v => patch({ paper: v as PaperPreset })}
              options={[
                { value: 'a3', label: 'A3' },
                { value: 'a4', label: 'A4' },
                { value: 'letter', label: 'Letter' },
                { value: 'custom', label: 'Custom' },
              ]}
              triggerClassName="h-7 text-xs"
            />
            {config.paper === 'custom' && (
              <div className="grid grid-cols-2 gap-1">
                <FloatingInput label="W" type="number" className="h-7 text-xs" value={config.customWidth} onChange={e => patch({ customWidth: Number(e.target.value) })} />
                <FloatingInput label="H" type="number" className="h-7 text-xs" value={config.customHeight} onChange={e => patch({ customHeight: Number(e.target.value) })} />
              </div>
            )}
            <label className="flex items-center gap-1.5 text-xs cursor-pointer select-none">
              <Checkbox checked={config.landscape} onCheckedChange={(checked) => patch({ landscape: !!checked })} />
              Landscape
            </label>
          </div>

          {/* Margins */}
          <div className="grid grid-cols-2 gap-x-2 gap-y-3">
            {(['marginTop', 'marginRight', 'marginBottom', 'marginLeft'] as const).map(key => (
              <FloatingInput key={key}
                label={({ marginTop: 'Top', marginRight: 'Right', marginBottom: 'Bottom', marginLeft: 'Left' })[key]}
                type="number" min={0} className="h-7 text-xs"
                value={config[key]} onChange={e => patch({ [key]: Number(e.target.value) })} />
            ))}
          </div>

          {/* Grid */}
          <div className="space-y-2">
            <div className="flex items-center gap-2">
              <FloatingInput label="Gap" type="number" min={0} step={0.5} className="h-7 text-xs w-16"
                value={config.gap} onChange={e => patch({ gap: Number(e.target.value) })} />
              <FloatingSelect
                label="Columns"
                value={config.columnsMode}
                onValueChange={v => patch({ columnsMode: v as 'auto' | 'manual' })}
                options={[
                  { value: 'auto', label: `Auto (${cols})` },
                  { value: 'manual', label: 'Manual' },
                ]}
                triggerClassName="h-7 text-xs"
                className="flex-1"
              />
              {config.columnsMode === 'manual' && (
                <FloatingInput label="Cols" type="number" min={1} max={20} className="h-7 text-xs w-14"
                  value={config.manualColumns} onChange={e => patch({ manualColumns: Number(e.target.value) })} />
              )}
            </div>
            <p className="text-[10px] text-muted-foreground">{cols}×{rows} = {perPage}/page, {totalPages} page{totalPages !== 1 ? 's' : ''}</p>
          </div>

          {/* Options */}
          <div className="space-y-2">
            <label className="flex items-center gap-1.5 text-xs cursor-pointer select-none">
              <Checkbox checked={config.cutMarks} onCheckedChange={(checked) => patch({ cutMarks: !!checked })} />
              Cut marks
            </label>
            <div className="grid grid-cols-2 gap-x-2 gap-y-3 pl-5">
              <FloatingInput label="Length" type="number" min={0.5} step={0.5} className="h-7 text-xs" disabled={!config.cutMarks}
                value={config.cutMarkLength} onChange={e => patch({ cutMarkLength: Number(e.target.value) })} />
              <FloatingInput label="Offset" type="number" min={0} step={0.5} className="h-7 text-xs" disabled={!config.cutMarks}
                value={config.cutMarkOffset} onChange={e => patch({ cutMarkOffset: Number(e.target.value) })} />
            </div>
            <label className="flex items-center gap-1.5 text-xs cursor-pointer select-none">
              <Checkbox checked={config.includeBleed} onCheckedChange={(checked) => patch({ includeBleed: !!checked })} />
              Include bleed ({layout.bleed} mm)
            </label>
          </div>

          {/* DPI */}
          <div className="space-y-1">
            <Label className="text-[10px] font-semibold uppercase text-muted-foreground">Export DPI</Label>
            <NumberEditor value={String(config.exportDpi)} onChange={v => patch({ exportDpi: Number(v) })} min={72} max={600} step={1} />
          </div>
          <div className="space-y-1">
            <Label className="text-[10px] font-semibold uppercase text-muted-foreground">Screen DPI</Label>
            <NumberEditor value={String(config.screenDpi)} onChange={v => patch({ screenDpi: Number(v) })} min={72} max={220} step={1} />
          </div>

          {/* Info */}
          <div className="text-[10px] text-muted-foreground space-y-0.5 pt-1 border-t">
            <p>Card: {layout.width} × {layout.height} mm</p>
            {config.includeBleed && <p>With bleed: {layout.width + layout.bleed * 2} × {layout.height + layout.bleed * 2} mm</p>}
            <p>{entries.length} card{entries.length !== 1 ? 's' : ''}</p>
          </div>

          </div>
        </div>
      </div>
    </div>
  )
}

// --- Cut marks helpers ---

function drawCutMarks(doc: any, x: number, y: number, w: number, h: number, len: number, offset: number) {
  doc.setDrawColor(0)
  doc.setLineWidth(0.1)
  // Top-left
  doc.line(x - offset - len, y, x - offset, y)
  doc.line(x, y - offset - len, x, y - offset)
  // Top-right
  doc.line(x + w + offset, y, x + w + offset + len, y)
  doc.line(x + w, y - offset - len, x + w, y - offset)
  // Bottom-left
  doc.line(x - offset - len, y + h, x - offset, y + h)
  doc.line(x, y + h + offset, x, y + h + offset + len)
  // Bottom-right
  doc.line(x + w + offset, y + h, x + w + offset + len, y + h)
  doc.line(x + w, y + h + offset, x + w, y + h + offset + len)
}

function CutMarksSvg({ x, y, w, h, ml, mo }: { x: number; y: number; w: number; h: number; ml: number; mo: number }) {
  const lines = [
    // Top-left
    [x - mo - ml, y, x - mo, y],
    [x, y - mo - ml, x, y - mo],
    // Top-right
    [x + w + mo, y, x + w + mo + ml, y],
    [x + w, y - mo - ml, x + w, y - mo],
    // Bottom-left
    [x - mo - ml, y + h, x - mo, y + h],
    [x, y + h + mo, x, y + h + mo + ml],
    // Bottom-right
    [x + w + mo, y + h, x + w + mo + ml, y + h],
    [x + w, y + h + mo, x + w, y + h + mo + ml],
  ]
  return (
    <svg className="absolute inset-0 w-full h-full pointer-events-none" style={{ overflow: 'visible' }}>
      {lines.map(([x1, y1, x2, y2], i) => (
        <line key={i} x1={x1} y1={y1} x2={x2} y2={y2} stroke="black" strokeWidth={0.5} />
      ))}
    </svg>
  )
}
