import { useState, useCallback, useEffect, useRef } from 'react'
import Cropper from 'react-easy-crop'
import { Button } from '@/components/ui/button'
import { FloatingInput } from '@/components/ui/floating-field'
import { NumberEditor } from '@/components/layout/ControlPanel'
import { X, Save, SaveAll, MoveHorizontal, MoveVertical } from 'lucide-react'

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
  const [cropW, setCropW] = useState(0)
  const [cropH, setCropH] = useState(0)
  const [imgNatural, setImgNatural] = useState({ w: 0, h: 0 })
  const containerRef = useRef<HTMLDivElement>(null)

  // Default crop to image size, constrained by aspect ratio if provided
  useEffect(() => {
    if (cropW > 0 && cropH > 0) return
    createImage(src).then(img => {
      const w = img.naturalWidth
      const h = img.naturalHeight
      setImgNatural({ w, h })
      if (aspectRatio) {
        // Fit the aspect ratio within the image dimensions
        if (w / h > aspectRatio) {
          setCropW(Math.round(h * aspectRatio))
          setCropH(h)
        } else {
          setCropW(w)
          setCropH(Math.round(w / aspectRatio))
        }
      } else {
        setCropW(w)
        setCropH(h)
      }
    }).catch(() => {})
  }, [src])

  // Use aspect ratio for crop shape, fill container
  const cropAspect = cropW > 0 && cropH > 0 ? cropW / cropH : undefined
  const rotated = imgNatural.w > 0 ? rotateSize(imgNatural.w, imgNatural.h, rotation) : { width: 9999, height: 9999 }
  const maxCropW = Math.round(rotated.width)
  const maxCropH = Math.round(rotated.height)

  const onCropComplete = useCallback((_: Area, croppedPixels: Area) => {
    setCroppedAreaPixels(croppedPixels)
  }, [])

  const getCroppedResult = async () => {
    if (!croppedAreaPixels) return null
    const outW = cropW > 0 ? cropW : undefined
    const outH = cropH > 0 ? cropH : undefined
    return getCroppedImg(src, croppedAreaPixels, rotation, 'image/png', 1.0, outW, outH)
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
      <div ref={containerRef} className="relative w-full rounded-md border overflow-hidden" style={{ height: 300, backgroundImage: 'repeating-conic-gradient(#e5e5e5 0% 25%, transparent 0% 50%)', backgroundSize: '12px 12px' }}>
        <Cropper
          image={src}
          crop={crop}
          zoom={zoom}
          minZoom={0.1}
          maxZoom={5}
          rotation={rotation}
          aspect={cropAspect}
          onCropChange={setCrop}
          onCropComplete={onCropComplete}
          onZoomChange={setZoom}
          onRotationChange={setRotation}
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
          <div className="flex items-center gap-1">
            <label className="text-xs text-muted-foreground">Zoom</label>
            {imgNatural.w > 0 && cropW > 0 && (
              <div className="ml-auto flex gap-0.5">
                <button className="rounded p-0.5 text-muted-foreground hover:text-foreground transition-colors" title="Fit width"
                  onClick={() => {
                    const baseScale = Math.max(cropW / imgNatural.w, cropH / imgNatural.h)
                    setZoom((cropW / imgNatural.w) / baseScale)
                    setCrop({ x: 0, y: 0 })
                  }}>
                  <MoveHorizontal className="h-3.5 w-3.5" />
                </button>
                <button className="rounded p-0.5 text-muted-foreground hover:text-foreground transition-colors" title="Fit height"
                  onClick={() => {
                    const baseScale = Math.max(cropW / imgNatural.w, cropH / imgNatural.h)
                    setZoom((cropH / imgNatural.h) / baseScale)
                    setCrop({ x: 0, y: 0 })
                  }}>
                  <MoveVertical className="h-3.5 w-3.5" />
                </button>
              </div>
            )}
          </div>
          <NumberEditor value={String(zoom)} onChange={(v) => setZoom(Number(v))} min={0.1} max={5} step={0.1} />
        </div>
        <div className="space-y-1">
          <label className="text-xs text-muted-foreground">Rotation</label>
          <NumberEditor value={String(rotation)} onChange={(v) => setRotation(Number(v))} min={-180} max={180} step={1} />
        </div>
      </div>

      <div className="grid grid-cols-2 gap-2">
        <div className="space-y-1">
          <label className="text-xs text-muted-foreground">Crop W</label>
          <NumberEditor value={String(cropW)} onChange={(v) => setCropW(Math.max(1, Number(v)))} min={1} max={maxCropW} step={1} />
        </div>
        <div className="space-y-1">
          <label className="text-xs text-muted-foreground">Crop H</label>
          <NumberEditor value={String(cropH)} onChange={(v) => setCropH(Math.max(1, Number(v)))} min={1} max={maxCropH} step={1} />
        </div>
      </div>

      <div className="flex gap-2 justify-end">
        <Button size="sm" variant="secondary" onClick={handleSave} disabled={saving} title="Replace"><Save className="h-4 w-4" /></Button>
        {onSaveAsNew && <Button size="sm" onClick={handleSaveAsNew} disabled={saving} title="Save as new"><SaveAll className="h-4 w-4" /></Button>}
        <Button size="sm" variant="outline" onClick={onCancel} title="Cancel"><X className="h-4 w-4" /></Button>
      </div>
    </div>
  )
}
