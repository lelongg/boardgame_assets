import { useState, useRef, useEffect } from 'react'
import { createPortal } from 'react-dom'

type PortalDropdownProps = {
  trigger: (props: { ref: React.Ref<HTMLButtonElement>; onClick: () => void }) => React.ReactNode
  children: (close: () => void) => React.ReactNode
  align?: 'left' | 'right'
}

export default function PortalDropdown({ trigger, children, align = 'right' }: PortalDropdownProps) {
  const [open, setOpen] = useState(false)
  const btnRef = useRef<HTMLButtonElement>(null)
  const menuRef = useRef<HTMLDivElement>(null)
  const [pos, setPos] = useState({ top: 0, left: 0 })

  useEffect(() => {
    if (!open) return
    if (btnRef.current) {
      const r = btnRef.current.getBoundingClientRect()
      setPos({
        top: r.bottom + 4,
        left: align === 'right' ? r.right : r.left,
      })
    }
    const onClickOutside = (e: MouseEvent) => {
      if (menuRef.current?.contains(e.target as Node)) return
      if (btnRef.current?.contains(e.target as Node)) return
      setOpen(false)
    }
    document.addEventListener('mousedown', onClickOutside)
    return () => document.removeEventListener('mousedown', onClickOutside)
  }, [open, align])

  return (
    <>
      {trigger({ ref: btnRef, onClick: () => setOpen(!open) })}
      {open && createPortal(
        <div
          ref={menuRef}
          className="fixed z-50 rounded-md border bg-popover p-1 shadow-md"
          style={{
            top: pos.top,
            left: pos.left,
            transform: align === 'right' ? 'translateX(-100%)' : undefined,
          }}
        >
          {children(() => setOpen(false))}
        </div>,
        document.body,
      )}
    </>
  )
}
