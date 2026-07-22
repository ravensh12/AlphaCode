import { describe, expect, it } from 'vitest'
import {
  CURRICULUM_DIFFICULTIES,
  type Difficulty,
  type ProblemId,
  type SkillId,
  type TrackId,
} from '../../../types/curriculum'
import {
  CURRICULUM_SOURCES,
  CURRICULUM_SOURCE_IDS,
  NEETCODE_150_MANIFEST,
} from './index'

const EXPECTED_TRACK_COUNTS: Record<TrackId, number> = {
  'arrays-hashing': 9,
  'two-pointers': 5,
  'sliding-window': 6,
  stack: 7,
  'binary-search': 7,
  'linked-list': 11,
  trees: 15,
  tries: 3,
  'heap-priority-queue': 7,
  backtracking: 9,
  graphs: 13,
  'advanced-graphs': 6,
  '1d-dp': 12,
  '2d-dp': 11,
  greedy: 8,
  intervals: 6,
  'math-geometry': 8,
  'bit-manipulation': 7,
}

const EXPECTED_DIFFICULTIES: Record<TrackId, readonly Difficulty[]> = {
  'arrays-hashing': ['Easy', 'Easy', 'Easy', 'Medium', 'Medium', 'Medium', 'Medium', 'Medium', 'Medium'],
  'two-pointers': ['Easy', 'Medium', 'Medium', 'Medium', 'Hard'],
  'sliding-window': ['Easy', 'Medium', 'Medium', 'Medium', 'Hard', 'Hard'],
  stack: ['Easy', 'Medium', 'Medium', 'Medium', 'Medium', 'Medium', 'Hard'],
  'binary-search': ['Easy', 'Medium', 'Medium', 'Medium', 'Medium', 'Medium', 'Hard'],
  'linked-list': ['Easy', 'Easy', 'Medium', 'Medium', 'Medium', 'Medium', 'Easy', 'Medium', 'Medium', 'Hard', 'Hard'],
  trees: ['Easy', 'Easy', 'Easy', 'Easy', 'Easy', 'Easy', 'Medium', 'Medium', 'Medium', 'Medium', 'Medium', 'Medium', 'Medium', 'Hard', 'Hard'],
  tries: ['Medium', 'Medium', 'Hard'],
  'heap-priority-queue': ['Easy', 'Easy', 'Medium', 'Medium', 'Medium', 'Medium', 'Hard'],
  backtracking: ['Medium', 'Medium', 'Medium', 'Medium', 'Medium', 'Medium', 'Medium', 'Medium', 'Hard'],
  graphs: ['Medium', 'Medium', 'Medium', 'Medium', 'Medium', 'Medium', 'Medium', 'Medium', 'Medium', 'Medium', 'Medium', 'Medium', 'Hard'],
  'advanced-graphs': ['Hard', 'Medium', 'Medium', 'Hard', 'Hard', 'Medium'],
  '1d-dp': ['Easy', 'Easy', 'Medium', 'Medium', 'Medium', 'Medium', 'Medium', 'Medium', 'Medium', 'Medium', 'Medium', 'Medium'],
  '2d-dp': ['Medium', 'Medium', 'Medium', 'Medium', 'Medium', 'Medium', 'Hard', 'Hard', 'Medium', 'Hard', 'Hard'],
  greedy: ['Medium', 'Medium', 'Medium', 'Medium', 'Medium', 'Medium', 'Medium', 'Medium'],
  intervals: ['Medium', 'Medium', 'Medium', 'Easy', 'Medium', 'Hard'],
  'math-geometry': ['Medium', 'Medium', 'Medium', 'Easy', 'Easy', 'Medium', 'Medium', 'Medium'],
  'bit-manipulation': ['Easy', 'Easy', 'Easy', 'Easy', 'Easy', 'Medium', 'Medium'],
}

