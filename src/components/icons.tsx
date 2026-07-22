type IconProps = {
  size?: number
  className?: string
}

function base(size: number, className?: string) {
  return {
    width: size,
    height: size,
    viewBox: '0 0 24 24',
    fill: 'none',
    stroke: 'currentColor',
    strokeWidth: 2.4,
    strokeLinecap: 'round' as const,
    strokeLinejoin: 'round' as const,
    className: `icon ${className ?? ''}`.trim(),
    'aria-hidden': true,
  }
}

export function IconFlame({ size = 22, className }: IconProps) {
  return (
    <svg {...base(size, className)}>
      <path d="M12 3c1 3-2 4-2 7a4 4 0 0 0 8 0c0-1-.3-2-1-3 .2 4-3 4-3 1 0-3-2-4-2-6Z" />
      <path d="M9 13a5 5 0 1 0 7 4.6" />
    </svg>
  )
}

export function IconTrophy({ size = 22, className }: IconProps) {
  return (
    <svg {...base(size, className)}>
      <path d="M7 4h10v4a5 5 0 0 1-10 0V4Z" />
      <path d="M7 6H4v1a3 3 0 0 0 3 3M17 6h3v1a3 3 0 0 1-3 3" />
      <path d="M10 14v3M14 14v3M8 20h8M9 17h6" />
    </svg>
  )
}

export function IconGauge({ size = 22, className }: IconProps) {
  return (
    <svg {...base(size, className)}>
      <path d="M5 19a8 8 0 1 1 14 0" />
      <path d="M12 14l4-3" />
      <circle cx="12" cy="14" r="1.4" fill="currentColor" stroke="none" />
    </svg>
  )
}

export function IconLock({ size = 22, className }: IconProps) {
  return (
    <svg {...base(size, className)}>
      <rect x="5" y="11" width="14" height="9" rx="2" />
      <path d="M8 11V8a4 4 0 0 1 8 0v3" />
    </svg>
  )
}

export function IconCheck({ size = 22, className }: IconProps) {
  return (
    <svg {...base(size, className)}>
      <path d="M5 12.5 10 17.5 19 6.5" />
    </svg>
  )
}

export function IconX({ size = 22, className }: IconProps) {
  return (
    <svg {...base(size, className)}>
      <path d="M6 6l12 12M18 6 6 18" />
    </svg>
  )
}

export function IconPlay({ size = 22, className }: IconProps) {
  return (
    <svg {...base(size, className)}>
      <path d="M8 5.5v13l10-6.5-10-6.5Z" />
    </svg>
  )
}

export function IconArrowRight({ size = 22, className }: IconProps) {
  return (
    <svg {...base(size, className)}>
      <path d="M5 12h13M13 6l6 6-6 6" />
    </svg>
  )
}

export function IconCompass({ size = 22, className }: IconProps) {
  return (
    <svg {...base(size, className)}>
      <circle cx="12" cy="12" r="9" />
      <path d="M15.5 8.5 13 13l-4.5 2.5L11 11l4.5-2.5Z" />
    </svg>
  )
}

export function IconBolt({ size = 22, className }: IconProps) {
  return (
    <svg {...base(size, className)}>
      <path d="M13 3 5 13h6l-2 8 8-10h-6l2-8Z" />
    </svg>
  )
}

export function IconCap({ size = 22, className }: IconProps) {
  return (
    <svg {...base(size, className)}>
      <path d="M2 9l10-4 10 4-10 4L2 9Z" />
      <path d="M6 11v4c0 1.5 2.7 3 6 3s6-1.5 6-3v-4" />
      <path d="M22 9v5" />
    </svg>
  )
}

export function IconTerminal({ size = 22, className }: IconProps) {
  return (
    <svg {...base(size, className)}>
      <rect x="3" y="4" width="18" height="16" rx="2.5" />
      <path d="M7 9l3 3-3 3M13 15h4" />
    </svg>
  )
}

export function IconArrowLeft({ size = 22, className }: IconProps) {
  return (
    <svg {...base(size, className)}>
      <path d="M19 12H6M11 6l-6 6 6 6" />
    </svg>
  )
}

export function IconGrid({ size = 22, className }: IconProps) {
  return (
    <svg {...base(size, className)}>
      <rect x="4" y="4" width="7" height="7" rx="1.5" />
      <rect x="13" y="4" width="7" height="7" rx="1.5" />
      <rect x="4" y="13" width="7" height="7" rx="1.5" />
      <rect x="13" y="13" width="7" height="7" rx="1.5" />
    </svg>
  )
}

export function IconSpeaker({ size = 22, className }: IconProps) {
  return (
    <svg {...base(size, className)}>
      <path d="M4 9v6h3l5 4V5L7 9H4Z" />
      <path d="M15.5 8.5a5 5 0 0 1 0 7M18 6a8 8 0 0 1 0 12" />
    </svg>
  )
}

export function IconSpeakerOff({ size = 22, className }: IconProps) {
  return (
    <svg {...base(size, className)}>
      <path d="M4 9v6h3l5 4V5L7 9H4Z" />
      <path d="M16 9.5l5 5M21 9.5l-5 5" />
    </svg>
  )
}
