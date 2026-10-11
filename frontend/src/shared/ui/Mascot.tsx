import { useRef, type CSSProperties } from 'react'
import { cn } from '@/shared/lib/cn'
import { useMascotPointer } from '@/shared/lib/useMascotPointer'
import './mascot.css'

export type MascotVariant = 'welcome' | 'deliver' | 'celebrate' | 'idle'

export function Mascot({ variant = 'idle', size = 120, label, className, interactive = false, privacy = false }: {
  variant?: MascotVariant;
  size?: number;
  label?: string;
  className?: string;
  interactive?: boolean;
  privacy?: boolean;
}) {
  const picture = useRef<HTMLDivElement>(null)
  const tracking = useMascotPointer(picture, interactive && !privacy)
  const pose = privacy ? 'private' : tracking ? 'look' : interactive ? 'welcome' : variant === 'deliver' ? 'delivery' : variant === 'celebrate' ? 'celebrate' : 'welcome'
  const image = `/brand/postcat${pose === 'welcome' ? '' : `-${pose}`}.png`
  return <figure className={cn('arcat-mascot', `arcat-mascot-${variant}`, className)} style={{ '--arcat-mascot-size': `${size}px` } as CSSProperties} data-interactive={interactive} data-tracking={tracking && !privacy ? 'active' : 'inactive'} data-private={privacy} data-pose={pose}>
    <div ref={picture} className="arcat-mascot-picture" aria-hidden="true"><div className="arcat-mascot-motion"><img src={image} alt="" draggable={false} onLoad={event => {
      const image = event.currentTarget
      if (image.naturalWidth && image.naturalHeight) picture.current?.style.setProperty('--arcat-mascot-ratio', `${image.naturalWidth} / ${image.naturalHeight}`)
    }} />{tracking && !privacy && <div className="arcat-mascot-eyes"><span className="arcat-mascot-eye arcat-mascot-eye-left"><span /></span><span className="arcat-mascot-eye arcat-mascot-eye-right"><span /></span></div>}<span className="arcat-mascot-spark arcat-mascot-spark-one" /><span className="arcat-mascot-spark arcat-mascot-spark-two" /></div></div>
    {label && <figcaption>{label}</figcaption>}
  </figure>
}

export function ArcatBrand({ className, compact = false }: { className?: string; compact?: boolean }) {
  return <span className={cn('arcat-brand', compact && 'arcat-brand-compact', className)}><img src="/brand/arcat-mark.png" alt="" width={40} height={40} /><span>arcat</span></span>
}
