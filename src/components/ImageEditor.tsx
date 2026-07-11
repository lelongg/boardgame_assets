import { useState, useCallback, useEffect } from 'react'
import Cropper from 'react-easy-crop'
import { Button } from '@/components/ui/button'
import { FloatingInput } from '@/components/ui/floating-field'
import { Checkbox } from '@/components/ui/checkbox'
import { Slider } from '@/components/ui/slider'
import { NumberEditor } from '@/components/layout/ControlPanel'
import { X, Save, SaveAll, Link, Unlink, Pipette } from 'lucide-react'

type Area = { x: number; y: number; width: number; height: number }

type ImageEditorProps = {
  src: string
  aspectRatio?: number
  filename?: string
  onSave: (dataUrl: string, filename?: string) => void
  onSaveAsNew?: (dataUrl: string, filename?: string) => Promise<void>
  onCancel: () => void
}

async function getCroppedImg(
  imageSrc: string,
  pixelCrop: Area,
  rotation: number,
  outputFormat: string = 'image/png',
  quality: number = 0.92,
  outputWidth?: number,
  outputHeight?: number,
): Promise<string> {
  const image = await createImage(imageSrc)
  const canvas = document.createElement('canvas')
  const ctx = canvas.getContext('2d')!

  const rotRad = (rotation * Math.PI) / 180
  const { width: bW, height: bH } = rotateSize(image.width, image.height, rotation)

  canvas.width = bW
  canvas.height = bH
  ctx.translate(bW / 2, bH / 2)
  ctx.rotate(rotRad)
  ctx.translate(-image.width / 2, -image.height / 2)
  ctx.drawImage(image, 0, 0)

  const croppedCanvas = document.createElement('canvas')
  const croppedCtx = croppedCanvas.getContext('2d')!

  const outW = outputWidth ?? pixelCrop.width
  const outH = outputHeight ?? pixelCrop.height

  croppedCanvas.width = outW
  croppedCanvas.height = outH
  croppedCtx.drawImage(
    canvas,
    pixelCrop.x, pixelCrop.y, pixelCrop.width, pixelCrop.height,
    0, 0, outW, outH,
  )

  return croppedCanvas.toDataURL(outputFormat, quality)
}

function createImage(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image()
    img.addEventListener('load', () => resolve(img))
    img.addEventListener('error', (e) => reject(e))
    img.crossOrigin = 'anonymous'
    img.src = url
  })
}

function hexToRgb(hex: string): [number, number, number] {
  const h = hex.replace('#', '')
  return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)]
}

// GIMP-style color-to-alpha: pixels matching the key color become transparent,
// blends with the key color become semi-transparent with the key un-mixed from them.
// transparency/opacity thresholds (0..1) bound the distance-to-alpha ramp.
function applyColorToAlpha(data: Uint8ClampedArray, key: [number, number, number], transparency: number, opacity: number) {
  const [kr, kg, kb] = key
  const channelDist = (c: number, k: number) => (c > k ? (c - k) / (255 - k) : c < k ? (k - c) / k : 0)
  for (let i = 0; i < data.length; i += 4) {
    const r = data[i], g = data[i + 1], b = data[i + 2]
    const d = Math.max(channelDist(r, kr), channelDist(g, kg), channelDist(b, kb))
    let a: number
    if (d <= transparency) a = 0
    else if (d >= opacity || opacity <= transparency) a = 1
    else a = (d - transparency) / (opacity - transparency)
    if (a === 1) continue
    if (a === 0) {
      data[i + 3] = 0
      continue
    }
    data[i] = Math.min(255, Math.max(0, Math.round(kr + (r - kr) / a)))
    data[i + 1] = Math.min(255, Math.max(0, Math.round(kg + (g - kg) / a)))
    data[i + 2] = Math.min(255, Math.max(0, Math.round(kb + (b - kb) / a)))
    data[i + 3] = Math.round(data[i + 3] * a)
  }
}

async function colorToAlphaDataUrl(src: string, color: string, transparency: number, opacity: number): Promise<string> {
  const image = await createImage(src)
  const canvas = document.createElement('canvas')
  canvas.width = image.width
  canvas.height = image.height
  const ctx = canvas.getContext('2d')!
  ctx.drawImage(image, 0, 0)
  const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height)
  applyColorToAlpha(imageData.data, hexToRgb(color), transparency, opacity)
  ctx.putImageData(imageData, 0, 0)
  return canvas.toDataURL('image/png')
}

