import type { ComponentType } from 'react'
import {
  IconCompass,
  IconTerminal,
  IconBolt,
  IconArrowRight,
  IconGrid,
  IconGauge,
} from '../components/icons'
import { LESSON_CATALOG } from './catalog'

/**
 * The adventure layer that wraps the learning course. Each lesson in
 * LESSON_CATALOG maps to a "world" on CodeBot's Pattern Quest map. None of the
 * teaching changes — this only adds story, characters, and game framing.
 */

export type WorldTheme = {
  /** Strong accent (borders, glow, boss bar). */
  accent: string
  /** Soft fill used behind nodes and panels. */
  accentSoft: string
  /** Readable text color on the soft fill. */
  accentInk: string
}

export type World = {
  /** Matches the lesson id in LESSON_CATALOG. */
  id: string
  /** 0-based order along the quest path. */
  index: number
  /** In-game world name. */
  name: string
  /** Short, fun one-liner shown on the map node. */
  blurb: string
  /** The real skill, in plain words. */
  skill: string
  theme: WorldTheme
  /** The power CodeBot earns by clearing this world. */
  power: {
    name: string
    description: string
    Icon: ComponentType<{ size?: number; className?: string }>
  }
  /** The boss = the lesson quiz, reframed. */
  boss: {
    name: string
    /** Taunt shown before the boss fight. */
    taunt: string
    /** Line shown after the boss is beaten. */
    defeat: string
  }
  /** CodeBot's intro dialogue when entering the world hub. */
  intro: string
  /** Map node position as percentages of the static map canvas (list view). */
  pos: { x: number; y: number }
  /** Checkpoint flag position in overworld pixels (where the lesson lives). */
  over: { x: number; y: number }
  /** Boss gate position in overworld pixels (where the quiz lives). */
  overBoss: { x: number; y: number }
}

const T = {
  lime: { accent: '#14d39a', accentSoft: '#c7f7e8', accentInk: '#0a5f47' },
  cyan: { accent: '#2dd4ee', accentSoft: '#cdf3fa', accentInk: '#0a6273' },
  violet: { accent: '#6d4afe', accentSoft: '#e7e0ff', accentInk: '#3a2a8c' },
  amber: { accent: '#ff9e2c', accentSoft: '#ffe9c2', accentInk: '#8a4b00' },
  coral: { accent: '#ff5a5f', accentSoft: '#ffd9da', accentInk: '#8a1f24' },
  blue: { accent: '#3a86ff', accentSoft: '#d6e6ff', accentInk: '#143e87' },
} satisfies Record<string, WorldTheme>

