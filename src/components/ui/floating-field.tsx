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

function FloatingSelect({
  label, value, onValueChange, options, className, triggerClassName, placeholder,
}: FloatingSelectProps) {
  return (
    <Select value={value} onValueChange={onValueChange}>
      <div className={cn("relative", className)}>
        <SelectTrigger className={triggerClassName}>
          <SelectValue placeholder={placeholder} />
        </SelectTrigger>
        <span className="pointer-events-none absolute left-2.5 -top-2.5 bg-card px-1 text-xs text-muted-foreground">
          {label}
        </span>
      </div>
      <SelectContent>
        {options.map((opt) => (
          <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>
        ))}
      </SelectContent>
    </Select>
  )
}
FloatingSelect.displayName = "FloatingSelect"

export { FloatingInput, FloatingTextarea, FloatingSelect }
