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

const naturalCompare = new Intl.Collator(undefined, { numeric: true, sensitivity: 'base' }).compare

/** Returns [filteredItems, filterInput, query] — drop the input into any toolbar. */
export default function useFuzzyFilter<T>(items: T[], key: (item: T) => string): [T[], React.ReactNode, string] {
  const [query, setQuery] = useState('')
  const filtered = useMemo(
    () => {
      const base = query ? items.filter(item => fuzzyMatch(query, key(item))) : items
      return [...base].sort((a, b) => naturalCompare(key(a), key(b)))
    },
    [items, query, key]
  )
  const input = (
    <div className="relative">
      <input
        type="text"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder="Filter..."
        className="rounded-md border bg-background px-2 py-0.5 pr-6 text-xs w-24 focus:w-32 transition-all"
      />
      {query && (
        <button
          className="absolute right-1 top-1/2 -translate-y-1/2 rounded-full p-0.5 text-muted-foreground hover:text-foreground transition-colors"
          onClick={() => setQuery('')}
          title="Clear filter"
        >
          <svg className="h-3 w-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
        </button>
      )}
    </div>
  )
  return [filtered, input, query]
}
