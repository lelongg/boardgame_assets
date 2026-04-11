import { useState, useMemo } from 'react'

/** Simple fuzzy match: each character of the query must appear in order in the target. */
function fuzzyMatch(query: string, target: string): boolean {
  const q = query.toLowerCase()
  const t = target.toLowerCase()
  let qi = 0
  for (let ti = 0; ti < t.length && qi < q.length; ti++) {
    if (t[ti] === q[qi]) qi++
  }
  return qi === q.length
}

/** Returns [filteredItems, filterInput, query] — drop the input into any toolbar. */
export default function useFuzzyFilter<T>(items: T[], key: (item: T) => string): [T[], React.ReactNode, string] {
  const [query, setQuery] = useState('')
  const filtered = useMemo(
    () => query ? items.filter(item => fuzzyMatch(query, key(item))) : items,
    [items, query, key]
  )
  const input = (
    <input
      type="text"
      value={query}
      onChange={(e) => setQuery(e.target.value)}
      placeholder="Filter..."
      className="rounded-md border bg-background px-2 py-0.5 text-xs w-24 focus:w-32 transition-all"
    />
  )
  return [filtered, input, query]
}
