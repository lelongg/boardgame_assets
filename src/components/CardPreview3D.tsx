import { useState } from 'react'

type CardPreview3DProps = {
  frontSrc: string
  backSrc?: string
  backFit?: 'cover' | 'contain' | 'fill'
  aspectRatio?: number
  radius?: number
}

export default function CardPreview3D({ frontSrc, backSrc, backFit = 'cover', aspectRatio = 1.4, radius = 0.04 }: CardPreview3DProps) {
  const [flipped, setFlipped] = useState(false)
  const width = 250
  const height = width * aspectRatio
  const borderRadius = width * radius

  return (
    <div
      className="cursor-pointer"
      style={{ perspective: 800, width, height }}
      onClick={() => backSrc && setFlipped(!flipped)}
      title={backSrc ? 'Click to flip' : undefined}
    >
      <div
        style={{
          width: '100%',
          height: '100%',
          position: 'relative',
          transformStyle: 'preserve-3d',
          transition: 'transform 0.6s',
          transform: flipped ? 'rotateY(180deg)' : 'rotateY(0deg)',
        }}
      >
        {/* Front */}
        <div
          style={{
            position: 'absolute',
            width: '100%',
            height: '100%',
            backfaceVisibility: 'hidden',
            borderRadius,
            overflow: 'hidden',
          }}
        >
          <img
            src={frontSrc}
            alt="Card front"
            className="w-full h-full drop-shadow-lg"
            draggable={false}
            style={{ borderRadius }}
          />
        </div>

        {/* Back */}
        {backSrc && (
          <div
            style={{
              position: 'absolute',
              width: '100%',
              height: '100%',
              backfaceVisibility: 'hidden',
              transform: 'rotateY(180deg)',
              borderRadius,
              overflow: 'hidden',
              background: '#ffffff',
            }}
          >
            <img
              src={backSrc}
              alt="Card back"
              className="w-full h-full drop-shadow-lg"
              draggable={false}
              style={{
                borderRadius,
                objectFit: backFit === 'contain' ? 'contain' : backFit === 'fill' ? 'fill' : 'cover',
              }}
            />
          </div>
        )}
      </div>
    </div>
  )
}