const EXPECTED_SLUGS: Record<TrackId, readonly string[]> = {
  'arrays-hashing': [
    'contains-duplicate',
    'valid-anagram',
    'two-sum',
    'group-anagrams',
    'top-k-frequent-elements',
    'encode-and-decode-strings',
    'product-of-array-except-self',
    'valid-sudoku',
    'longest-consecutive-sequence',
  ],
  'two-pointers': [
    'valid-palindrome',
    'two-sum-ii-input-array-is-sorted',
    '3sum',
    'container-with-most-water',
    'trapping-rain-water',
  ],
  'sliding-window': [
    'best-time-to-buy-and-sell-stock',
    'longest-substring-without-repeating-characters',
    'longest-repeating-character-replacement',
    'permutation-in-string',
    'minimum-window-substring',
    'sliding-window-maximum',
  ],
  stack: [
    'valid-parentheses',
    'min-stack',
    'evaluate-reverse-polish-notation',
    'generate-parentheses',
    'daily-temperatures',
    'car-fleet',
    'largest-rectangle-in-histogram',
  ],
  'binary-search': [
    'binary-search',
    'search-a-2d-matrix',
    'koko-eating-bananas',
    'find-minimum-in-rotated-sorted-array',
    'search-in-rotated-sorted-array',
    'time-based-key-value-store',
    'median-of-two-sorted-arrays',
  ],
  'linked-list': [
    'reverse-linked-list',
    'merge-two-sorted-lists',
    'reorder-list',
    'remove-nth-node-from-end-of-list',
    'copy-list-with-random-pointer',
    'add-two-numbers',
    'linked-list-cycle',
    'find-the-duplicate-number',
    'lru-cache',
    'merge-k-sorted-lists',
    'reverse-nodes-in-k-group',
  ],
  trees: [
    'invert-binary-tree',
    'maximum-depth-of-binary-tree',
    'diameter-of-binary-tree',
    'balanced-binary-tree',
    'same-tree',
    'subtree-of-another-tree',
    'lowest-common-ancestor-of-a-binary-search-tree',
    'binary-tree-level-order-traversal',
    'binary-tree-right-side-view',
    'count-good-nodes-in-binary-tree',
    'validate-binary-search-tree',
    'kth-smallest-element-in-a-bst',
    'construct-binary-tree-from-preorder-and-inorder-traversal',
    'binary-tree-maximum-path-sum',
    'serialize-and-deserialize-binary-tree',
  ],
  tries: [
    'implement-trie-prefix-tree',
    'design-add-and-search-words-data-structure',
    'word-search-ii',
  ],
  'heap-priority-queue': [
    'kth-largest-element-in-a-stream',
    'last-stone-weight',
    'k-closest-points-to-origin',
    'kth-largest-element-in-an-array',
    'task-scheduler',
    'design-twitter',
    'find-median-from-data-stream',
  ],
  backtracking: [
    'subsets',
    'combination-sum',
    'permutations',
    'subsets-ii',
    'combination-sum-ii',
    'word-search',
    'palindrome-partitioning',
    'letter-combinations-of-a-phone-number',
    'n-queens',
  ],
  graphs: [
    'number-of-islands',
    'max-area-of-island',
    'clone-graph',
    'walls-and-gates',
    'rotting-oranges',
    'pacific-atlantic-water-flow',
    'surrounded-regions',
    'course-schedule',
    'course-schedule-ii',
    'graph-valid-tree',
    'number-of-connected-components-in-an-undirected-graph',
    'redundant-connection',
    'word-ladder',
  ],
  'advanced-graphs': [
    'reconstruct-itinerary',
    'min-cost-to-connect-all-points',
    'network-delay-time',
    'swim-in-rising-water',
    'alien-dictionary',
    'cheapest-flights-within-k-stops',
  ],
  '1d-dp': [
    'climbing-stairs',
    'min-cost-climbing-stairs',
    'house-robber',
    'house-robber-ii',
    'longest-palindromic-substring',
    'palindromic-substrings',
    'decode-ways',
    'coin-change',
    'maximum-product-subarray',
    'word-break',
    'longest-increasing-subsequence',
    'partition-equal-subset-sum',
  ],
  '2d-dp': [
    'unique-paths',
    'longest-common-subsequence',
    'best-time-to-buy-and-sell-stock-with-cooldown',
    'coin-change-ii',
    'target-sum',
    'interleaving-string',
    'longest-increasing-path-in-a-matrix',
    'distinct-subsequences',
    'edit-distance',
    'burst-balloons',
    'regular-expression-matching',
  ],
  greedy: [
    'maximum-subarray',
    'jump-game',
    'jump-game-ii',
    'gas-station',
    'hand-of-straights',
    'merge-triplets-to-form-target-triplet',
    'partition-labels',
    'valid-parenthesis-string',
  ],
  intervals: [
    'insert-interval',
    'merge-intervals',
    'non-overlapping-intervals',
    'meeting-rooms',
    'meeting-rooms-ii',
    'minimum-interval-to-include-each-query',
  ],
  'math-geometry': [
    'rotate-image',
    'spiral-matrix',
    'set-matrix-zeroes',
    'happy-number',
    'plus-one',
    'powx-n',
    'multiply-strings',
    'detect-squares',
  ],
  'bit-manipulation': [
    'single-number',
    'number-of-1-bits',
    'counting-bits',
    'reverse-bits',
    'missing-number',
    'sum-of-two-integers',
    'reverse-integer',
  ],
}

