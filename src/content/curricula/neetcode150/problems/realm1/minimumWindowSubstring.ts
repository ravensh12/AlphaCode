import { createProblemMission } from '../../problemMissionFactory'
import type { ProblemMissionSeed } from '../../problemMissionSeed'

export const minimumWindowSubstringMissionSeed = {
  slug: 'minimum-window-substring',
  estimatedMinutes: 28,
  mission: {
    title: 'The Smallest Rescue Transmission',
    context:
      'A long transmission contains signal symbols. A rescue decoder needs one contiguous segment containing every required symbol with its required number of copies.',
    prompt:
      'Return the shortest qualifying segment. If none exists, return an empty string; if lengths tie, keep the earliest.',
  },
  objective:
    'Expand until all required frequencies are met, then shrink to the smallest valid window.',
  priorKnowledge: [
    'A frequency map can represent repeated requirements.',
    'A window gains a character on the right and loses one on the left.',
    'A valid window can still contain extra characters.',
  ],
  recognitionCue:
    'You need the shortest substring covering a target multiset, including duplicate requirements.',
  misconception:
    'Counting only distinct required symbols accepts one A when the requirement asks for two A symbols.',
  algorithmSteps: [
    { id: 'count-requirements', instruction: 'Build required frequencies and count how many symbol kinds must be satisfied.' },
    { id: 'open-window', instruction: 'Set left to 0, formed to 0, and start an empty best range.' },
    { id: 'expand-right', instruction: 'Add each right symbol to the window counts.' },
    { id: 'mark-satisfied', instruction: 'When a required symbol reaches its exact needed count, increment formed.' },
    { id: 'shrink-valid', instruction: 'While every kind is satisfied, record a shorter range and remove the left symbol.' },
    { id: 'mark-broken', instruction: 'If a removed required symbol drops below its need, decrement formed.' },
    { id: 'return-range', instruction: 'Return the best slice, or an empty string if no valid range was recorded.' },
  ],
  complexity: {
    time: 'O(n + m)',
    space: 'O(a)',
    explanation:
      'The source and requirement are counted once, each source character enters and leaves once, and maps hold a alphabet symbols.',
  },
  explanationVisuals: {
    diagram: {
      kind: 'string',
      chars: 'QBAZAC',
      pointers: [
        { index: 2, label: 'left A' },
        { index: 5, label: 'right C' },
      ],
      visited: [0, 1],
    },
  },
  workedExample: {
    prompt:
      'Source “QBAZAC” must cover “AAC”. After C arrives, the whole window qualifies. Removing Q and B keeps it valid, leaving shortest segment “AZAC”.',
    code: [
      'def rescue(source, required):',
      '    if not required: return ""',
      '    need = {}',
      '    for ch in required: need[ch] = need.get(ch, 0) + 1',
      '    window = {}; formed = 0; left = 0; best = None',
      '    for right, ch in enumerate(source):',
      '        window[ch] = window.get(ch, 0) + 1',
      '        if ch in need and window[ch] == need[ch]: formed += 1',
      '        while formed == len(need):',
      '            if best is None or right - left + 1 < best[0]: best = (right - left + 1, left, right)',
      '            gone = source[left]; window[gone] -= 1; left += 1',
      '            if gone in need and window[gone] < need[gone]: formed -= 1',
      '    return "" if best is None else source[best[1]:best[2] + 1]',
    ],
    currentLineIndex: 9,
    walkthrough: [
      'The requirement map is A→2 and C→1, so two symbol kinds must be satisfied.',
      'At the final C, both required counts are met.',
      'Q and B leave safely; removing the A at index 2 would break the count, so AZAC is minimal.',
    ],
    diagram: {
      kind: 'hashmap',
      entries: [
        { key: 'A', value: 2 },
        { key: 'C', value: 1 },
      ],
      lookup: 'A',
    },
  },
  patternCheck: {
    prompt:
      'When should formed increase for a required symbol?',
    options: [
      { id: 'reaches-need', label: 'Exactly when its window count reaches the required count.' },
      { id: 'every-copy', label: 'Every time any copy of that symbol enters.' },
      { id: 'above-need', label: 'Only after its count is greater than the requirement.' },
      { id: 'leaves-window', label: 'Whenever that symbol leaves from the left.' },
    ],
    correctOptionId: 'reaches-need',
    feedback: {
      correct: 'Correct. formed counts satisfied symbol kinds, not total character copies.',
      incorrect: 'That update makes formed stop representing fully satisfied requirements.',
      secondIncorrect: 'Increment once, at window[ch] == need[ch].',
    },
    hints: ['Extra copies do not satisfy a new kind.', 'Each required map key contributes at most one to formed.'],
    diagram: {
      kind: 'hashmap',
      entries: [
        { key: 'A needed', value: 2 },
        { key: 'A window', value: 2 },
      ],
      lookup: 'A window',
    },
  },
  retrievalCheck: {
    prompt:
      'Write the condition that says every required symbol kind is currently satisfied.',
    acceptedAnswers: [
      'formed == len(need)',
      'formed equals len(need)',
      'formed == required kinds',
      'formed equals the number of needed keys',
      'formed==len(need)',
      'formed == number of required kinds',
      'formed equals the number of required kinds',
      'formed is len(need)',
    ],
    placeholder: 'while ...',
    feedback: {
      correct: 'Right. That condition opens the shrinking phase.',
      incorrect: 'Compare the number of satisfied kinds with the number of keys in need.',
      secondIncorrect: 'Use formed == len(need).',
    },
    hints: ['formed is not the window length.', 'len(need) counts distinct required symbols.'],
  },
  reconstructionCheck: {
    prompt:
      'Restore the rescue scan from requirement counts through its shortest saved slice.',
    feedback: {
      correct: 'Rescue scan restored. Expansion gains validity; shrinking removes every unnecessary edge.',
      incorrect: 'A symbol must enter before it can satisfy a requirement, and shrinking begins only when all kinds match.',
      secondIncorrect: 'Count, open, expand, mark satisfied, shrink/save, mark broken, return.',
    },
    hints: ['The best range updates inside the shrinking loop.', 'Removing a scarce symbol ends shrinking.'],
    diagram: { kind: 'string', chars: 'TAXOBXTAC', pointers: [{ index: 6, label: 'left' }, { index: 8, label: 'right' }] },
  },
  pythonChallenge: {
    prompt:
      'Write solve(data). Read data["source"] and data["required"]. Return the earliest shortest source segment covering every required character count, or "".',
    starterCode: `def solve(data):
    source = data["source"]
    required = data["required"]
    if not required:
        return ""

    need = {}
    for ch in required:
        need[ch] = need.get(ch, 0) + 1

    # Expand counts, track satisfied kinds, and shrink each valid window.
    return ""`,
    cases: {
      visibleExample: { input: { source: 'TAXOBXTAC', required: 'ATC' }, expected: 'TAC' },
      hiddenBoundary: { input: { source: 'anything', required: '' }, expected: '' },
      hiddenAdversarial: { input: { source: 'ABCA', required: 'AAA' }, expected: '' },
    },
    feedback: {
      correct: 'Rescue segment found! Your window handles empty targets, missing copies, and tight covers.',
      incorrect: 'The returned segment is missing, too long, or under-counted. Recheck formed and shrinking.',
      secondIncorrect: 'Increment formed at exact need; while formed==len(need), save, remove left, and detect shortages.',
    },
    hints: [
      'Store best as length and inclusive endpoints.',
      'Use a strict shorter-than comparison to keep the earliest tie.',
      'Return source[start:end + 1] only when a best range exists.',
    ],
    diagram: { kind: 'string', chars: 'TAXOBXTAC', pointers: [{ index: 6, label: 'T' }, { index: 8, label: 'C; TAC' }] },
  },
} as const satisfies ProblemMissionSeed

export const problemLesson = createProblemMission(minimumWindowSubstringMissionSeed)
export default problemLesson
