import type { ReactNode } from 'react'

type ListItemProps = {
  selected?: boolean
  onClick?: () => void
  children: ReactNode
  actions?: ReactNode
  className?: string
}

export default function ListItem({ selected, onClick, children, actions, className }: ListItemProps) {
  return (
    <div
      onClick={onClick}
      className={`rounded-lg border bg-card cursor-pointer ${selected ? 'ring-2 ring-inset ring-primary' : ''} ${className ?? ''}`}
    >
      <div className="px-3 py-2.5">{children}</div>
      {selected && actions && (
        <div className="flex gap-2 border-t mx-2 px-1 py-2" onClick={(e) => e.stopPropagation()}>
          {actions}
        </div>
      )}
    </div>
  )
}
