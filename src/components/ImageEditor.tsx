import { useState, useCallback, useEffect } from 'react'
import Cropper from 'react-easy-crop'
import { Button } from '@/components/ui/button'
import { FloatingInput } from '@/components/ui/floating-field'
import { NumberEditor } from '@/components/layout/ControlPanel'
import { X, Save, SaveAll, Link, Unlink } from 'lucide-react'

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
  const [aspect, setAspect] = useState(aspectRatio ?? 0)
  const [lockAspect, setLockAspect] = useState(true)
  const [outW, setOutW] = useState(0)
  const [outH, setOutH] = useState(0)

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
    return getCroppedImg(src, croppedAreaPixels, rotation, 'image/png', 1.0, ow, oh)
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
          image={src}
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

      <div className="flex gap-2 justify-end">
        <Button size="sm" variant="secondary" onClick={handleSave} disabled={saving} title="Replace"><Save className="h-4 w-4" /></Button>
        {onSaveAsNew && <Button size="sm" onClick={handleSaveAsNew} disabled={saving} title="Save as new"><SaveAll className="h-4 w-4" /></Button>}
        <Button size="sm" variant="outline" onClick={onCancel} title="Cancel"><X className="h-4 w-4" /></Button>
      </div>
    </div>
  )
}