/** Worlds in quest order. Order mirrors LESSON_CATALOG. */
export const WORLDS: World[] = [
  {
    id: 'arrays-and-loops',
    index: 0,
    name: 'Scanner Valley',
    blurb: 'Sweep the grassy rows and spot what hides inside.',
    skill: 'Loop through a list, one item at a time.',
    theme: T.lime,
    power: {
      name: 'Scan Beam',
      description: 'Sweep across any row of values and read every slot in one pass.',
      Icon: IconCompass,
    },
    boss: {
      name: 'The Hider',
      taunt: 'The Hider buries the biggest number in the tall grass. Scan every slot to flush it out!',
      defeat: 'The Hider has nowhere left to hide — your Scan Beam found it!',
    },
    intro:
      "Welcome to Scanner Valley! Out here we find things by checking every slot in a row. Train with me and you'll earn the Scan Beam.",
    pos: { x: 22, y: 12 },
    over: { x: 1808, y: 1936 },
    overBoss: { x: 2333, y: 1558 },
  },
  {
    id: 'strings',
    index: 1,
    name: 'Letter Lagoon',
    blurb: 'Read the glowing signs letter by letter.',
    skill: 'Walk through text one character at a time.',
    theme: T.cyan,
    power: {
      name: 'Char Reader',
      description: 'Read any word one letter at a time and compare them like a pro.',
      Icon: IconTerminal,
    },
    boss: {
      name: 'Mirror Mimic',
      taunt: 'The Mirror Mimic only breaks if a word reads the same backwards. Check the letters from both ends!',
      defeat: 'The Mirror Mimic shatters — you saw right through its reflection!',
    },
    intro:
      'Letter Lagoon is made of words and signs. Here a string is just a row of letters. Help me read them and the Char Reader is yours.',
    pos: { x: 53, y: 26 },
    over: { x: 2858, y: 1369 },
    overBoss: { x: 3267, y: 1086 },
  },
  {
    id: 'hash-maps',
    index: 2,
    name: 'Memory Mines',
    blurb: 'Store treasures in glowing crystals for instant recall.',
    skill: 'Remember values so you can look them up instantly.',
    theme: T.violet,
    power: {
      name: 'Recall Crystal',
      description: 'Stash anything under a key and pull it back instantly — no searching.',
      Icon: IconBolt,
    },
    boss: {
      name: 'Twin-Key Golem',
      taunt: 'The Twin-Key Golem guards a pair that sums to the target. Remember what you have seen to find its partner!',
      defeat: 'The Twin-Key Golem crumbles — you found the pair in one pass!',
    },
    intro:
      'Deep in the Memory Mines we store things in crystals — a key and its treasure. Learn this and you carry the Recall Crystal everywhere.',
    pos: { x: 80, y: 41 },
    over: { x: 3617, y: 803 },
    overBoss: { x: 3500, y: 567 },
  },
  {
    id: 'two-pointers',
    index: 3,
    name: 'Twin Bridges',
    blurb: 'Cross from both ends and meet in the middle.',
    skill: 'Move two markers toward each other through data.',
    theme: T.amber,
    power: {
      name: 'Double Step',
      description: 'Send two scouts inward from each end and close in on the answer fast.',
      Icon: IconArrowRight,
    },
    boss: {
      name: 'The Gatekeeper',
      taunt: 'The Gatekeeper opens only for a pair that sums just right. Step in from both ends until you land it!',
      defeat: 'The Gatekeeper bows — your Double Step closed the gap perfectly!',
    },
    intro:
      'The Twin Bridges are crossed from both ends at once. Two markers, walking inward. Master it and you unlock the Double Step.',
    pos: { x: 46, y: 56 },
    over: { x: 3208, y: 425 },
    overBoss: { x: 2800, y: 236 },
  },
  {
    id: 'stacks',
    index: 4,
    name: 'Stack City',
    blurb: 'Pile the crates — last one up comes first down.',
    skill: 'Push and pop from the top: last in, first out.',
    theme: T.coral,
    power: {
      name: 'Top Loader',
      description: 'Stack crates so the last one placed is always first to grab.',
      Icon: IconGrid,
    },
    boss: {
      name: 'Bracket Beast',
      taunt: 'The Bracket Beast throws mismatched brackets. Stack each opener and pop to check every closer!',
      defeat: 'The Bracket Beast topples — every bracket matched its pair!',
    },
    intro:
      'Welcome to Stack City, where everything piles up. The last crate on is the first one off. Help me sort it and earn the Top Loader.',
    pos: { x: 19, y: 71 },
    over: { x: 1867, y: 331 },
    overBoss: { x: 1283, y: 472 },
  },
  {
    id: 'binary-search',
    index: 5,
    name: 'Halving Heights',
    blurb: 'Leap to the middle and drop half the mountain each jump.',
    skill: 'Cut a sorted search space in half every step.',
    theme: T.blue,
    power: {
      name: 'Split Sight',
      description: 'Jump to the middle of sorted data and throw away half the search every time.',
      Icon: IconGauge,
    },
    boss: {
      name: 'Sorted Sphinx',
      taunt: 'The Sorted Sphinx hides a number on a sorted mountain. Halve the range each guess to corner it!',
      defeat: 'The Sorted Sphinx is solved — you split the mountain down to the answer!',
    },
    intro:
      'The peak! Halving Heights only obeys those who jump to the middle and drop half the climb each time. Conquer it for Split Sight.',
    pos: { x: 62, y: 88 },
    over: { x: 817, y: 992 },
    overBoss: { x: 583, y: 1464 },
  },
]

const WORLD_BY_ID: Record<string, World> = Object.fromEntries(
  WORLDS.map((w) => [w.id, w]),
)

export function getWorld(lessonId: string): World | undefined {
  return WORLD_BY_ID[lessonId]
}

/** Total worlds — should match LESSON_CATALOG length. */
export const WORLD_COUNT = WORLDS.length

// Sanity: keep worlds and lessons in lockstep during development.
if (import.meta.env.DEV && WORLDS.length !== LESSON_CATALOG.length) {
  // eslint-disable-next-line no-console
  console.warn(
    `[adventure] WORLDS (${WORLDS.length}) and LESSON_CATALOG (${LESSON_CATALOG.length}) are out of sync.`,
  )
}

/**
 * CodeBot evolves as worlds are cleared. Stage = number of powers earned (0–6).
 */
export type CodeBotStage = {
  stage: number
  title: string
  /** Short status line for the map. */
  caption: string
}

export const CODEBOT_STAGES: CodeBotStage[] = [
  { stage: 0, title: 'Rookie CodeBot', caption: 'Fresh out of the lab and ready to learn.' },
  { stage: 1, title: 'Scout CodeBot', caption: 'Scan Beam online — nothing stays hidden.' },
  { stage: 2, title: 'Reader CodeBot', caption: 'Char Reader humming — every letter counts.' },
  { stage: 3, title: 'Keeper CodeBot', caption: 'Recall Crystal charged — instant memory.' },
  { stage: 4, title: 'Strider CodeBot', caption: 'Double Step engaged — two scouts at once.' },
  { stage: 5, title: 'Stacker CodeBot', caption: 'Top Loader bolted on — pile it high.' },
  { stage: 6, title: 'Master CodeBot', caption: 'Every power earned. A true Code Master!' },
]

export function codeBotStage(clearedCount: number): CodeBotStage {
  const i = Math.max(0, Math.min(CODEBOT_STAGES.length - 1, clearedCount))
  return CODEBOT_STAGES[i]
}
