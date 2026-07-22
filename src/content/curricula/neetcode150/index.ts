import type {
  ProblemId,
  ProblemSummary,
  RealmId,
  RealmSpec,
  TrackId,
  TrackSpec,
} from '../../../types/curriculum'
import {
  NEETCODE_150_PROBLEMS,
  NEETCODE_150_REALMS,
  NEETCODE_150_TRACKS,
} from './manifest'

export {
  NEETCODE_150_CONTENT_VERSION,
  NEETCODE_150_MANIFEST,
  NEETCODE_150_PROBLEMS,
  NEETCODE_150_REALMS,
  NEETCODE_150_SKILLS,
  NEETCODE_150_TRACKS,
} from './manifest'
export {
  CURRICULUM_SOURCES,
  CURRICULUM_SOURCE_IDS,
  CURRICULUM_VERIFICATION_REVISION,
  NEETCODE_REFERENCE_REVISION,
  NEETCODE_REFERENCE_URL,
  OPEN_DATA_STRUCTURES_REVISION,
  OPENDSA_REVISION,
} from './sources'
export {
  NEETCODE_150_PROBLEM_LESSON_REGISTRY,
  ProblemLessonRegistry,
  hasRegisteredProblemLesson,
  listRegisteredProblemLessons,
  loadProblemLesson,
  registerProblemLesson,
  registerProblemLessonLoaders,
} from './problemRegistry'
export { NEETCODE_150_PROBLEM_LESSON_LOADERS } from './problemLessonLoaders.generated'
export {
  PROBLEM_MISSION_EVIDENCE_BY_ASSESSMENT,
  PROBLEM_MISSION_PYTHON_CASE_CLASSES,
  PROBLEM_MISSION_STAGE_ORDER,
  createProblemMission,
  resolveProblemMissionManifestContext,
} from './problemMissionFactory'
export {
  CERTIFICATION_ITEM_BANK,
  CERTIFICATION_TRACK_INTERLEAVE_ORDER,
  buildCertificationAssessment,
  buildNeetcode150CertificationAssessment,
  certificationAssessmentOutcome,
  evaluateCertificationGate,
} from './certificationAssessment'
export type {
  CertificationAssessment,
  CertificationBankItem,
  CertificationGate,
  CertificationOutcome,
  CertificationRecognitionItem,
  CertificationStepMetadata,
  CertificationTrackResult,
  CertificationTransferItem,
} from './certificationAssessment'
export type {
  ProblemLessonLoader,
  ProblemLessonLoaderResult,
  ProblemLessonModule,
} from './problemRegistry'
export type {
  ProblemMissionManifestContext,
} from './problemMissionFactory'
export type {
  ProblemMissionAdditionalPythonCaseSeed,
  ProblemMissionAlgorithmStepSeed,
  ProblemMissionChoiceOptionSeed,
  ProblemMissionGuidanceSeed,
  ProblemMissionPythonCaseSeed,
  ProblemMissionPythonCasesSeed,
  ProblemMissionSeed,
  ProblemMissionSeedKey,
  ProblemMissionVisualSeed,
} from './problemMissionSeed'
export type {
  ContentPolicy,
  ContentVersion,
  CurriculumId,
  CurriculumManifest,
  CurriculumVersion,
  Difficulty,
  MasteryPolicy,
  ProblemId,
  ProblemProvenance,
  ProblemSummary,
  RealmId,
  RealmSpec,
  SkillId,
  SkillSpec,
  SourceId,
  SourceRecord,
  TrackId,
  TrackSpec,
} from '../../../types/curriculum'

export const NEETCODE_150_REALM_BY_ID: ReadonlyMap<RealmId, RealmSpec> =
  new Map(NEETCODE_150_REALMS.map((realm) => [realm.id, realm]))

export const NEETCODE_150_TRACK_BY_ID: ReadonlyMap<TrackId, TrackSpec> =
  new Map(NEETCODE_150_TRACKS.map((track) => [track.id, track]))

export const NEETCODE_150_PROBLEM_BY_ID: ReadonlyMap<
  ProblemId,
  ProblemSummary
> = new Map(NEETCODE_150_PROBLEMS.map((problem) => [problem.id, problem]))

export const NEETCODE_150_PROBLEM_BY_SLUG: ReadonlyMap<
  string,
  ProblemSummary
> = new Map(
  NEETCODE_150_PROBLEMS.map((problem) => [problem.leetcodeSlug, problem]),
)

