import { type FrameCost } from './graphicsGovernor'

/* ============================================================================
   FRAME COST METER — how long the main thread actually WORKED on a frame, as
   opposed to how long the frame took to arrive.

   The governor needs to tell "this machine is struggling" from "this display
   only presents 30 times a second". Wall-clock frame deltas cannot: both look
   like 33.3ms. The difference is entirely in what happened inside those
   33.3ms, so that is what this measures.

   HOW. Everything a frame does on the main thread — every rAF callback, in
   this app the whole R3F loop plus the composer's render submission — runs
   inside ONE task. A message posted on a MessageChannel from the first rAF
   callback is delivered as the NEXT task, which by definition cannot start
   until that whole task has finished. So the interval between posting and
   receiving is the frame's main-thread busy time.

   Why not time the R3F callbacks directly: useFrame subscribers run in
   registration order, so a meter written that way silently measures only the
   suffix of the frame that happens to come after it in the tree, and misses
   the renderer submission entirely (the composer renders at priority 1, after
   every priority-0 subscriber). The message-task trick is independent of
   ordering and of who owns the render.

   It does over-attribute slightly: anything the browser chooses to run
   between the rAF task and the port message — a timer, a network callback —
   lands inside the measurement. That biases the reading toward "the machine
   was busy", i.e. toward demoting, which is the safe direction for a signal
   whose failure mode is refusing to demote.

   The meter also tracks the CADENCE FLOOR: the shortest frame interval seen
   in the recent past, i.e. the fastest this machine and display have actually
   been observed to go. A frame far longer than the floor broke the beat and
   is real stutter; a frame sitting exactly on the floor is the beat.

   Allocation-free per frame: one channel, one constant message, plain numbers.
   ========================================================================== */

/** How far back the cadence floor looks. Long enough to survive a burst of
 *  slow frames (otherwise the floor rises to meet the stutter and the stutter
 *  starts looking like the cadence), short enough to follow a genuine display
 *  change — moving the window to a 30Hz panel — within a few seconds. */
const FLOOR_WINDOW_MS = 3_000

/** No display beats this, so a shorter reading is a clock artifact. */
const MIN_PLAUSIBLE_FRAME_MS = 4

/** A posted message that has not come back after this long is lost (the page
 *  was suspended mid-frame, or the port was starved). Generous: it only has
 *  to exceed the longest frame the governor will ever judge, which is
 *  JANK_FRAME_MAX_MS. */
const STALE_POST_MS = 1_200

export interface FrameCostMeter {
  /** Call at the top of every frame. Returns the wall delta since the last
   *  frame (0 for the very first), and arms the work measurement. */
  beginFrame(now: number): number
  /** The last completed frame's cost — pair this with that frame's duration. */
  cost(): FrameCost
  /** The same, but with work AVERAGED over the recent window, for callers
   *  judging an averaged frame rate rather than one frame. */
  averagedCost(): FrameCost
  /** Release the channel. The meter revives itself if used again, so a
   *  double-invoked mount effect cannot leave it permanently dead. */
  dispose(): void
}

export function createFrameCostMeter(): FrameCostMeter {
  const supported = typeof MessageChannel !== 'undefined'
  let channel: MessageChannel | null = null
  let postedAt = 0
  let pending = false
  let workMs = Number.NaN
  let workSum = 0
  let workCount = 0
  let avgWorkMs = Number.NaN
  let lastFrameAt = 0
  // Two-bucket rolling minimum: one bucket answers for the current window
  // while the next is built, so the floor can RISE again after a display
  // change instead of latching forever on one lucky fast frame.
  let floorMs = 0
  let nextFloorMs = 0
  let floorWindowStart = 0

  const receive = () => {
    if (!pending) return
    pending = false
    workMs = performance.now() - postedAt
    workSum += workMs
    workCount++
  }

  // Created lazily and re-created after dispose: React StrictMode runs a
  // mount effect's cleanup and then mounts again with the same retained
  // object, so a meter that could only be disposed once would spend all of
  // development silently reporting no work at all — a different governor
  // than the one that ships.
  const ensure = (): MessageChannel | null => {
    if (!supported) return null
    if (channel) return channel
    channel = new MessageChannel()
    channel.port1.onmessage = receive
    channel.port1.start?.()
    return channel
  }

  return {
    beginFrame(now: number): number {
      const delta = lastFrameAt === 0 ? 0 : now - lastFrameAt
      lastFrameAt = now

      if (delta >= MIN_PLAUSIBLE_FRAME_MS) {
        if (floorWindowStart === 0) floorWindowStart = now
        nextFloorMs = nextFloorMs === 0 ? delta : Math.min(nextFloorMs, delta)
        if (floorMs === 0) floorMs = delta
        if (now - floorWindowStart >= FLOOR_WINDOW_MS) {
          floorMs = nextFloorMs
          nextFloorMs = 0
          floorWindowStart = now
          // Work averages ride the floor window so the averaged reading and
          // the cadence it is compared against cover the same stretch of time.
          avgWorkMs = workCount > 0 ? workSum / workCount : Number.NaN
          workSum = 0
          workCount = 0
        }
      }

      const ch = ensure()
      if (!ch) return delta
      if (pending && performance.now() - postedAt > STALE_POST_MS) {
        // The reply never came. Without this the flag latches and the meter
        // reports one frozen measurement forever; NaN reads as "no evidence",
        // which returns the governor to its wall-clock behaviour rather than
        // to a stale opinion.
        pending = false
        workMs = Number.NaN
      }
      if (!pending) {
        pending = true
        postedAt = performance.now()
        ch.port2.postMessage(0)
      }
      return delta
    },
    cost(): FrameCost {
      return { workMs, floorMs }
    },
    averagedCost(): FrameCost {
      return { workMs: Number.isFinite(avgWorkMs) ? avgWorkMs : workMs, floorMs }
    },
    dispose(): void {
      if (!channel) return
      channel.port1.onmessage = null
      channel.port1.close()
      channel.port2.close()
      channel = null
      pending = false
      workMs = Number.NaN
    },
  }
}
