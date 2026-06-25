import './CodeBot.css'

export type CodeBotMood = 'idle' | 'happy' | 'thinking' | 'celebrate' | 'sad'

const BODY_BY_STAGE = [
  '#dfe2f2',
  '#d2d6f0',
  '#c9c2ff',
  '#bcb0ff',
  '#a892ff',
  '#8f73ff',
  '#6d4afe',
]

function bodyColor(stage: number): string {
  const i = Math.max(0, Math.min(BODY_BY_STAGE.length - 1, stage))
  return BODY_BY_STAGE[i]
}

function Face({ mood, glow }: { mood: CodeBotMood; glow: string }) {
  switch (mood) {
    case 'happy':
      return (
        <g>
          <path d="M45 62 Q50 54 55 62" fill="none" stroke={glow} strokeWidth={3.5} strokeLinecap="round" />
          <path d="M65 62 Q70 54 75 62" fill="none" stroke={glow} strokeWidth={3.5} strokeLinecap="round" />
          <circle cx={44} cy={70} r={3} fill="#ff9ec7" opacity={0.85} />
          <circle cx={76} cy={70} r={3} fill="#ff9ec7" opacity={0.85} />
          <path d="M49 70 Q60 82 71 70" fill="none" stroke={glow} strokeWidth={3.5} strokeLinecap="round" />
        </g>
      )
    case 'thinking':
      return (
        <g>
          <circle cx={50} cy={60} r={5} fill={glow} />
          <path d="M66 60 L74 60" stroke={glow} strokeWidth={3.5} strokeLinecap="round" />
          <path d="M54 74 L64 74" stroke={glow} strokeWidth={3} strokeLinecap="round" />
        </g>
      )
    case 'celebrate':
      return (
        <g>
          <Sparkle cx={50} cy={60} glow={glow} />
          <Sparkle cx={70} cy={60} glow={glow} />
          <rect x={53} y={70} width={14} height={10} rx={5} fill={glow} />
        </g>
      )
    case 'sad':
      return (
        <g>
          <circle cx={50} cy={60} r={5} fill={glow} />
          <circle cx={70} cy={60} r={5} fill={glow} />
          <path d="M51 77 Q60 70 69 77" fill="none" stroke={glow} strokeWidth={3.2} strokeLinecap="round" />
          <path d="M48 66 q-2 5 0 7 q2 -2 0 -7" fill="#39e0ff" opacity={0.8} />
        </g>
      )
    case 'idle':
    default:
      return (
        <g>
          <circle cx={50} cy={60} r={5} fill={glow} />
          <circle cx={70} cy={60} r={5} fill={glow} />
          <circle cx={48} cy={58} r={1.6} fill="#ffffff" opacity={0.9} />
          <circle cx={68} cy={58} r={1.6} fill="#ffffff" opacity={0.9} />
          <path d="M53 73 Q60 78 67 73" fill="none" stroke={glow} strokeWidth={3} strokeLinecap="round" />
        </g>
      )
  }
}

function Sparkle({ cx, cy, glow }: { cx: number; cy: number; glow: string }) {
  return (
    <path
      d={`M${cx} ${cy - 7} L${cx + 2} ${cy - 2} L${cx + 7} ${cy} L${cx + 2} ${cy + 2} L${cx} ${cy + 7} L${cx - 2} ${cy + 2} L${cx - 7} ${cy} L${cx - 2} ${cy - 2} Z`}
      fill={glow}
    />
  )
}

export function CodeBot({
  stage = 0,
  mood = 'idle',
  size = 160,
  accent,
  title,
  className = '',
}: {
  stage?: number
  mood?: CodeBotMood
  size?: number
  accent?: string
  title?: string
  className?: string
}) {
  const body = bodyColor(stage)
  const glow = accent ?? '#39e0ff'
  const ink = '#1a1730'
  const antennaTip = accent ?? (stage >= 1 ? '#14d39a' : '#9a93c0')
  const showAntenna = stage < 5
  const showCrown = stage >= 5
  const showVisor = stage >= 2
  const showEars = stage >= 3
  const showBadge = stage >= 4
  const showAura = stage >= 6

  return (
    <div
      className={`codebot codebot--${mood} ${className}`}
      style={{ width: size, height: size }}
      role="img"
      aria-label={title ?? 'CodeBot'}
    >
      <svg viewBox="0 0 120 132" width={size} height={size} className="codebot-svg">
        {showAura && (
          <circle
            className="codebot-aura"
            cx={60}
            cy={64}
            r={54}
            fill="none"
            stroke="#ffd23f"
            strokeWidth={3}
            strokeDasharray="6 10"
            strokeLinecap="round"
          />
        )}

        <ellipse className="codebot-shadow" cx={60} cy={118} rx={30} ry={6} fill="rgba(26,23,48,0.16)" />

        <g className="codebot-bob">
          {/* antenna or crown */}
          {showAntenna && (
            <g>
              <path d="M60 31 L60 18" stroke={ink} strokeWidth={4} strokeLinecap="round" />
              <circle className="codebot-antenna-tip" cx={60} cy={14} r={7} fill={antennaTip} stroke={ink} strokeWidth={3.5} />
              {stage >= 1 && <circle cx={57} cy={11} r={1.8} fill="#ffffff" opacity={0.9} />}
            </g>
          )}
          {showCrown && (
            <path
              d="M44 30 L48 17 L54 27 L60 14 L66 27 L72 17 L76 30 Z"
              fill="#ffd23f"
              stroke={ink}
              strokeWidth={3.5}
              strokeLinejoin="round"
            />
          )}

          {/* ears / side fins */}
          {showEars && (
            <g>
              <rect x={13} y={52} width={11} height={22} rx={5} fill={body} stroke={ink} strokeWidth={4} />
              <rect x={96} y={52} width={11} height={22} rx={5} fill={body} stroke={ink} strokeWidth={4} />
            </g>
          )}

          {/* shoulders / body base */}
          <rect x={39} y={92} width={42} height={16} rx={8} fill={body} stroke={ink} strokeWidth={4.5} />
          {showBadge && (
            <g>
              <circle cx={60} cy={100} r={6} fill="#ffd23f" stroke={ink} strokeWidth={2.5} />
              <path d="M60 96.5 L61.2 99 L63.8 99.2 L61.8 101 L62.4 103.6 L60 102.2 L57.6 103.6 L58.2 101 L56.2 99.2 L58.8 99 Z" fill={ink} />
            </g>
          )}

          {/* head */}
          <rect x={24} y={30} width={72} height={66} rx={20} fill={body} stroke={ink} strokeWidth={4.5} />

          {/* visor headband */}
          {showVisor && <rect x={33} y={37} width={54} height={8} rx={4} fill={glow} stroke={ink} strokeWidth={2.5} />}

          {/* face screen */}
          <rect x={33} y={46} width={54} height={38} rx={13} fill="#15122b" stroke={ink} strokeWidth={3} />
          <Face mood={mood} glow={glow} />
        </g>

        {/* thinking dots float outside the bob group so they read as a thought */}
        {mood === 'thinking' && (
          <g className="codebot-think-dots">
            <circle cx={94} cy={42} r={2.4} fill={ink} />
            <circle cx={101} cy={37} r={3} fill={ink} />
            <circle cx={109} cy={33} r={3.6} fill={ink} />
          </g>
        )}
      </svg>
    </div>
  )
}
