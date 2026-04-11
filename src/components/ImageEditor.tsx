import { useState, useCallback } from 'react'
import Cropper from 'react-easy-crop'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'

type Area = { x: number; y: number; width: number; height: number }

type ImageEditorProps = {
  src: string
  aspectRatio?: number
  onSave: (dataUrl: string) => void
  onCancel: () => void
}

async function getCroppedImg(
  imageSrc: string,
  pixelCrop: Area,
  rotation: number,
  targetDpi?: number,
  outputFormat: string = 'image/png',
  quality: number = 0.92,
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

  let outW = pixelCrop.width
  let outH = pixelCrop.height

  // Downscale to target DPI if specified
  if (targetDpi && targetDpi > 0) {
    // Assume the original image is at screen DPI (~96). Scale to target card DPI.
    // For a card at 300 DPI with 63.5mm width, the pixel width should be 63.5 * 300 / 25.4 = 750px
    // We cap the output to the crop size (don't upscale)
    const scale = Math.min(1, targetDpi / 300)
    outW = Math.round(pixelCrop.width * scale)
    outH = Math.round(pixelCrop.height * scale)
  }

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

export default function ImageEditor({ src, aspectRatio, onSave, onCancel }: ImageEditorProps) {
  const [crop, setCrop] = useState({ x: 0, y: 0 })
  const [zoom, setZoom] = useState(1)
  const [rotation, setRotation] = useState(0)
  const [croppedAreaPixels, setCroppedAreaPixels] = useState<Area | null>(null)
  const [outputFormat, setOutputFormat] = useState('image/png')
  const [quality, setQuality] = useState(92)
  const [saving, setSaving] = useState(false)

  const onCropComplete = useCallback((_: Area, croppedPixels: Area) => {
    setCroppedAreaPixels(croppedPixels)
  }, [])

  const handleSave = async () => {
    if (!croppedAreaPixels) return
    setSaving(true)
    try {
      const result = await getCroppedImg(src, croppedAreaPixels, rotation, undefined, outputFormat, quality / 100)
      onSave(result)
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="space-y-3">
      <div className="relative w-full rounded-md border overflow-hidden" style={{ height: 300, backgroundImage: 'repeating-conic-gradient(#e5e5e5 0% 25%, transparent 0% 50%)', backgroundSize: '12px 12px' }}>
        <Cropper
          image={src}
          crop={crop}
          zoom={zoom}
          rotation={rotation}
          aspect={aspectRatio}
          onCropChange={setCrop}
          onCropComplete={onCropComplete}
          onZoomChange={setZoom}
          onRotationChange={setRotation}
          showGrid={false}
          style={{ containerStyle: { borderRadius: '0.375rem' } }}
        />
      </div>

      <div className="grid grid-cols-2 gap-2">
        <div className="space-y-1">
          <label className="text-xs text-muted-foreground">Zoom</label>
          <input type="range" min={1} max={5} step={0.1} value={zoom} onChange={(e) => setZoom(Number(e.target.value))} className="w-full" />
        </div>
        <div className="space-y-1">
          <label className="text-xs text-muted-foreground">Rotation</label>
          <input type="range" min={0} max={360} step={1} value={rotation} onChange={(e) => setRotation(Number(e.target.value))} className="w-full" />
        </div>
      </div>

      <div className="grid grid-cols-2 gap-2">
        <div className="space-y-1">
          <label className="text-xs text-muted-foreground">Format</label>
          <select value={outputFormat} onChange={(e) => setOutputFormat(e.target.value)} className="w-full rounded-md border bg-background pl-3 pr-8 py-1.5 text-sm">
            <option value="image/png">PNG</option>
            <option value="image/jpeg">JPEG</option>
            <option value="image/webp">WebP</option>
          </select>
        </div>
        {outputFormat !== 'image/png' && (
          <div className="space-y-1">
            <label className="text-xs text-muted-foreground">Quality ({quality}%)</label>
            <input type="range" min={10} max={100} step={5} value={quality} onChange={(e) => setQuality(Number(e.target.value))} className="w-full" />
          </div>
        )}
      </div>

      <div className="flex gap-2">
        <Button size="sm" variant="outline" onClick={onCancel} className="flex-1">Cancel</Button>
        <Button size="sm" onClick={handleSave} disabled={saving} className="flex-1">{saving ? 'Saving...' : 'Apply'}</Button>
      </div>
    </div>
  )
}
