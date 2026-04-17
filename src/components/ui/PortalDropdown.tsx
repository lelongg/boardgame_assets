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
    const clamp = () => {
      if (!btnRef.current) return
      const r = btnRef.current.getBoundingClientRect()
      let top = r.bottom + 4
      let left = align === 'right' ? r.right : r.left
      // After first render, check menu size and clamp to viewport
      if (menuRef.current) {
        const m = menuRef.current.getBoundingClientRect()
        const effectiveLeft = align === 'right' ? left - m.width : left
        if (effectiveLeft + m.width > window.innerWidth - 8) left = window.innerWidth - 8 - m.width + (align === 'right' ? m.width : 0)
        if (effectiveLeft < 8) left = 8 + (align === 'right' ? m.width : 0)
        if (top + m.height > window.innerHeight - 8) top = r.top - m.height - 4
      }
      setPos({ top, left })
    }
    clamp()
    // Re-clamp after first render so menuRef is available
    requestAnimationFrame(clamp)
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
