import { useState, type ImgHTMLAttributes } from 'react'
import { ImageOff } from 'lucide-react'
import useAssetUrl from '../hooks/useAssetUrl'

type Props = ImgHTMLAttributes<HTMLImageElement> & {
  wrapperClassName?: string
}

export default function LoadingImg({ wrapperClassName, className, src, ...rest }: Props) {
  const resolvedSrc = useAssetUrl(src)
  const [loaded, setLoaded] = useState(false)
  const [errored, setErrored] = useState(false)
  const [prevSrc, setPrevSrc] = useState(src)

  if (src !== prevSrc) {
    setPrevSrc(src)
    setLoaded(false)
    setErrored(false)
  }

  const showShimmer = !loaded && !errored && !!src

  return (
    <div className={`relative ${wrapperClassName ?? ''}`}>
      {showShimmer && (
        <div className="absolute inset-0 overflow-hidden rounded bg-muted/30">
          <div className="absolute inset-0 -translate-x-full animate-[shimmer_1.5s_ease-in-out_infinite] bg-gradient-to-r from-transparent via-muted-foreground/[0.07] to-transparent" />
        </div>
      )}
      {(!src || errored) ? (
        <div className={`flex items-center justify-center rounded bg-muted/30 text-muted-foreground/40 ${className ?? ''}`} style={{ minHeight: 48 }}>
          <ImageOff className="h-5 w-5" />
        </div>
      ) : resolvedSrc ? (
        <img
          src={resolvedSrc}
          className={`${className ?? ''} transition-opacity duration-200 ${showShimmer ? 'opacity-0' : 'opacity-100'}`}
          onLoad={() => setLoaded(true)}
          onError={() => setErrored(true)}
          {...rest}
        />
      ) : null}
    </div>
  )
}
