export const CURRICULUM_DIFFICULTIES = ['Easy', 'Medium', 'Hard'] as const

export type Difficulty = (typeof CURRICULUM_DIFFICULTIES)[number]

export type CurriculumId = `curriculum:${string}`
export type RealmId =
  | 'realm1'
  | 'realm2'
  | 'realm3'
  | 'realm4'
  | 'realm5'
  | 'realm6'

export type TrackId =
  | 'arrays-hashing'
  | 'two-pointers'
  | 'sliding-window'
  | 'stack'
  | 'binary-search'
  | 'linked-list'
  | 'trees'
  | 'tries'
  | 'heap-priority-queue'
  | 'backtracking'
  | 'graphs'
  | 'advanced-graphs'
  | '1d-dp'
  | '2d-dp'
  | 'greedy'
  | 'intervals'
  | 'math-geometry'
  | 'bit-manipulation'

export type ProblemId = `problem:${string}`
export type SkillId = `skill:${string}`
export type SourceId = `source:${string}`
export type ContentVersion = `v${number}.${number}.${number}`
export type IsoDate = `${number}-${number}-${number}`
export type GitCommit = `${string}`

export type NonEmptyReadonlyArray<T> = readonly [T, ...T[]]

export type CurriculumVersion = {
  schema: ContentVersion
  content: ContentVersion
  releasedAt: IsoDate
}

export type SourceRole =
  | 'reference-solution'
  | 'pedagogy'
  | 'curriculum-verification'
  | 'problem-metadata'

export type SourceLicense = {
  /** SPDX identifier when one applies; NOASSERTION avoids inventing a license. */
  spdxId: 'MIT' | 'CC-BY-2.5' | 'NOASSERTION'
  name: string
  url: string
  attributionRequired: boolean
}

export type SourceRevision =
  | {
      kind: 'git-commit'
      value: GitCommit
      url: string
      verifiedAt: IsoDate
    }
  | {
      kind: 'edition'
      value: string
      url: string
      verifiedAt: IsoDate
    }

export type SourceRecord = {
  id: SourceId
  name: string
  owner: string
  url: string
  roles: NonEmptyReadonlyArray<SourceRole>
  license: SourceLicense
  revision?: SourceRevision
  attribution: string
  usage: string
}

export type SkillSpec = {
  id: SkillId
  /** Short, original name shown to learners as the reusable pattern. */
  patternLabel: string
  prerequisiteSkillIds: readonly SkillId[]
}

export type ProblemProvenance = {
  primaryReferenceSourceId: SourceId
  curriculumVerificationSourceId: SourceId
  pedagogySourceIds: readonly SourceId[]
  sourceReferenceUrl: string
  promptsAndStatements: 'original'
  copiedSourceMaterial: false
}

export type ProblemSummary = {
  id: ProblemId
  title: string
  leetcodeSlug: string
  difficulty: Difficulty
  realmId: RealmId
  trackId: TrackId
  /** One-based order across the full curriculum. */
  globalOrder: number
  /** One-based order inside the problem's track. */
  trackOrder: number
  skillIds: NonEmptyReadonlyArray<SkillId>
  prerequisiteProblemIds: readonly ProblemId[]
  /** Metadata link only; no statement or editorial content is stored. */
  referenceUrl: string
  contentVersion: ContentVersion
  provenance: ProblemProvenance
}

export type TrackSpec = {
  id: TrackId
  realmId: RealmId
  title: string
  /** One-based checkpoint order inside the realm. */
  realmOrder: 1 | 2 | 3
  problemCount: number
  problemIds: readonly ProblemId[]
  skillIds: readonly SkillId[]
}

export type RealmSpec = {
  id: RealmId
  title: string
  order: 1 | 2 | 3 | 4 | 5 | 6
  trackIds: readonly [TrackId, TrackId, TrackId]
}

export type MasteryEvidenceKind =
  | 'acquisition'
  | 'independent-transfer'
  | 'delayed-retrieval'
  | 'code-tests'

export type MasteryPolicy = {
  version: ContentVersion
  requiredEvidence: NonEmptyReadonlyArray<MasteryEvidenceKind>
  acquisitionMinimumScore: number
  transferMinimumScore: number
  delayedRetrievalMinimumScore: number
  delayedRetrievalMinimumHours: number
  requiredDelayedRetrievals: number
  bossMinimumScore: number
  requiresAllTrackCoverage: boolean
  requiresPassingCodeTests: boolean
}

export type ContentPolicy = {
  promptAuthorship: 'original'
  copiedThirdPartyStatements: false
  copiedThirdPartyEditorials: false
  prohibitedContentSources: NonEmptyReadonlyArray<string>
  metadataOnlyFields: NonEmptyReadonlyArray<
    'title' | 'leetcodeSlug' | 'difficulty' | 'referenceUrl'
  >
}

export type CurriculumManifest = {
  id: CurriculumId
  title: string
  version: CurriculumVersion
  masteryPolicy: MasteryPolicy
  contentPolicy: ContentPolicy
  sources: readonly SourceRecord[]
  skills: readonly SkillSpec[]
  realms: readonly [
    RealmSpec,
    RealmSpec,
    RealmSpec,
    RealmSpec,
    RealmSpec,
    RealmSpec,
  ]
  tracks: readonly TrackSpec[]
  problems: readonly ProblemSummary[]
}

export const toProblemId = (leetcodeSlug: string): ProblemId =>
  `problem:${leetcodeSlug}`

export const toSkillId = (value: string): SkillId => `skill:${value}`
