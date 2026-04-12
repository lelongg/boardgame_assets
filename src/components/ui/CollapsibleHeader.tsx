import { useState } from 'react'
import { ChevronDown } from 'lucide-react'

type CollapsibleHeaderProps = {
  children: React.ReactNode
  toolbar?: React.ReactNode
  collapsed?: boolean
  onToggle?: () => void
}

export default function CollapsibleHeader({ children, toolbar, collapsed = false, onToggle }: CollapsibleHeaderProps) {
  return (
    <div
      className="flex items-center gap-1 h-10 shrink-0 px-2 border-b bg-card z-10 cursor-pointer select-none"
      onClick={onToggle}
    >
      <ChevronDown className={`h-4 w-4 text-muted-foreground transition-transform shrink-0 ${collapsed ? '-rotate-90' : ''}`} />
      {toolbar && <div className="flex items-center gap-1" onClick={(e) => e.stopPropagation()}>{toolbar}</div>}
      {children}
    </div>
  )
}

export function useCollapsible(key?: string) {
  const [collapsed, setCollapsed] = useState(() => {
    if (!key) return false
    try { return localStorage.getItem(key) === '1' } catch { return false }
  })
  const toggle = () => setCollapsed(c => {
    const next = !c
    if (key) localStorage.setItem(key, next ? '1' : '0')
    return next
  })
  return { collapsed, toggle }
}
