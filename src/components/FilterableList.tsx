import { type ReactNode } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import useFuzzyFilter from '@/hooks/useFuzzyFilter'

type FilterableListProps<T> = {
  title: string
  items: T[]
  getKey: (item: T) => string
  getName: (item: T) => string
  renderItem: (item: T) => ReactNode
  toolbar?: ReactNode
  empty?: ReactNode
  maxHeight?: string
}

export default function FilterableList<T>({ title, items, getKey, getName, renderItem, toolbar, empty, maxHeight = '60vh' }: FilterableListProps<T>) {
  const [filtered, filterInput] = useFuzzyFilter(items, getName)

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between space-y-0">
        <CardTitle className="text-base">{title}</CardTitle>
        <div className="flex items-center gap-1">
          {filterInput}
          {toolbar}
        </div>
      </CardHeader>
      <CardContent className="overflow-y-auto space-y-2" style={{ maxHeight }}>
        {filtered.map(item => <div key={getKey(item)}>{renderItem(item)}</div>)}
        {items.length === 0 && empty}
      </CardContent>
    </Card>
  )
}
