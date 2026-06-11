import type { ReactNode } from 'react'
import { Chevron } from './icons'

export function IconButton({
  onClick,
  children,
  label,
  className,
}: {
  onClick: () => void
  children: ReactNode
  label: string
  className?: string
}) {
  return (
    <button className={'icon-btn ' + (className ?? '')} onClick={onClick} aria-label={label} type="button">
      {children}
    </button>
  )
}

export function BackButton({ onClick }: { onClick: () => void }) {
  return (
    <IconButton onClick={onClick} label="Back">
      <Chevron />
    </IconButton>
  )
}

export function EmptyState({
  title,
  children,
  action,
}: {
  title: string
  children: ReactNode
  action?: ReactNode
}) {
  return (
    <div className="empty">
      <div className="empty-title disp">{title}</div>
      <div className="empty-sub">{children}</div>
      {action}
    </div>
  )
}

/** A scrollable region that hides its scrollbar, matching the prototype's calm surfaces. */
export function Scroll({ children, className, style }: { children: ReactNode; className?: string; style?: React.CSSProperties }) {
  return (
    <div className={'no-scrollbar ' + (className ?? '')} style={{ overflowY: 'auto', ...style }}>
      {children}
    </div>
  )
}
