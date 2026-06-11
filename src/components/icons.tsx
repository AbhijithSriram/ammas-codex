/* Icons - ported from the prototype's hand-drawn SVGs (amma-shared.jsx), as typed React
 * components. Stroke icons inherit currentColor; size via `s`. */

interface IconProps {
  s?: number
  className?: string
}

const stroke = {
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 2.1,
  strokeLinecap: 'round' as const,
  strokeLinejoin: 'round' as const,
}

const wrap = (s: number, className: string | undefined, children: React.ReactNode) => (
  <svg width={s} height={s} viewBox="0 0 24 24" className={className} {...stroke}>
    {children}
  </svg>
)

export const Mic = ({ s = 24, className }: IconProps) =>
  wrap(s, className, (
    <>
      <rect x="9" y="2.5" width="6" height="11" rx="3" />
      <path d="M5.5 11a6.5 6.5 0 0 0 13 0" />
      <path d="M12 17.5V21" />
    </>
  ))

export const Camera = ({ s = 24, className }: IconProps) =>
  wrap(s, className, (
    <>
      <path d="M3 8.5A1.5 1.5 0 0 1 4.5 7h2L8 4.8h8L17.5 7h2A1.5 1.5 0 0 1 21 8.5v9A1.5 1.5 0 0 1 19.5 19h-15A1.5 1.5 0 0 1 3 17.5z" />
      <circle cx="12" cy="13" r="3.5" />
    </>
  ))

export const Video = ({ s = 18, className }: IconProps) =>
  wrap(s, className, (
    <>
      <rect x="2.5" y="6" width="13" height="12" rx="2.5" />
      <path d="M15.5 10.5l5-3v9l-5-3z" />
    </>
  ))

export const Play = ({ s = 16, className }: IconProps) => (
  <svg width={s} height={s} viewBox="0 0 24 24" className={className} fill="currentColor" stroke="none">
    <path d="M7 4.5l12 7.5-12 7.5z" />
  </svg>
)

export const Stop = ({ s = 18, className }: IconProps) => (
  <svg width={s} height={s} viewBox="0 0 24 24" className={className} fill="currentColor" stroke="none">
    <rect x="6" y="6" width="12" height="12" rx="3" />
  </svg>
)

export const Wave = ({ s = 18, className }: IconProps) =>
  wrap(s, className, <path d="M3 12h2M7 8v8M11 4.5v15M15 8.5v7M19 11h2" />)

export const Plus = ({ s = 18, className }: IconProps) =>
  wrap(s, className, <path d="M12 5v14M5 12h14" />)

export const Minus = ({ s = 18, className }: IconProps) =>
  wrap(s, className, <path d="M5 12h14" />)

export const Flag = ({ s = 18, className }: IconProps) =>
  wrap(s, className, <path d="M6 21V4M6 4.5h11l-2 3.5 2 3.5H6" />)

export const Scale = ({ s = 18, className }: IconProps) =>
  wrap(s, className, <path d="M12 3v3M5 6h14M5 6l-2.5 6a3 3 0 0 0 6 0L6 6M19 6l-2.5 6a3 3 0 0 0 6 0L20 6M9 21h6M12 6v15" />)

export const Pot = ({ s = 18, className }: IconProps) =>
  wrap(s, className, <path d="M4 9h16M3 9l1.4 8.4A2 2 0 0 0 6.4 19h11.2a2 2 0 0 0 2-1.6L21 9M2 7h2M20 7h2M9 5.5c0-1 .8-1.5 1.5-1 .8.6 2 .3 2.5-1" />)

export const Pause = ({ s = 17, className }: IconProps) =>
  wrap(s, className, <path d="M8 5v14M16 5v14" />)

export const Chevron = ({
  s = 22,
  className,
  dir = 'left',
}: IconProps & { dir?: 'left' | 'right' | 'up' | 'down' }) => (
  <svg
    width={s}
    height={s}
    viewBox="0 0 24 24"
    className={className}
    {...stroke}
    style={{
      transform:
        dir === 'right' ? 'rotate(180deg)' : dir === 'up' ? 'rotate(90deg)' : dir === 'down' ? 'rotate(-90deg)' : 'none',
    }}
  >
    <path d="M15 5l-7 7 7 7" />
  </svg>
)

export const Search = ({ s = 20, className }: IconProps) =>
  wrap(s, className, (
    <>
      <circle cx="11" cy="11" r="7" />
      <path d="M20 20l-4-4" />
    </>
  ))

export const Check = ({ s = 18, className }: IconProps) =>
  wrap(s, className, <path d="M5 12.5l4.5 4.5L19 6.5" />)

export const Close = ({ s = 20, className }: IconProps) =>
  wrap(s, className, <path d="M6 6l12 12M18 6L6 18" />)

export const Trash = ({ s = 18, className }: IconProps) =>
  wrap(s, className, <path d="M4 7h16M9 7V5h6v2M6 7l1 13a1 1 0 0 0 1 1h8a1 1 0 0 0 1-1l1-13M10 11v6M14 11v6" />)

export const Clock = ({ s = 18, className }: IconProps) =>
  wrap(s, className, (
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 7v5l3.5 2" />
    </>
  ))

export const Sun = ({ s = 18, className }: IconProps) =>
  wrap(s, className, (
    <>
      <circle cx="12" cy="12" r="4.5" />
      <path d="M12 2v2M12 20v2M4 12H2M22 12h-2M5 5l1.5 1.5M17.5 17.5L19 19M19 5l-1.5 1.5M6.5 17.5L5 19" />
    </>
  ))

export const Moon = ({ s = 18, className }: IconProps) =>
  wrap(s, className, <path d="M20 14.5A8 8 0 0 1 9.5 4a7 7 0 1 0 10.5 10.5z" />)

export const Retry = ({ s = 18, className }: IconProps) =>
  wrap(s, className, <path d="M4 12a8 8 0 1 1 2.3 5.6M4 19v-4h4" />)

export const Cloud = ({ s = 18, className }: IconProps) =>
  wrap(s, className, <path d="M7 18h10a4 4 0 0 0 .5-7.97 6 6 0 0 0-11.6-1.2A3.5 3.5 0 0 0 6.5 18z" />)
