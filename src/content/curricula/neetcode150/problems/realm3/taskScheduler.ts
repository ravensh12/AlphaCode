import { createProblemMission } from '../../problemMissionFactory'
import type { ProblemMissionSeed } from '../../problemMissionSeed'

export const taskSchedulerMissionSeed = {
  slug: 'task-scheduler',
  estimatedMinutes: 28,
  mission: {
    title: 'Schedule the Cooling Workshop',
    context:
      'A workshop runs one machine job per time slot. Jobs with the same letter overheat the tool, so at least a fixed number of other slots must pass before that letter runs again.',
    prompt:
      'Given a task-letter array and cooldown, return the fewest slots needed when idle slots are allowed.',
  },
  objective:
    'Schedule the most frequent available task with a max-heap while a queue tracks cooling tasks and their ready times.',
  priorKnowledge: [
    'A frequency map counts remaining copies of each task.',
    'A max-heap can choose the task with the greatest remaining count.',
  ],
  recognitionCue:
    'Repeated task types compete for time slots and each used type becomes unavailable for a fixed delay.',
  misconception:
    'Always taking the first task in input order can create avoidable idle time later.',
  algorithmSteps: [
    {
      id: 'count-and-heap',
      instruction: 'Count tasks and put their remaining counts in a max-heap.',
    },
    {
      id: 'advance-time',
      instruction: 'Move time forward by one slot.',
    },
    {
      id: 'release-ready',
      instruction: 'Move every task whose cooldown ended back into the heap.',
    },
    {
      id: 'run-most-needed',
      instruction: 'If possible, run the available task with greatest remaining count.',
    },
    {
      id: 'start-cooldown',
      instruction: 'If copies remain, queue its count with the next allowed time.',
    },
  ],
  complexity: {
    time: 'O(S log u)',
    space: 'O(u)',
    explanation:
      'Across S total slots, heap work involves at most u distinct task types; heap and cooldown queue store O(u) counts.',
  },
  explanationVisuals: {
    diagram: {
      kind: 'tree',
      variant: 'heap',
      heapKind: 'max',
      values: ['A:3', 'B:3'],
      highlight: 0,
      pointers: [{ index: 0, label: 'run a most-needed task' }],
    },
  },
  workedExample: {
    prompt:
      'For A,A,A,B,B,B with cooldown 2, one shortest timeline is A,B,idle,A,B,idle,A,B, using 8 slots.',
    code: [
      'while heap or cooling:',
      '    time += 1',
      '    while cooling and cooling[0].ready <= time:',
      '        push_available(cooling.popleft())',
      '    if heap:',
      '        remaining = pop_largest_count() - 1',
      '        if remaining: cooling.append((remaining, time + cooldown + 1))',
    ],
    currentLineIndex: 2,
    walkthrough: [
      'A runs at slot 1 and cannot return until slot 4.',
      'B runs at slot 2 and cannot return until slot 5, leaving slot 3 idle.',
      'The pattern repeats, and both third copies finish by slot 8.',
    ],
  },
  patternCheck: {
    prompt:
      'Why prefer the available task with the largest remaining count?',
    options: [
      {
        id: 'spread-frequent',
        label: 'Frequent tasks need the most chances to be spread across future cooldown gaps.',
      },
      {
        id: 'alphabetical',
        label: 'The most frequent task always has the earliest letter.',
      },
      {
        id: 'avoid-cooling',
        label: 'Running a frequent task removes its cooldown rule.',
      },
      {
        id: 'finish-rarest',
        label: 'The largest heap count represents the rarest task.',
      },
    ],
    correctOptionId: 'spread-frequent',
    feedback: {
      correct:
        'Exactly. Delaying a crowded task can leave too many copies with too few separators.',
      incorrect:
        'That misreads the count or ignores that every repeated type still cools.',
      secondIncorrect:
        'Use a max-heap of remaining counts to spread the most constrained types early.',
    },
    hints: ['Idle time is caused by a task that still has copies but is cooling.', 'Rare tasks can serve as separators.'],
  },
  retrievalCheck: {
    prompt:
      'After running a task at time t, type its next allowed time in terms of cooldown n.',
    acceptedAnswers: [
      't + n + 1',
      't+n+1',
      'time + cooldown + 1',
      'time+cooldown+1',
      't + cooldown + 1',
      't+cooldown+1',
      'n + t + 1',
      'n+t+1',
    ],
    placeholder: 'Ready-time formula',
    feedback: {
      correct:
        'Right. Exactly n full slots must lie between two runs of that task.',
      incorrect:
        'Remember that the next run comes after the n separating slots.',
      secondIncorrect:
        'Use t + n + 1.',
    },
    hints: ['With cooldown 2 and a run at 1, the next run is at 4.', 'Add the current slot boundary too.'],
  },
  reconstructionCheck: {
    prompt:
      'Restore the workshop time-loop actions.',
    feedback: {
      correct:
        'Each slot advances, releases eligible work, chooses an available priority, and records its next ready time.',
      incorrect:
        'Time advances before ready-time comparisons, and ready tasks must rejoin the heap before this slot chooses work.',
      secondIncorrect:
        'Use count/heap → advance → release → run → cool.',
    },
    hints: ['The loop continues while either structure holds work.', 'An empty heap means the current slot is idle.'],
  },
  pythonChallenge: {
    prompt:
      'Write solve(data). Read tasks and cooldown and return the minimum number of run-or-idle slots needed to finish every task.',
    starterCode: `import heapq
from collections import Counter, deque

def solve(data):
    tasks = data["tasks"]
    cooldown = data["cooldown"]
    heap = [-count for count in Counter(tasks).values()]
    heapq.heapify(heap)
    cooling = deque()
    time = 0

    while heap or cooling:
        # TODO: advance one slot, run an available task, and release ready tasks.
        pass
    return time`,
    cases: {
      visibleExample: {
        input: { tasks: ['A', 'A', 'A', 'B', 'B', 'B'], cooldown: 2 },
        expected: 8,
      },
      hiddenBoundary: {
        input: { tasks: [], cooldown: 3 },
        expected: 0,
      },
      hiddenAdversarial: {
        input: {
          tasks: ['A', 'A', 'A', 'A', 'B', 'C', 'D', 'E'],
          cooldown: 2,
        },
        expected: 10,
      },
    },
    feedback: {
      correct:
        'The workshop finishes in the minimum slots, including forced idle periods.',
      incorrect:
        'A ready-time offset, heap priority, or idle slot was handled incorrectly.',
      secondIncorrect:
        'Increment time, pop one count if available, queue remaining at time+n+1, then return all entries ready now to the heap.',
    },
    hints: [
      'Negative counts turn heapq into a max-heap.',
      'An idle slot still increments time.',
      'A deque works because ready times are added in increasing order.',
    ],
    diagram: {
      kind: 'tree',
      variant: 'heap',
      heapKind: 'max',
      values: ['A:4', 'B:1', 'C:1', 'D:1', 'E:1'],
      highlight: 0,
      pointers: [{ index: 0, label: 'most constrained' }],
    },
  },
} as const satisfies ProblemMissionSeed

export const problemLesson = createProblemMission(taskSchedulerMissionSeed)

export default problemLesson
