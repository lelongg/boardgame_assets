import LoadingImg from './LoadingImg'

type CardThumbnailProps = {
  src: string
  name: string
  selected?: boolean
  onClick?: () => void
  badge?: React.ReactNode
}

export default function CardThumbnail({ src, name, selected, onClick, badge }: CardThumbnailProps) {
  return (
    <div
      className={`relative rounded-md cursor-pointer transition-all ${selected ? 'outline outline-2 outline-primary' : 'outline outline-1 outline-border'}`}
      onClick={onClick}
    >
      <div
        className="rounded-t-md overflow-hidden"
        style={{ aspectRatio: '5 / 7', padding: '3%', backgroundImage: 'repeating-conic-gradient(#e5e5e5 0% 25%, transparent 0% 50%)', backgroundSize: '12px 12px' }}
      >
        <LoadingImg src={src} alt={name} className="w-full h-full drop-shadow-md object-contain" wrapperClassName="w-full h-full" />
      </div>
      <div className="flex items-center gap-1 px-2 py-1">
        <span className="text-xs truncate flex-1 text-center text-muted-foreground">{name}</span>
        {badge}
      </div>
    </div>
  )
}
