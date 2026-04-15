import * as React from "react"
import { cn } from "@/lib/utils"
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from "@/components/ui/select"

/* ---------- shared wrapper ---------- */

function FloatingWrapper({
  children,
  label,
  className,
  hasValue,
  focused,
}: {
  children: React.ReactNode
  label: string
  className?: string
  hasValue: boolean
  focused: boolean
}) {
  const lifted = focused || hasValue
  return (
    <div className={cn("relative", className)}>
      {children}
      <span
        className={cn(
          "pointer-events-none absolute left-2.5 bg-card px-1 text-muted-foreground transition-all duration-150",
          lifted
            ? "-top-2.5 text-xs"
            : "top-1/2 -translate-y-1/2 text-sm",
          focused && "text-primary",
        )}
      >
        {label}
      </span>
    </div>
  )
}

/* ---------- FloatingInput ---------- */

export interface FloatingInputProps
  extends React.InputHTMLAttributes<HTMLInputElement> {
  label: string
}

const FloatingInput = React.forwardRef<HTMLInputElement, FloatingInputProps>(
  ({ label, className, value, defaultValue, ...props }, ref) => {
    const [focused, setFocused] = React.useState(false)
    const hasValue = value != null ? String(value).length > 0 : false

    return (
      <FloatingWrapper label={label} hasValue={hasValue} focused={focused}>
        <input
          ref={ref}
          value={value}
          defaultValue={defaultValue}
          onFocus={(e) => { setFocused(true); props.onFocus?.(e) }}
          onBlur={(e) => { setFocused(false); props.onBlur?.(e) }}
          className={cn(
            "flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm transition-colors placeholder:text-transparent focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50",
            className,
          )}
          {...props}
        />
      </FloatingWrapper>
    )
  },
)
FloatingInput.displayName = "FloatingInput"

/* ---------- FloatingTextarea ---------- */

export interface FloatingTextareaProps
  extends React.TextareaHTMLAttributes<HTMLTextAreaElement> {
  label: string
}

const FloatingTextarea = React.forwardRef<
  HTMLTextAreaElement,
  FloatingTextareaProps
>(({ label, className, value, defaultValue, ...props }, ref) => {
  const [focused, setFocused] = React.useState(false)
  const hasValue = value != null ? String(value).length > 0 : false

  return (
    <FloatingWrapper label={label} hasValue={hasValue} focused={focused}>
      <textarea
        ref={ref}
        value={value}
        defaultValue={defaultValue}
        onFocus={(e) => { setFocused(true); props.onFocus?.(e) }}
        onBlur={(e) => { setFocused(false); props.onBlur?.(e) }}
        className={cn(
          "flex min-h-[60px] w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-sm placeholder:text-transparent focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50",
          className,
        )}
        {...props}
      />
    </FloatingWrapper>
  )
})
FloatingTextarea.displayName = "FloatingTextarea"

/* ---------- FloatingSelect ---------- */

export interface FloatingSelectProps {
  label: string
  value?: string
  onValueChange?: (value: string) => void
  options: { value: string; label: string }[]
  className?: string
  triggerClassName?: string
  placeholder?: string
}

const EMPTY_SENTINEL = '__none__'

function FloatingSelect({
  label, value, onValueChange, options, className, triggerClassName, placeholder,
}: FloatingSelectProps) {
  const uniqueOptions = options
    .filter((opt, i, arr) => arr.findIndex(o => o.value === opt.value) === i)
    .map(opt => opt.value === '' ? { value: EMPTY_SENTINEL, label: opt.label || '(none)' } : opt)
  const selectValue = value === '' ? EMPTY_SENTINEL : (value ?? '')
  const handleChange = (v: string) => onValueChange?.(v === EMPTY_SENTINEL ? '' : v)

  return (
    <Select value={selectValue} onValueChange={handleChange}>
      <div className={cn("relative", className)}>
        <SelectTrigger className={triggerClassName}>
          <SelectValue placeholder={placeholder} />
        </SelectTrigger>
        <span className="pointer-events-none absolute left-2.5 -top-2.5 bg-card px-1 text-xs text-muted-foreground">
          {label}
        </span>
      </div>
      <SelectContent>
        {uniqueOptions.map((opt) => (
          <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>
        ))}
      </SelectContent>
    </Select>
  )
}
FloatingSelect.displayName = "FloatingSelect"

/* ---------- FloatingNumberInput ---------- */

export interface FloatingNumberInputProps
  extends Omit<React.InputHTMLAttributes<HTMLInputElement>, 'value' | 'onChange' | 'type'> {
  label: string
  value: number
  onChange: (value: number) => void
}

const FloatingNumberInput = React.forwardRef<HTMLInputElement, FloatingNumberInputProps>(
  ({ label, className, value, onChange, onFocus, onBlur, onKeyDown, ...props }, ref) => {
    const [focused, setFocused] = React.useState(false)
    const [localText, setLocalText] = React.useState(String(value))

    // Sync from parent when not focused
    const prevValue = React.useRef(value)
    if (value !== prevValue.current) {
      prevValue.current = value
      if (!focused) setLocalText(String(value))
    }

    const commit = (text: string) => {
      const n = Number(text)
      if (!isNaN(n) && text !== '') {
        // Only enforce min (hard floor), no max ceiling
        const min = props.min != null ? Number(props.min) : -Infinity
        const floored = Math.max(min, n)
        onChange(floored)
        setLocalText(String(floored))
      } else {
        setLocalText(String(value))
      }
    }

    const displayValue = focused ? localText : String(value)
    const hasValue = displayValue.length > 0

    return (
      <FloatingWrapper label={label} hasValue={hasValue} focused={focused}>
        <input
          ref={ref}
          inputMode="decimal"
          value={displayValue}
          onFocus={(e) => { setFocused(true); setLocalText(String(value)); onFocus?.(e) }}
          onBlur={(e) => { setFocused(false); commit(localText); onBlur?.(e) }}
          onChange={(e) => setLocalText(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') commit(localText); onKeyDown?.(e) }}
          className={cn(
            "flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm transition-colors placeholder:text-transparent focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50",
            className,
          )}
          {...props}
        />
      </FloatingWrapper>
    )
  },
)
FloatingNumberInput.displayName = "FloatingNumberInput"

export { FloatingInput, FloatingTextarea, FloatingSelect, FloatingNumberInput }
