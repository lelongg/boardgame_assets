type AnchorGridProps = {
  value: { x: number; y: number }
  onChange: (value: { x: number; y: number }) => void
}

const POINTS = [
  { x: 0, y: 0 }, { x: 0.5, y: 0 }, { x: 1, y: 0 },
  { x: 0, y: 0.5 }, { x: 0.5, y: 0.5 }, { x: 1, y: 0.5 },
  { x: 0, y: 1 }, { x: 0.5, y: 1 }, { x: 1, y: 1 },
]

export default function AnchorGrid({ value, onChange }: AnchorGridProps) {
  return (
    <div className="grid grid-cols-3 gap-1 w-24">
      {POINTS.map((pt) => {
        const active = Math.abs(pt.x - value.x) < 0.01 && Math.abs(pt.y - value.y) < 0.01
        return (
          <button
            key={`${pt.x}-${pt.y}`}
            onClick={() => onChange(pt)}
            className={`h-7 w-7 rounded border text-xs transition-colors ${
              active
                ? 'bg-primary text-primary-foreground border-primary'
                : 'bg-background border-input hover:bg-accent/50'
            }`}
          >
            {active ? '●' : '○'}
          </button>
        )
      })}
    </div>
  )
}
