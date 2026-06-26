/**
 * Narrative flavor for the endgame: VEX (the cinematic Level-6 supervillain)
 * and "The Threshold" (the liminal zone between Code City and the Final
 * Gauntlet). Text/data ONLY — no gameplay logic lives here. Tone mirrors
 * `adventure.ts`: playful, warm, mentor-led, but dialed up to an epic finale.
 */

// --- VEX, THE NULL HERALD ---------------------------------------------------

export type BossIntro = {
  title: string
  subtitle: string
  /** Spoken before the fight. */
  taunt: string
  /** One line telling the player this is pure skill — no quiz. */
  hint: string
}

export const VEX_INTRO: BossIntro = {
  title: 'VEX',
  subtitle: 'The Null Herald',
  taunt:
    "So the little bot climbed all the way to the peak. How quaint. I am VEX, the hand of the Null Sovereign — and I unmake everything you think you've learned. Your search ends here, at the top of the world.",
  hint: 'First, prove your knowledge in the Level 6 quiz. Then it is pure skill: keep moving, dash through his beams, and PARRY his glowing overhead to crack his armor. Then punish.',
}

/** One line per phase transition. Index 0 = phase 1->2, 1 = phase 2->3. */
export const VEX_PHASE_TAUNTS: string[] = [
  "Cute. My armor splits — and so will you.",
  "ENOUGH. I will overwrite this entire mountain!",
]

/** Tiny barks (<= 6 words) for a successful parry. */
export const VEX_PARRY_LINES: string[] = [
  'Impossible!',
  'You dare?',
  'Lucky.',
  'How—?!',
]

/** Tiny barks for when the player takes a big hit. */
export const VEX_HIT_LINES: string[] = [
  'Stay down.',
  'Deleted.',
  'Insignificant.',
  'Null and void.',
]

export const VEX_DEFEAT =
  "VEX shatters into falling shards of light — and behind the cracks, the sky peels open. \"Code City... was never real,\" he breathes. \"You were always meant to reach... the Threshold.\"" 

// --- THE THRESHOLD ----------------------------------------------------------

export type ThresholdCaption = {
  text: string
  /** When to show it during the traversal, ms from scene start. */
  atMs?: number
}

export const THRESHOLD_TITLE = 'THE THRESHOLD'
export const THRESHOLD_SUBTITLE = 'The space between what was real and what comes next'

/** Voice of the Null Sovereign during the walk toward the Gate. */
export const THRESHOLD_CAPTIONS: ThresholdCaption[] = [
  { text: 'You crossed six worlds. You broke my Herald. And still you do not understand...', atMs: 600 },
  { text: 'Every valley, every city, every mountain — a construct. Lines of code I wrote to test you.', atMs: 4200 },
  { text: 'This place is the seam. The Threshold. Where my world ends and yours begins.', atMs: 8200 },
  { text: 'Ahead, the Gate. Beyond it, a trial of everything you claim to know.', atMs: 12000 },
  { text: 'Gather your strength, little bot. Choose your edge.', atMs: 15500 },
  { text: 'Then step through... if you still dare.', atMs: 18500 },
]

export const GATE_PROMPT = 'Step through the Gate'

// --- THE ARCHITECT (final boss) ---------------------------------------------
// The human mastermind behind Code City and the master VEX served. A realistic
// human supervillain fought at the summit of the Null Tower — the true climax.

export const ARCHITECT_INTRO: BossIntro = {
  title: 'THE ARCHITECT',
  subtitle: 'Mastermind of the Null',
  taunt:
    "You crossed my Threshold. You broke my Herald. And now you stand on the roof of everything I built. I am the Architect — I wrote this world, line by line, and I can rewrite YOU just as easily. Let's see what you've really learned.",
  hint: 'This is everything at once. Read his tells, dash his strikes, and PARRY the glowing overhead to break him. Survive all four phases — and finish it.',
}

/** One line per phase transition: p1->2, p2->3, p3->4. */
export const ARCHITECT_PHASE_TAUNTS: string[] = [
  'Adequate. Let me raise the difficulty.',
  'You force my hand. The city answers to ME.',
  'NO MORE GAMES. I will delete you from existence!',
]

export const ARCHITECT_PARRY_LINES: string[] = [
  'You read me?!',
  'Impossible.',
  'Clever bot.',
  'Recompiling...',
]

export const ARCHITECT_HIT_LINES: string[] = [
  'Overwritten.',
  'Sit DOWN.',
  'Obsolete.',
  'End of line.',
]

export const ARCHITECT_DEFEAT =
  "The Architect drops to one knee as the storm tears his tower apart. \"You... were never just code,\" he breathes, and the Null dissolves into dawn. Code City is free — and so are you. You didn't memorize the answer. You became it.";

/** Short lines shown over the victory/credits sequence. */
export const ARCHITECT_VICTORY: string[] = [
  'The Null is broken.',
  'Code City wakes to its first real sunrise.',
  'Every pattern you learned is yours forever.',
  'You are the Code Master.',
]

