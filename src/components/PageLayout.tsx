import type { ReactNode } from 'react'
import { X } from 'lucide-react'
import { getProvider, BACKENDS } from '../storage'

type PageLayoutProps = {
  header: ReactNode
  status?: string
  errorDetail?: string | null
  onDismissError?: () => void
  maxWidth?: string
  children: ReactNode
}

export default function PageLayout({ header, status, errorDetail, onDismissError, maxWidth = 'max-w-7xl', children }: PageLayoutProps) {
  const active = BACKENDS.find(b => b.key === getProvider())
  const ActiveIcon = active?.icon

  return (
    <div className="min-h-screen">
      <header className="border-b bg-background px-4 py-2 md:px-7">
        <div className="flex items-center gap-3">
          {header}
          {status && (
            <span className="ml-auto text-sm text-muted-foreground hidden sm:inline">{status}</span>
          )}
          {ActiveIcon && (
            <span className="text-muted-foreground" title={active?.name}>
              <ActiveIcon className="h-4 w-4" />
            </span>
          )}
        </div>
        {errorDetail && (
          <div className="mt-2 flex items-start gap-2 rounded border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm text-destructive">
            <pre className="flex-1 whitespace-pre-wrap break-all font-mono text-xs">{errorDetail}</pre>
            {onDismissError && (
              <button className="shrink-0 opacity-60 hover:opacity-100" onClick={onDismissError}>
                <X className="h-3.5 w-3.5" />
              </button>
            )}
          </div>
        )}
      </header>
      <main className={`mx-auto ${maxWidth} px-4 py-4 md:px-7 md:py-4`}>
        {children}
      </main>
    </div>
  )
}