const EXPECTED_REALM_TRACKS = [
  ['arrays-hashing', 'two-pointers', 'sliding-window'],
  ['stack', 'binary-search', 'linked-list'],
  ['trees', 'tries', 'heap-priority-queue'],
  ['backtracking', 'graphs', 'advanced-graphs'],
  ['1d-dp', '2d-dp', 'greedy'],
  ['intervals', 'math-geometry', 'bit-manipulation'],
] as const

const assertAcyclic = <Id extends string>(
  nodeIds: readonly Id[],
  dependenciesFor: (id: Id) => readonly Id[],
) => {
  const state = new Map<Id, 'visiting' | 'visited'>()

  const visit = (id: Id, path: readonly Id[]) => {
    if (state.get(id) === 'visiting') {
      throw new Error(`Prerequisite cycle: ${[...path, id].join(' -> ')}`)
    }
    if (state.get(id) === 'visited') return

    state.set(id, 'visiting')
    for (const prerequisite of dependenciesFor(id)) {
      visit(prerequisite, [...path, id])
    }
    state.set(id, 'visited')
  }

  for (const id of nodeIds) visit(id, [])
}

describe('NeetCode 150 curriculum manifest', () => {
  it('contains exactly 150 unique stable problem IDs and slugs', () => {
    const { problems } = NEETCODE_150_MANIFEST
    const ids = problems.map(({ id }) => id)
    const slugs = problems.map(({ leetcodeSlug }) => leetcodeSlug)

    expect(problems).toHaveLength(150)
    expect(new Set(ids)).toHaveLength(150)
    expect(new Set(slugs)).toHaveLength(150)
    for (const problem of problems) {
      expect(problem.id).toBe(`problem:${problem.leetcodeSlug}`)
    }
  })

  it('locks the canonical membership and order of every track', () => {
    for (const track of NEETCODE_150_MANIFEST.tracks) {
      const actual = NEETCODE_150_MANIFEST.problems
        .filter(({ trackId }) => trackId === track.id)
        .sort((a, b) => a.trackOrder - b.trackOrder)
        .map(({ leetcodeSlug }) => leetcodeSlug)

      expect(actual).toEqual(EXPECTED_SLUGS[track.id])
    }
  })

  it('has the exact 18 track counts and 150 total problems', () => {
    expect(NEETCODE_150_MANIFEST.tracks).toHaveLength(18)

    for (const track of NEETCODE_150_MANIFEST.tracks) {
      expect(track.problemCount).toBe(EXPECTED_TRACK_COUNTS[track.id])
      expect(track.problemIds).toHaveLength(EXPECTED_TRACK_COUNTS[track.id])
    }

    expect(
      NEETCODE_150_MANIFEST.tracks.reduce(
        (total, track) => total + track.problemCount,
        0,
      ),
    ).toBe(150)
  })

  it('maps exactly three ordered tracks to each of six realms', () => {
    expect(NEETCODE_150_MANIFEST.realms).toHaveLength(6)

    NEETCODE_150_MANIFEST.realms.forEach((realm, index) => {
      expect(realm.order).toBe(index + 1)
      expect(realm.trackIds).toEqual(EXPECTED_REALM_TRACKS[index])
      expect(realm.trackIds).toHaveLength(3)

      realm.trackIds.forEach((trackId, trackIndex) => {
        const track = NEETCODE_150_MANIFEST.tracks.find(
          ({ id }) => id === trackId,
        )
        expect(track?.realmId).toBe(realm.id)
        expect(track?.realmOrder).toBe(trackIndex + 1)
      })
    })
  })

  it('resolves every realm, track, problem, skill, and source reference', () => {
    const realmIds = new Set(
      NEETCODE_150_MANIFEST.realms.map(({ id }) => id),
    )
    const trackIds = new Set(
      NEETCODE_150_MANIFEST.tracks.map(({ id }) => id),
    )
    const problemIds = new Set(
      NEETCODE_150_MANIFEST.problems.map(({ id }) => id),
    )
    const skillIds = new Set(
      NEETCODE_150_MANIFEST.skills.map(({ id }) => id),
    )
    const sourceIds = new Set<string>(
      NEETCODE_150_MANIFEST.sources.map(({ id }) => id),
    )

    for (const realm of NEETCODE_150_MANIFEST.realms) {
      for (const trackId of realm.trackIds) expect(trackIds.has(trackId)).toBe(true)
    }

    for (const track of NEETCODE_150_MANIFEST.tracks) {
      expect(realmIds.has(track.realmId)).toBe(true)
      for (const problemId of track.problemIds) {
        expect(problemIds.has(problemId)).toBe(true)
      }
      for (const skillId of track.skillIds) expect(skillIds.has(skillId)).toBe(true)
    }

    for (const skill of NEETCODE_150_MANIFEST.skills) {
      for (const prerequisite of skill.prerequisiteSkillIds) {
        expect(skillIds.has(prerequisite)).toBe(true)
      }
    }

    for (const problem of NEETCODE_150_MANIFEST.problems) {
      expect(realmIds.has(problem.realmId)).toBe(true)
      expect(trackIds.has(problem.trackId)).toBe(true)
      for (const skillId of problem.skillIds) expect(skillIds.has(skillId)).toBe(true)
      for (const prerequisite of problem.prerequisiteProblemIds) {
        expect(problemIds.has(prerequisite)).toBe(true)
      }
      expect(
        sourceIds.has(problem.provenance.primaryReferenceSourceId),
      ).toBe(true)
      expect(
        sourceIds.has(problem.provenance.curriculumVerificationSourceId),
      ).toBe(true)
      for (const sourceId of problem.provenance.pedagogySourceIds) {
        expect(sourceIds.has(sourceId)).toBe(true)
      }
    }
  })

  it('uses contiguous global and per-track orders', () => {
    expect(
      NEETCODE_150_MANIFEST.problems.map(({ globalOrder }) => globalOrder),
    ).toEqual(Array.from({ length: 150 }, (_, index) => index + 1))

    for (const track of NEETCODE_150_MANIFEST.tracks) {
      const trackProblems = NEETCODE_150_MANIFEST.problems.filter(
        ({ trackId }) => trackId === track.id,
      )
      expect(trackProblems.map(({ trackOrder }) => trackOrder)).toEqual(
        Array.from({ length: track.problemCount }, (_, index) => index + 1),
      )
      expect(trackProblems.map(({ id }) => id)).toEqual(track.problemIds)
    }
  })

  it('pins every factual difficulty value by canonical track order', () => {
    const validDifficulties = new Set<string>(CURRICULUM_DIFFICULTIES)

    for (const problem of NEETCODE_150_MANIFEST.problems) {
      expect(validDifficulties.has(problem.difficulty)).toBe(true)
    }

    for (const track of NEETCODE_150_MANIFEST.tracks) {
      expect(
        NEETCODE_150_MANIFEST.problems
          .filter(({ trackId }) => trackId === track.id)
          .map(({ difficulty }) => difficulty),
      ).toEqual(EXPECTED_DIFFICULTIES[track.id])
    }
  })

  it('records complete, pinned source attribution and original-content policy', () => {
    const primary = CURRICULUM_SOURCES.find(
      ({ id }) => id === CURRICULUM_SOURCE_IDS.neetcodeReference,
    )
    const openDsa = CURRICULUM_SOURCES.find(
      ({ id }) => id === CURRICULUM_SOURCE_IDS.openDsa,
    )
    const openDataStructures = CURRICULUM_SOURCES.find(
      ({ id }) => id === CURRICULUM_SOURCE_IDS.openDataStructures,
    )
    const verification = CURRICULUM_SOURCES.find(
      ({ id }) => id === CURRICULUM_SOURCE_IDS.curriculumVerification,
    )

    expect(primary?.roles).toContain('reference-solution')
    expect(primary?.license.spdxId).toBe('MIT')
    expect(openDsa?.roles).toContain('pedagogy')
    expect(openDsa?.license.spdxId).toBe('MIT')
    expect(openDataStructures?.roles).toContain('pedagogy')
    expect(openDataStructures?.license.spdxId).toBe('CC-BY-2.5')
    expect(verification?.roles).toContain('curriculum-verification')

    for (const source of CURRICULUM_SOURCES) {
      expect(source.attribution.trim().length).toBeGreaterThan(0)
      expect(source.usage.trim().length).toBeGreaterThan(0)
      expect(source.license.url).toMatch(/^https:\/\//)
      expect(source.revision?.kind).toBe('git-commit')
      expect(source.revision?.value).toMatch(/^[0-9a-f]{40}$/)
      expect(source.revision?.url).toMatch(/^https:\/\/github\.com\//)
    }

    expect(NEETCODE_150_MANIFEST.contentPolicy).toMatchObject({
      promptAuthorship: 'original',
      copiedThirdPartyStatements: false,
      copiedThirdPartyEditorials: false,
    })
  })

  it('keeps both prerequisite graphs acyclic', () => {
    const problemDependencies = new Map<ProblemId, readonly ProblemId[]>(
      NEETCODE_150_MANIFEST.problems.map((problem) => [
        problem.id,
        problem.prerequisiteProblemIds,
      ]),
    )
    const skillDependencies = new Map<SkillId, readonly SkillId[]>(
      NEETCODE_150_MANIFEST.skills.map((skill) => [
        skill.id,
        skill.prerequisiteSkillIds,
      ]),
    )

    expect(() =>
      assertAcyclic(
        [...problemDependencies.keys()],
        (id) => problemDependencies.get(id) ?? [],
      ),
    ).not.toThrow()
    expect(() =>
      assertAcyclic(
        [...skillDependencies.keys()],
        (id) => skillDependencies.get(id) ?? [],
      ),
    ).not.toThrow()
  })

  it('gives every problem skills, provenance, and a reference URL', () => {
    for (const problem of NEETCODE_150_MANIFEST.problems) {
      expect(problem.title.trim().length).toBeGreaterThan(0)
      expect(problem.skillIds.length).toBeGreaterThanOrEqual(1)
      expect(problem.skillIds.length).toBeLessThanOrEqual(4)
      expect(problem.referenceUrl).toBe(
        `https://leetcode.com/problems/${problem.leetcodeSlug}/`,
      )
      expect(problem.provenance.sourceReferenceUrl).toMatch(
        /^https:\/\/github\.com\/neetcode-gh\/leetcode\/tree\/[0-9a-f]{40}$/,
      )
      expect(problem.provenance.promptsAndStatements).toBe('original')
      expect(problem.provenance.copiedSourceMaterial).toBe(false)
    }

    expect(
      NEETCODE_150_MANIFEST.problems.find(
        ({ leetcodeSlug }) =>
          leetcodeSlug === 'minimum-interval-to-include-each-query',
      )?.title,
    ).toBe('Minimum Interval to Include Each Query')
  })
})
