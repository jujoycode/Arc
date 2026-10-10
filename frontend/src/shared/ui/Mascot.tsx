import type { CSSProperties } from 'react'
import { cn } from '@/shared/lib/cn'
import './mascot.css'

export type MascotVariant = 'welcome' | 'deliver' | 'celebrate' | 'idle'

export function Mascot({ variant = 'idle', size = 120, label, className }: {
  variant?: MascotVariant;
  size?: number;
  label?: string;
  className?: string;
}) {
  return <figure className={cn('arcat-mascot', `arcat-mascot-${variant}`, className)} style={{ '--arcat-mascot-size': `${size}px` } as CSSProperties}>
    <div className="arcat-mascot-picture" aria-hidden="true"><img src="/brand/postcat.png" alt="" draggable={false} /><span className="arcat-mascot-spark arcat-mascot-spark-one" /><span className="arcat-mascot-spark arcat-mascot-spark-two" /></div>
    {label && <figcaption>{label}</figcaption>}
  </figure>
}

export function ArcatBrand({ className, compact = false }: { className?: string; compact?: boolean }) {
  return <span className={cn('arcat-brand', compact && 'arcat-brand-compact', className)}><img src="/brand/arcat-mark.png" alt="" width={40} height={40} /><span>arcat</span></span>
}
