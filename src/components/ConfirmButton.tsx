import { useState } from 'react'
import { Trash2, Check } from 'lucide-react'
import { Button } from '@/components/ui/button'

type ConfirmButtonProps = {
  onConfirm: () => void
  size?: 'sm' | 'default' | 'lg'
  variant?: 'destructive' | 'outline' | 'default' | 'ghost'
  disabled?: boolean
  iconOnly?: boolean
  title?: string
  label?: string
}

export default function ConfirmButton({
  onConfirm,
  size = 'sm',
  variant = 'destructive',
  disabled,
  iconOnly,
  title = 'Delete',
  label,
}: ConfirmButtonProps) {
  const [confirming, setConfirming] = useState(false)

  if (iconOnly) {
    return confirming ? (
      <button
        className="rounded p-1 text-destructive hover:text-destructive/80 transition-colors"
        onClick={() => { setConfirming(false); onConfirm() }}
        onBlur={() => setConfirming(false)}
        title="Confirm delete"
      >
        <Check className="h-4 w-4" />
      </button>
    ) : (
      <button
        className="rounded p-1 text-muted-foreground hover:text-destructive transition-colors disabled:opacity-30"
        disabled={disabled}
        onClick={() => setConfirming(true)}
        title={title}
      >
        <Trash2 className="h-4 w-4" />
      </button>
    )
  }

  if (confirming) {
    return (
      <Button
        size={size}
        variant={variant}
        onClick={() => { setConfirming(false); onConfirm() }}
        onBlur={() => setConfirming(false)}
        title="Confirm delete"
      >
        <Check className="h-4 w-4" />
        {label && <span className="ml-1">{label}</span>}
      </Button>
    )
  }

  return (
    <Button
      size={size}
      variant={variant}
      disabled={disabled}
      onClick={() => setConfirming(true)}
      title={title}
    >
      <Trash2 className="h-4 w-4" />
      {label && <span className="ml-1">{label}</span>}
    </Button>
  )
}
