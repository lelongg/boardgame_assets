import React from 'react'
import ReactDOM from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import App from './App.tsx'
import './index.css'
import { getAsset } from './storage/assetCache'
import { StorageProvider } from './hooks/useStorage'

// Restore SPA route after GitHub Pages 404 redirect
const redirectPath = sessionStorage.getItem('redirectPath')
if (redirectPath) {
  sessionStorage.removeItem('redirectPath')
  const base = import.meta.env.BASE_URL.replace(/\/$/, '')
  if (redirectPath.startsWith(base + '/')) {
    const route = redirectPath.slice(base.length)
    if (route !== '/' && route !== window.location.pathname) {
      history.replaceState(null, '', route)
    }
  }
}

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      refetchOnWindowFocus: true,
      retry: 1,
    },
  },
})

if ("serviceWorker" in navigator && import.meta.env.PROD) {
  navigator.serviceWorker.register(import.meta.env.BASE_URL + "sw.js").catch(() => {});
}

// Fallback for when SW isn't available (dev mode): intercept asset fetches
const ASSET_PATTERN = /^\/api\/games\/[^/]+\/(fonts|images)\/[^/]+$/
const originalFetch = window.fetch.bind(window)
window.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
  const url = typeof input === 'string' ? input : input instanceof URL ? input.pathname : (input as Request).url
  const pathname = url.startsWith('http') ? new URL(url).pathname : url
  if (ASSET_PATTERN.test(pathname)) {
    try {
      const resp = await originalFetch(input, init)
      if (resp.ok) return resp
      // Network failed, try asset cache
      const entry = await getAsset(pathname)
      if (entry) return new Response(entry.blob, { headers: { 'Content-Type': entry.mimeType } })
      return resp
    } catch {
      const entry = await getAsset(pathname)
      if (entry) return new Response(entry.blob, { headers: { 'Content-Type': entry.mimeType } })
      throw new Error(`Asset not found: ${pathname}`)
    }
  }
  return originalFetch(input, init)
}

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <StorageProvider>
      <QueryClientProvider client={queryClient}>
        <BrowserRouter basename={import.meta.env.BASE_URL}>
          <App />
        </BrowserRouter>
      </QueryClientProvider>
    </StorageProvider>
  </React.StrictMode>,
)
