import { useState, useRef, useCallback, useEffect } from 'react'
import { Lock, Unlock, Home } from 'lucide-react'

type HitArea = { id: string; x: number; y: number; width: number; height: number }

type ZoomablePreviewProps = {
  src: string
  alt: string
  svgWidth?: number
  svgHeight?: number
  hitAreas?: HitArea[]
  selectedHitAreaId?: string | null
  onHitAreaClick?: (id: string) => void
  extraButtons?: React.ReactNode
}

type ViewState = { scale: number; x: number; y: number }

export default function ZoomablePreview({ src, alt, svgWidth, svgHeight, hitAreas, selectedHitAreaId, onHitAreaClick, extraButtons }: ZoomablePreviewProps) {
  const [view, setView] = useState<ViewState>({ scale: 1, x: 0, y: 0 })
  const [unlocked, setUnlocked] = useState(false)
  const dragging = useRef<{ startX: number; startY: number; originX: number; originY: number } | null>(null)
  const containerRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const container = containerRef.current
    if (!container) return
    const onWheel = (e: WheelEvent) => {
      if (!unlocked) return
      e.preventDefault()
      const rect = container.getBoundingClientRect()
      const cx = e.clientX - rect.left
      const cy = e.clientY - rect.top
      const factor = e.deltaY > 0 ? 0.9 : 1.1

      setView(prev => {
        const nextScale = Math.min(10, Math.max(0.1, prev.scale * factor))
        const ratio = nextScale / prev.scale
        return {
          scale: nextScale,
          x: cx * (1 - ratio) + prev.x * ratio,
          y: cy * (1 - ratio) + prev.y * ratio,
        }
      })
    }
    container.addEventListener('wheel', onWheel, { passive: false })
    return () => container.removeEventListener('wheel', onWheel)
  }, [unlocked])

  const handlePointerDown = useCallback((e: React.PointerEvent) => {
    if (!unlocked) return
    dragging.current = { startX: e.clientX, startY: e.clientY, originX: view.x, originY: view.y }
    ;(e.target as HTMLElement).setPointerCapture(e.pointerId)
  }, [view.x, view.y, unlocked])

  const handleClick = useCallback((e: React.MouseEvent) => {
    if (unlocked || !hitAreas?.length || !onHitAreaClick || !svgWidth || !svgHeight) return
    const container = containerRef.current
    if (!container) return
    const img = container.querySelector('img')
    if (!img) return
    const imgRect = img.getBoundingClientRect()
    // Map click to SVG coordinates
    const displayScale = imgRect.width / svgWidth
    const sx = (e.clientX - imgRect.left) / displayScale
    const sy = (e.clientY - imgRect.top) / displayScale
    // Hit-test smallest area first (items are usually smaller than sections)
    const sorted = [...hitAreas]
      .filter(a => sx >= a.x && sx <= a.x + a.width && sy >= a.y && sy <= a.y + a.height)
      .sort((a, b) => (a.width * a.height) - (b.width * b.height))
    if (!sorted.length) return
    // If current selection is in the hit list, pick the next one (cycle through)
    const currentIdx = sorted.findIndex(a => a.id === selectedHitAreaId)
    const hit = sorted[(currentIdx + 1) % sorted.length]
    if (hit) onHitAreaClick(hit.id)
  }, [unlocked, hitAreas, selectedHitAreaId, onHitAreaClick, svgWidth, svgHeight])

  const handlePointerMove = useCallback((e: React.PointerEvent) => {
    if (!dragging.current) return
    setView(prev => ({
      ...prev,
      x: dragging.current!.originX + e.clientX - dragging.current!.startX,
      y: dragging.current!.originY + e.clientY - dragging.current!.startY,
    }))
  }, [])

  const handlePointerUp = useCallback(() => {
    dragging.current = null
  }, [])

  const toggle = useCallback(() => {
    setUnlocked(prev => !prev)
  }, [])

  const isTransformed = view.scale !== 1 || view.x !== 0 || view.y !== 0

  return (
    <div className="relative">
      <div className="absolute top-2 right-2 z-10 flex gap-1">
        {extraButtons}
        {isTransformed && (
          <button
            onClick={() => setView({ scale: 1, x: 0, y: 0 })}
            className="rounded-md bg-background/80 border p-1.5 text-muted-foreground hover:text-foreground transition-colors"
            title="Reset view"
          >
            <Home className="h-4 w-4" />
          </button>
        )}
        <button
          onClick={toggle}
          className={`rounded-md border p-1.5 transition-colors ${
            unlocked
              ? 'bg-primary text-primary-foreground border-primary'
              : 'bg-background/80 text-muted-foreground hover:text-foreground'
          }`}
          title={unlocked ? 'Lock pan/zoom' : 'Unlock pan/zoom'}
        >
          {unlocked ? <Unlock className="h-4 w-4" /> : <Lock className="h-4 w-4" />}
        </button>
      </div>
      <div
        ref={containerRef}
        className={`rounded-lg border bg-card p-3 shadow-inner overflow-hidden ${
          unlocked ? 'touch-none cursor-grab active:cursor-grabbing' : ''
        }`}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onClick={handleClick}
      >
        <img
          src={src}
          alt={alt}
          className="max-w-full select-none"
          draggable={false}
          style={{
            transform: `translate(${view.x}px, ${view.y}px) scale(${view.scale})`,
            transformOrigin: '0 0',
          }}
        />
      </div>
    </div>
  )
}
