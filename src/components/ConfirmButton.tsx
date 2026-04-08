import { useState } from 'react'
import { Button } from '@/components/ui/button'

type ConfirmButtonProps = {
  onConfirm: () => void
  label?: string
  confirmLabel?: string
  size?: 'sm' | 'default' | 'lg'
  variant?: 'destructive' | 'outline' | 'default' | 'ghost'
  disabled?: boolean
}

export default function ConfirmButton({
  onConfirm,
  label = 'Delete',
  confirmLabel = 'Confirm',
  size = 'sm',
  variant = 'destructive',
  disabled,
}: ConfirmButtonProps) {
  const [confirming, setConfirming] = useState(false)

  if (confirming) {
    return (
      <Button
        size={size}
        variant={variant}
        onClick={() => { setConfirming(false); onConfirm() }}
        onBlur={() => setConfirming(false)}
      >
        {confirmLabel}
      </Button>
    )
  }

  return (
    <Button
      size={size}
      variant={variant}
      disabled={disabled}
      onClick={() => setConfirming(true)}
    >
      {label}
    </Button>
  )
}
