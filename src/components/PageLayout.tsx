import type { ReactNode } from 'react'

type PageLayoutProps = {
  header: ReactNode
  status?: string
  maxWidth?: string
  children: ReactNode
}

export default function PageLayout({ header, status, maxWidth = 'max-w-7xl', children }: PageLayoutProps) {
  return (
    <div className="min-h-screen">
      <header className="border-b bg-background px-4 py-2 md:px-7">
        <div className="flex items-center gap-3">
          {header}
          {status && (
            <span className="ml-auto text-sm text-muted-foreground hidden sm:inline">{status}</span>
          )}
        </div>
      </header>
      <main className={`mx-auto ${maxWidth} px-4 py-4 md:px-7 md:py-4`}>
        {children}
      </main>
    </div>
  )
}
