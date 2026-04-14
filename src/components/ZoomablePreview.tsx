import { useState, useRef, useCallback, useEffect } from 'react'
import { Lock, Unlock, Home, Box } from 'lucide-react'
import useAssetUrl from '../hooks/useAssetUrl'
import CollapsibleHeader, { useCollapsible } from '@/components/ui/CollapsibleHeader'

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
  backImage?: string
  backFit?: 'cover' | 'contain' | 'fill'
  maxImgHeight?: string
}

type ViewState = { scale: number; x: number; y: number }
type Rotation = { x: number; y: number }


export default function ZoomablePreview({ src, alt, svgWidth, svgHeight, hitAreas, selectedHitAreaId, onHitAreaClick, extraButtons, backImage, backFit = 'cover', maxImgHeight = '60vh' }: ZoomablePreviewProps) {
  const resolvedSrc = useAssetUrl(src) ?? src
  const resolvedBack = useAssetUrl(backImage) ?? backImage
  const { collapsed: panelCollapsed, toggle: togglePanel } = useCollapsible()
  const [view, setView] = useState<ViewState>({ scale: 1, x: 0, y: 0 })
  const [unlocked, setUnlocked] = useState(false)
  const [mode3d, setMode3d] = useState(false)
  const [rotation, setRotation] = useState<Rotation>({ x: 0, y: 0 })
  const [zoom3d, setZoom3d] = useState(1)
  const [imgLoaded, setImgLoaded] = useState(false)
  const dragging = useRef<{ startX: number; startY: number; originX: number; originY: number } | null>(null)
  const rotating = useRef<{ startX: number; startY: number; originRx: number; originRy: number } | null>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  const pointersRef = useRef<Map<number, { x: number; y: number }>>(new Map())
  const pinchRef = useRef<{ startDist: number; startScale: number } | null>(null)

  useEffect(() => {
    const container = containerRef.current
    if (!container) return
    const onWheel = (e: WheelEvent) => {
      if (mode3d) {
        e.preventDefault()
        const factor = e.deltaY > 0 ? 0.9 : 1.1
        setZoom3d(prev => Math.min(5, Math.max(0.3, prev * factor)))
        return
      }
      if (!unlocked) return
      e.preventDefault()
      const img = container.querySelector('img')
      if (!img) return
      const imgRect = img.getBoundingClientRect()
      const factor = e.deltaY > 0 ? 0.9 : 1.1

      setView(prev => {
        const nextScale = Math.min(10, Math.max(0.1, prev.scale * factor))
        const ratio = nextScale / prev.scale
        const dx = e.clientX - imgRect.left
        const dy = e.clientY - imgRect.top
        return {
          scale: nextScale,
          x: prev.x + dx * (1 - ratio),
          y: prev.y + dy * (1 - ratio),
        }
      })
    }
    container.addEventListener('wheel', onWheel, { passive: false })
    return () => container.removeEventListener('wheel', onWheel)
  }, [unlocked, mode3d])

  const handlePointerDown = useCallback((e: React.PointerEvent) => {
    const el = e.currentTarget as HTMLElement
    el.setPointerCapture(e.pointerId)
    pointersRef.current.set(e.pointerId, { x: e.clientX, y: e.clientY })

    if (mode3d) {
      if (pointersRef.current.size === 1) {
        rotating.current = { startX: e.clientX, startY: e.clientY, originRx: rotation.x, originRy: rotation.y }
      } else if (pointersRef.current.size === 2) {
        rotating.current = null
        const pts = [...pointersRef.current.values()]
        pinchRef.current = { startDist: Math.hypot(pts[1].x - pts[0].x, pts[1].y - pts[0].y), startScale: zoom3d }
      }
      return
    }
    if (!unlocked) return
    if (pointersRef.current.size === 1) {
      dragging.current = { startX: e.clientX, startY: e.clientY, originX: view.x, originY: view.y }
    } else if (pointersRef.current.size === 2) {
      dragging.current = null
      const pts = [...pointersRef.current.values()]
      pinchRef.current = { startDist: Math.hypot(pts[1].x - pts[0].x, pts[1].y - pts[0].y), startScale: view.scale }
    }
  }, [view.x, view.y, view.scale, unlocked, mode3d, rotation.x, rotation.y, zoom3d])

  const handleClick = useCallback((e: React.MouseEvent) => {
    if (unlocked || !hitAreas?.length || !onHitAreaClick || !svgWidth || !svgHeight) return
    const container = containerRef.current
    if (!container) return
    const img = container.querySelector('img')
    if (!img) return
    const imgRect = img.getBoundingClientRect()
    const displayScale = imgRect.width / svgWidth
    const sx = (e.clientX - imgRect.left) / displayScale
    const sy = (e.clientY - imgRect.top) / displayScale
    const sorted = [...hitAreas]
      .filter(a => sx >= a.x && sx <= a.x + a.width && sy >= a.y && sy <= a.y + a.height)
      .sort((a, b) => (a.width * a.height) - (b.width * b.height))
    if (!sorted.length) return
    const currentIdx = sorted.findIndex(a => a.id === selectedHitAreaId)
    const hit = sorted[(currentIdx + 1) % sorted.length]
    if (hit) onHitAreaClick(hit.id)
  }, [unlocked, hitAreas, selectedHitAreaId, onHitAreaClick, svgWidth, svgHeight])

  const handlePointerMove = useCallback((e: React.PointerEvent) => {
    if (!pointersRef.current.has(e.pointerId)) return
    pointersRef.current.set(e.pointerId, { x: e.clientX, y: e.clientY })

    if (pointersRef.current.size >= 2 && pinchRef.current) {
      const pts = [...pointersRef.current.values()]
      const dist = Math.hypot(pts[1].x - pts[0].x, pts[1].y - pts[0].y)
      const ratio = dist / pinchRef.current.startDist
      const newScale = Math.min(10, Math.max(0.1, pinchRef.current.startScale * ratio))
      if (mode3d) {
        setZoom3d(newScale)
      } else {
        setView(prev => ({ ...prev, scale: newScale }))
      }
      return
    }

    if (rotating.current) {
      const dx = e.clientX - rotating.current.startX
      const dy = e.clientY - rotating.current.startY
      setRotation({
        x: rotating.current.originRx - dy * 0.5,
        y: rotating.current.originRy + dx * 0.5,
      })
      return
    }
    if (!dragging.current) return
    setView(prev => ({
      ...prev,
      x: dragging.current!.originX + e.clientX - dragging.current!.startX,
      y: dragging.current!.originY + e.clientY - dragging.current!.startY,
    }))
  }, [mode3d])

  const handlePointerUp = useCallback((e: React.PointerEvent) => {
    pointersRef.current.delete(e.pointerId)
    if (pointersRef.current.size < 2) pinchRef.current = null
    if (pointersRef.current.size === 0) {
      dragging.current = null
      rotating.current = null
    }
  }, [])

  const toggle = useCallback(() => {
    setUnlocked(prev => !prev)
  }, [])

  const isTransformed = view.scale !== 1 || view.x !== 0 || view.y !== 0
  const is3dTransformed = rotation.x !== 0 || rotation.y !== 0 || zoom3d !== 1

  const toggle3d = useCallback(() => {
    setMode3d(prev => {
      if (!prev) {
        setView({ scale: 1, x: 0, y: 0 })
        setUnlocked(false)
      } else {
        setRotation({ x: 0, y: 0 })
        setZoom3d(1)
      }
      return !prev
    })
  }, [])

  const CARD_DEPTH = 4
  const checkerboard = { backgroundImage: 'repeating-conic-gradient(#e5e5e5 0% 25%, transparent 0% 50%)', backgroundSize: '16px 16px' }

  return (
    <div className="rounded-lg border bg-card overflow-hidden flex flex-col">
      <CollapsibleHeader collapsed={panelCollapsed} onToggle={togglePanel}>
        <div className="ml-auto flex items-center gap-0.5" onClick={(e) => e.stopPropagation()}>
          {extraButtons}
          <button
            onClick={toggle3d}
            className={`rounded p-1 transition-colors ${
              mode3d
                ? 'bg-primary text-primary-foreground'
                : 'text-muted-foreground hover:text-foreground'
            }`}
            title={mode3d ? 'Exit 3D mode' : '3D mode'}
          >
            <Box className="h-4 w-4" />
          </button>
          <button
            disabled={mode3d ? !is3dTransformed : !isTransformed}
            onClick={() => mode3d ? (setRotation({ x: 0, y: 0 }), setZoom3d(1)) : setView({ scale: 1, x: 0, y: 0 })}
            className="rounded p-1 text-muted-foreground hover:text-foreground transition-colors disabled:opacity-30 disabled:pointer-events-none"
            title={mode3d ? 'Reset rotation' : 'Reset view'}
          >
            <Home className="h-4 w-4" />
          </button>
          <button
            disabled={mode3d}
            onClick={toggle}
            className={`rounded p-1 transition-colors ${
              mode3d
                ? 'opacity-30 pointer-events-none text-muted-foreground'
                : unlocked
                  ? 'bg-primary text-primary-foreground'
                  : 'text-muted-foreground hover:text-foreground'
            }`}
            title={unlocked ? 'Lock pan/zoom' : 'Unlock pan/zoom'}
          >
            {unlocked ? <Unlock className="h-4 w-4" /> : <Lock className="h-4 w-4" />}
          </button>
        </div>
      </CollapsibleHeader>
      {!panelCollapsed && <div
        ref={containerRef}
        className={`p-3 overflow-hidden flex-1 h-0 ${
          mode3d ? 'touch-none cursor-grab active:cursor-grabbing' :
          unlocked ? 'touch-none cursor-grab active:cursor-grabbing' : ''
        }`}
        style={mode3d
          ? { ...checkerboard, perspective: '800px', display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '300px' }
          : checkerboard
        }
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerCancel={handlePointerUp}
        onClick={mode3d ? undefined : handleClick}
      >
        {!imgLoaded && (
          <div className="relative overflow-hidden rounded bg-muted/30 py-16">
            <div className="absolute inset-0 -translate-x-full animate-[shimmer_1.5s_ease-in-out_infinite] bg-gradient-to-r from-transparent via-muted-foreground/[0.07] to-transparent" />
          </div>
        )}
        {mode3d ? (() => {
          const rx = rotation.x, ry = rotation.y
          // Fresnel-like: dot(view, normal) analog from rotation
          // tilt = 0 when face-on, 1 at max angle
          const tilt = Math.min(1, Math.sqrt(rx * rx + ry * ry) / 60)
          // Tilt direction angle (radians → degrees)
          const tiltAngle = Math.atan2(rx, ry) * 180 / Math.PI
          // Hue shift driven by tilt (simulates view-dependent color shift from the Unity shader)
          const hueShift = (ry * 2.5 + rx * 1.5) % 360
          // Specular position (where the "light" hits)
          const specX = 50 - ry * 0.7
          const specY = 50 + rx * 0.7
          // Rainbow scroll position
          const scrollX = 50 + ry * 1.2
          const scrollY = 50 - rx * 1.2

          return (
          <div
            style={{
              transformStyle: 'preserve-3d',
              transform: `scale(${zoom3d}) rotateX(${rx}deg) rotateY(${ry}deg)`,
              transition: rotating.current ? 'none' : 'transform 0.3s ease-out',
            }}
          >
            {/* Front face */}
            <div className="relative" style={{ backfaceVisibility: 'hidden' }}>
              <img
                src={resolvedSrc}
                alt={alt}
                className={`max-w-full select-none rounded ${imgLoaded ? 'opacity-100' : 'opacity-0 h-0'}`}
                draggable={false}
                onLoad={() => setImgLoaded(true)}
                onError={() => setImgLoaded(true)}
                style={{ maxHeight: '60vh', display: 'block' }}
              />
              {/* Holo rainbow — semi-transparent color bands, no blend mode needed */}
              <div
                className="absolute inset-0 rounded pointer-events-none"
                style={{
                  background: `
                    linear-gradient(
                      ${tiltAngle + 90}deg,
                      hsla(${(hueShift + 0) % 360},100%,65%,0.35) 0%,
                      hsla(${(hueShift + 60) % 360},100%,60%,0.35) 17%,
                      hsla(${(hueShift + 120) % 360},100%,65%,0.35) 33%,
                      hsla(${(hueShift + 180) % 360},100%,68%,0.35) 50%,
                      hsla(${(hueShift + 240) % 360},100%,65%,0.35) 67%,
                      hsla(${(hueShift + 300) % 360},100%,60%,0.35) 83%,
                      hsla(${(hueShift + 360) % 360},100%,65%,0.35) 100%
                    )`,
                  backgroundSize: '200% 200%',
                  backgroundPosition: `${scrollX}% ${scrollY}%`,
                  opacity: tilt * 0.9,
                }}
              />
              {/* Fresnel edge glow — colored band across the card, view-dependent */}
              <div
                className="absolute inset-0 rounded pointer-events-none"
                style={{
                  background: `
                    linear-gradient(
                      ${tiltAngle}deg,
                      transparent 15%,
                      hsla(${(hueShift + 180) % 360},100%,75%,0.35) 40%,
                      hsla(${(hueShift + 210) % 360},100%,80%,0.45) 50%,
                      hsla(${(hueShift + 240) % 360},100%,75%,0.35) 60%,
                      transparent 85%
                    )`,
                  opacity: tilt,
                }}
              />
              {/* Specular glare — bright white highlight */}
              <div
                className="absolute inset-0 rounded pointer-events-none"
                style={{
                  background: `radial-gradient(
                    ellipse 55% 55% at ${specX}% ${specY}%,
                    rgba(255,255,255,0.75) 0%,
                    rgba(255,255,255,0.15) 45%,
                    transparent 70%
                  )`,
                  opacity: tilt * 0.8,
                }}
              />
            </div>
            {/* Card back */}
            <div
              className="absolute inset-0 rounded overflow-hidden"
              style={{
                backfaceVisibility: 'hidden',
                transform: 'rotateY(180deg)',
                background: resolvedBack ? '#ffffff' : 'repeating-linear-gradient(45deg, #5c6bc0, #5c6bc0 10px, #7986cb 10px, #7986cb 20px)',
                borderRadius: 'inherit',
              }}
            >
              {resolvedBack && <img src={resolvedBack} alt="Card back" className="w-full h-full" draggable={false} style={{ objectFit: backFit === 'contain' ? 'contain' : backFit === 'fill' ? 'fill' : 'cover' }} />}
            </div>
            {/* Right edge */}
            <div
              className="absolute top-0 h-full"
              style={{
                right: 0, width: `${CARD_DEPTH}px`, background: '#d4d4d8',
                transform: 'rotateY(90deg) translateZ(0px)', transformOrigin: 'right center',
                backfaceVisibility: 'hidden',
              }}
            />
            {/* Left edge */}
            <div
              className="absolute top-0 h-full"
              style={{
                left: 0, width: `${CARD_DEPTH}px`, background: '#d4d4d8',
                transform: 'rotateY(-90deg) translateZ(0px)', transformOrigin: 'left center',
                backfaceVisibility: 'hidden',
              }}
            />
            {/* Top edge */}
            <div
              className="absolute left-0 w-full"
              style={{
                top: 0, height: `${CARD_DEPTH}px`, background: '#e4e4e7',
                transform: 'rotateX(90deg) translateZ(0px)', transformOrigin: 'top center',
                backfaceVisibility: 'hidden',
              }}
            />
            {/* Bottom edge */}
            <div
              className="absolute left-0 w-full"
              style={{
                bottom: 0, height: `${CARD_DEPTH}px`, background: '#a1a1aa',
                transform: 'rotateX(-90deg) translateZ(0px)', transformOrigin: 'bottom center',
                backfaceVisibility: 'hidden',
              }}
            />
          </div>
          )
        })() : (
          <img
            src={resolvedSrc}
            alt={alt}
            className={`max-w-full block mx-auto select-none transition-opacity duration-200 drop-shadow-lg ${imgLoaded ? 'opacity-100' : 'opacity-0 h-0'}`}
            draggable={false}
            onLoad={() => setImgLoaded(true)}
            onError={() => setImgLoaded(true)}
            style={{
              maxHeight: maxImgHeight,
              transform: `translate(${view.x}px, ${view.y}px) scale(${view.scale})`,
              transformOrigin: '0 0',
            }}
          />
        )}
      </div>}
    </div>
  )
}
