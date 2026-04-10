import { useState, type ImgHTMLAttributes } from 'react'

type Props = ImgHTMLAttributes<HTMLImageElement> & {
  wrapperClassName?: string
}

export default function LoadingImg({ wrapperClassName, className, src, ...rest }: Props) {
  const [loaded, setLoaded] = useState(false)
  const [prevSrc, setPrevSrc] = useState(src)

  if (src !== prevSrc) {
    setPrevSrc(src)
    setLoaded(false)
  }

  const showPlaceholder = !loaded && !!src

  return (
    <div className={`relative ${wrapperClassName ?? ''}`}>
      {showPlaceholder && (
        <div className="absolute inset-0 overflow-hidden rounded bg-muted/30">
          <div className="absolute inset-0 -translate-x-full animate-[shimmer_1.5s_ease-in-out_infinite] bg-gradient-to-r from-transparent via-muted-foreground/[0.07] to-transparent" />
        </div>
      )}
      {src && (
        <img
          src={src}
          className={`${className ?? ''} transition-opacity duration-200 ${showPlaceholder ? 'opacity-0' : 'opacity-100'}`}
          onLoad={() => setLoaded(true)}
          onError={() => setLoaded(true)}
          {...rest}
        />
      )}
    </div>
  )
}