function rotateSize(width: number, height: number, rotation: number) {
  const rotRad = (rotation * Math.PI) / 180
  return {
    width: Math.abs(Math.cos(rotRad) * width) + Math.abs(Math.sin(rotRad) * height),
    height: Math.abs(Math.sin(rotRad) * width) + Math.abs(Math.cos(rotRad) * height),
  }
}

export default function ImageEditor({ src, aspectRatio, filename, onSave, onSaveAsNew, onCancel }: ImageEditorProps) {
  const [crop, setCrop] = useState({ x: 0, y: 0 })
  const [zoom, setZoom] = useState(1)
  const [rotation, setRotation] = useState(0)
  const [croppedAreaPixels, setCroppedAreaPixels] = useState<Area | null>(null)
  const [saving, setSaving] = useState(false)
  const [editName, setEditName] = useState(filename ?? '')
  const [prevFilename, setPrevFilename] = useState(filename)
  if (filename !== prevFilename) {
    setPrevFilename(filename)
    setEditName(filename ?? '')
  }
  const [aspect, setAspect] = useState(aspectRatio ?? 0)
  const [lockAspect, setLockAspect] = useState(true)
  const [outW, setOutW] = useState(0)
  const [outH, setOutH] = useState(0)
  const [c2aEnabled, setC2aEnabled] = useState(false)
  const [c2aColor, setC2aColor] = useState('#ffffff')
  const [c2aTransparency, setC2aTransparency] = useState(0)
  const [c2aOpacity, setC2aOpacity] = useState(1)
  const [c2aSrc, setC2aSrc] = useState<string | null>(null)

  // Recompute the color-to-alpha preview (debounced) when the key color or thresholds change
  useEffect(() => {
    if (!c2aEnabled) {
      setC2aSrc(null)
      return
    }
    let cancelled = false
    const timer = setTimeout(() => {
      colorToAlphaDataUrl(src, c2aColor, c2aTransparency, c2aOpacity)
        .then(url => { if (!cancelled) setC2aSrc(url) })
        .catch(() => {})
    }, 150)
    return () => { cancelled = true; clearTimeout(timer) }
  }, [src, c2aEnabled, c2aColor, c2aTransparency, c2aOpacity])

  const effectiveSrc = (c2aEnabled && c2aSrc) || src

  const pickColor = async () => {
    const EyeDropperCtor = (window as unknown as { EyeDropper?: new () => { open: () => Promise<{ sRGBHex: string }> } }).EyeDropper
    if (!EyeDropperCtor) return
    try {
      const result = await new EyeDropperCtor().open()
      setC2aColor(result.sRGBHex)
      setC2aEnabled(true)
    } catch {
      // picking cancelled
    }
  }

  // Initialize aspect and output size from image
  useEffect(() => {
    createImage(src).then(img => {
      const w = img.naturalWidth
      const h = img.naturalHeight
      if (aspectRatio) {
        setAspect(aspectRatio)
        if (w / h > aspectRatio) {
          setOutW(Math.round(h * aspectRatio))
          setOutH(h)
        } else {
          setOutW(w)
          setOutH(Math.round(w / aspectRatio))
        }
      } else {
        setAspect(w / h)
        setOutW(w)
        setOutH(h)
      }
    }).catch(() => {})
  }, [src])

  const onCropComplete = useCallback((_: Area, croppedPixels: Area) => {
    setCroppedAreaPixels(croppedPixels)
  }, [])

  const getCroppedResult = async () => {
    if (!croppedAreaPixels) return null
    const ow = outW > 0 ? outW : undefined
    const oh = outH > 0 ? outH : undefined
    return getCroppedImg(effectiveSrc, croppedAreaPixels, rotation, 'image/png', 1.0, ow, oh)
  }

  const editedName = editName.trim() || undefined

  const handleSave = async () => {
    setSaving(true)
    try {
      const result = await getCroppedResult()
      if (result) onSave(result, editedName)
    } finally {
      setSaving(false)
    }
  }

  const handleSaveAsNew = async () => {
    if (!onSaveAsNew) return
    setSaving(true)
    try {
      const result = await getCroppedResult()
      if (result) await onSaveAsNew(result, editedName)
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="space-y-3">
      <div className="relative w-full rounded-md border overflow-hidden" style={{ height: 300, backgroundImage: 'repeating-conic-gradient(#e5e5e5 0% 25%, transparent 0% 50%)', backgroundSize: '12px 12px' }}>
        <Cropper
          image={effectiveSrc}
          crop={crop}
          zoom={zoom}
          minZoom={0.1}
          maxZoom={5}
          rotation={rotation}
          aspect={aspect || undefined}
          onCropChange={setCrop}
          onCropComplete={onCropComplete}
          onZoomChange={setZoom}
          onRotationChange={() => {}}
          showGrid={false}
          style={{ containerStyle: { borderRadius: '0.375rem' } }}
        />
      </div>

      {filename != null && (
        <FloatingInput
          label="Name"
          value={editName}
          onChange={(e) => setEditName(e.target.value)}
        />
      )}

      <div className="grid grid-cols-2 gap-2">
        <div className="space-y-1">
          <label className="text-xs text-muted-foreground">Zoom</label>
          <NumberEditor value={String(Math.round(zoom * 100) / 100)} onChange={(v) => setZoom(Number(v))} min={0.1} max={5} step={0.1} />
        </div>
        <div className="space-y-1">
          <label className="text-xs text-muted-foreground">Rotation</label>
          <NumberEditor value={String(rotation)} onChange={(v) => setRotation(Number(v))} min={-180} max={180} step={1} />
        </div>
      </div>

      <div className="flex items-end gap-2">
        <div className="flex-1 space-y-1">
          <label className="text-xs text-muted-foreground">Output W</label>
          <NumberEditor value={String(outW)} onChange={(v) => {
            const w = Math.max(1, Number(v))
            setOutW(w)
            if (lockAspect && aspect > 0) setOutH(Math.round(w / aspect))
            else if (!lockAspect && outH > 0) { const a = w / outH; setAspect(a) }
          }} min={1} max={9999} step={1} />
        </div>
        <button
          className={`rounded p-1.5 mb-1 transition-colors ${lockAspect ? 'text-primary' : 'text-muted-foreground hover:text-foreground'}`}
          title={lockAspect ? 'Unlock aspect ratio' : 'Lock aspect ratio'}
          onClick={() => {
            if (!lockAspect && outW > 0 && outH > 0) setAspect(outW / outH)
            setLockAspect(l => !l)
          }}
        >
          {lockAspect ? <Link className="h-4 w-4" /> : <Unlink className="h-4 w-4" />}
        </button>
        <div className="flex-1 space-y-1">
          <label className="text-xs text-muted-foreground">Output H</label>
          <NumberEditor value={String(outH)} onChange={(v) => {
            const h = Math.max(1, Number(v))
            setOutH(h)
            if (lockAspect && aspect > 0) setOutW(Math.round(h * aspect))
            else if (!lockAspect && outW > 0) { const a = outW / h; setAspect(a) }
          }} min={1} max={9999} step={1} />
        </div>
      </div>

      <div className="space-y-2 rounded-md border p-2">
        <div className="flex items-center gap-2">
          <Checkbox id="color-to-alpha" checked={c2aEnabled} onCheckedChange={(v) => setC2aEnabled(v === true)} />
          <label htmlFor="color-to-alpha" className="text-xs font-medium cursor-pointer select-none">Color to alpha</label>
        </div>
        {c2aEnabled && (
          <>
            <div className="flex items-center gap-2">
              <input
                type="color"
                value={c2aColor}
                onChange={(e) => setC2aColor(e.target.value)}
                className="h-7 w-9 cursor-pointer rounded border bg-transparent p-0.5"
                title="Color to make transparent"
              />
              <span className="text-xs text-muted-foreground font-mono">{c2aColor}</span>
              {'EyeDropper' in window && (
                <button
                  type="button"
                  className="rounded p-1.5 text-muted-foreground hover:text-foreground transition-colors"
                  title="Pick color from screen"
                  onClick={pickColor}
                >
                  <Pipette className="h-4 w-4" />
                </button>
              )}
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <label className="text-xs text-muted-foreground">Transparency threshold ({Math.round(c2aTransparency * 100)}%)</label>
                <Slider value={[c2aTransparency]} onValueChange={([v]) => setC2aTransparency(v)} min={0} max={1} step={0.01} />
              </div>
              <div className="space-y-1">
                <label className="text-xs text-muted-foreground">Opacity threshold ({Math.round(c2aOpacity * 100)}%)</label>
                <Slider value={[c2aOpacity]} onValueChange={([v]) => setC2aOpacity(v)} min={0} max={1} step={0.01} />
              </div>
            </div>
          </>
        )}
      </div>

      <div className="flex gap-2 justify-end">
        <Button size="sm" variant="secondary" onClick={handleSave} disabled={saving} title="Replace"><Save className="h-4 w-4" /></Button>
        {onSaveAsNew && <Button size="sm" onClick={handleSaveAsNew} disabled={saving} title="Save as new"><SaveAll className="h-4 w-4" /></Button>}
        <Button size="sm" variant="outline" onClick={onCancel} title="Cancel"><X className="h-4 w-4" /></Button>
      </div>
    </div>
  )
}
