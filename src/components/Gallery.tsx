import { useState, type ReactNode } from 'react'
import { Minus, Plus } from 'lucide-react'
import useFuzzyFilter from '@/hooks/useFuzzyFilter'

type GalleryProps<T> = {
  items: T[]
  getKey: (item: T) => string
  getName: (item: T) => string
  renderItem: (item: T, filtered: T[]) => ReactNode
  colsKey: string
  defaultCols?: number
  toolbar?: ReactNode
  maxHeight?: string
}

export default function Gallery<T>({ items, getKey, getName, renderItem, colsKey, defaultCols = 4, toolbar, maxHeight = '70vh' }: GalleryProps<T>) {
  const [cols, setCols] = useState(() => { try { return Number(localStorage.getItem(colsKey)) || defaultCols } catch { return defaultCols } })
  const [filtered, filterInput] = useFuzzyFilter(items, getName)

  return (
    <div className="rounded-lg border bg-card overflow-y-auto" style={{ maxHeight }}>
      <div className="flex items-center gap-1 p-2 border-b sticky top-0 bg-card z-10">
        <div className="flex items-center gap-1">
          <button className="rounded p-1 text-muted-foreground hover:text-foreground disabled:opacity-30" disabled={cols <= 1}
            onClick={() => setCols(c => { const v = Math.max(1, c - 1); localStorage.setItem(colsKey, String(v)); return v })} title="Larger">
            <Minus className="h-4 w-4" />
          </button>
          <span className="text-xs text-muted-foreground w-6 text-center">{cols}</span>
          <button className="rounded p-1 text-muted-foreground hover:text-foreground disabled:opacity-30" disabled={cols >= 8}
            onClick={() => setCols(c => { const v = Math.min(8, c + 1); localStorage.setItem(colsKey, String(v)); return v })} title="Smaller">
            <Plus className="h-4 w-4" />
          </button>
        </div>
        {filterInput}
        {toolbar && <div className="ml-auto flex items-center gap-1">{toolbar}</div>}
      </div>
      <div className="grid gap-3 p-4" style={{ gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))` }}>
        {filtered.map(item => <div key={getKey(item)}>{renderItem(item, filtered)}</div>)}
      </div>
    </div>
  )
}
