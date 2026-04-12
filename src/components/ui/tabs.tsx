import * as React from "react"
import { useState, useCallback, useEffect } from "react"
import * as TabsPrimitive from "@radix-ui/react-tabs"

import { cn } from "@/lib/utils"

const Tabs = TabsPrimitive.Root

const TabsList = React.forwardRef<
  React.ElementRef<typeof TabsPrimitive.List>,
  React.ComponentPropsWithoutRef<typeof TabsPrimitive.List>
>(({ className, ...props }, ref) => {
  const innerRef = React.useRef<HTMLDivElement>(null)
  const [canScrollLeft, setCanScrollLeft] = useState(false)
  const [canScrollRight, setCanScrollRight] = useState(false)

  const updateScroll = useCallback(() => {
    const el = innerRef.current
    if (!el) return
    setCanScrollLeft(el.scrollLeft > 1)
    setCanScrollRight(el.scrollLeft + el.clientWidth < el.scrollWidth - 1)
  }, [])

  useEffect(() => {
    const el = innerRef.current
    if (!el) return
    updateScroll()
    const ro = new ResizeObserver(updateScroll)
    ro.observe(el)
    return () => ro.disconnect()
  }, [updateScroll])

  return (
    <div className="relative inline-flex max-w-full h-9">
      <TabsPrimitive.List
        ref={(node) => {
          (innerRef as React.MutableRefObject<HTMLDivElement | null>).current = node
          if (typeof ref === 'function') ref(node)
          else if (ref) (ref as React.MutableRefObject<HTMLDivElement | null>).current = node
        }}
        onScroll={updateScroll}
        className={cn(
          "inline-flex h-9 max-w-full items-center justify-start rounded-lg bg-muted p-1 text-muted-foreground overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden",
          className
        )}
        {...props}
      />
      {canScrollLeft && (
        <div className="pointer-events-none absolute left-0 inset-y-0 w-8 rounded-l-lg bg-gradient-to-r from-muted-foreground/25 to-transparent" />
      )}
      {canScrollRight && (
        <div className="pointer-events-none absolute right-0 inset-y-0 w-8 rounded-r-lg bg-gradient-to-l from-muted-foreground/25 to-transparent" />
      )}
    </div>
  )
})
TabsList.displayName = TabsPrimitive.List.displayName

const TabsTrigger = React.forwardRef<
  React.ElementRef<typeof TabsPrimitive.Trigger>,
  React.ComponentPropsWithoutRef<typeof TabsPrimitive.Trigger>
>(({ className, ...props }, ref) => (
  <TabsPrimitive.Trigger
    ref={ref}
    className={cn(
      "inline-flex items-center justify-center whitespace-nowrap rounded-md px-3 py-1 text-sm font-medium ring-offset-background transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 data-[state=active]:bg-background data-[state=active]:text-foreground data-[state=active]:shadow",
      className
    )}
    {...props}
  />
))
TabsTrigger.displayName = TabsPrimitive.Trigger.displayName

const TabsContent = React.forwardRef<
  React.ElementRef<typeof TabsPrimitive.Content>,
  React.ComponentPropsWithoutRef<typeof TabsPrimitive.Content>
>(({ className, ...props }, ref) => (
  <TabsPrimitive.Content
    ref={ref}
    className={cn(
      "mt-2 ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
      className
    )}
    {...props}
  />
))
TabsContent.displayName = TabsPrimitive.Content.displayName

export { Tabs, TabsList, TabsTrigger, TabsContent }
