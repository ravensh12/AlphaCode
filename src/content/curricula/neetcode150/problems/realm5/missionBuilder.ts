import type { DiagramSpec } from '../../../../../types/diagram'
import type {
  ProblemMissionPythonCasesSeed,
  ProblemMissionSeed,
} from '../../problemMissionSeed'

type WorkedExampleConfig = {
  prompt: string
  code: ProblemMissionSeed['workedExample']['code']
  walkthrough: ProblemMissionSeed['workedExample']['walkthrough']
  currentLineIndex?: number
  diagram?: DiagramSpec
  diagramSequence?: readonly DiagramSpec[]
}

type PatternCheckConfig = {
  prompt: string
  correct: string
  distractors: readonly [string, string, string]
  hint: string
  diagram?: DiagramSpec
}

type RetrievalCheckConfig = {
  prompt: string
  acceptedAnswers: ProblemMissionSeed['retrievalCheck']['acceptedAnswers']
  placeholder?: string
  hint: string
  diagram?: DiagramSpec
}

type PythonChallengeConfig = {
  prompt: string
  starterCode: string
  cases: ProblemMissionPythonCasesSeed
  hints: ProblemMissionSeed['pythonChallenge']['hints']
  diagram?: DiagramSpec
}

export type Realm5MissionConfig = Pick<
  ProblemMissionSeed,
  | 'slug'
  | 'estimatedMinutes'
  | 'mission'
  | 'objective'
  | 'priorKnowledge'
  | 'recognitionCue'
  | 'misconception'
  | 'algorithmSteps'
  | 'complexity'
> & {
  diagram: DiagramSpec
  workedExample: WorkedExampleConfig
  patternCheck: PatternCheckConfig
  retrievalCheck: RetrievalCheckConfig
  reconstructionPrompt: string
  pythonChallenge: PythonChallengeConfig
}

/**
 * Supplies the repeated assessment guidance while each problem module owns
 * its scenario, invariant, transition, trace, choices, retrieval, and cases.
 */
export function buildRealm5Mission(
  config: Realm5MissionConfig,
): ProblemMissionSeed {
  const {
    diagram,
    reconstructionPrompt,
    patternCheck,
    retrievalCheck,
    pythonChallenge,
    workedExample,
    ...mission
  } = config

  return {
    ...mission,
    explanationVisuals: { diagram },
    workedExample: {
      ...workedExample,
      diagram: workedExample.diagram ?? diagram,
    },
    patternCheck: {
      prompt: patternCheck.prompt,
      options: [
        { id: 'preserve-key-rule', label: patternCheck.correct },
        { id: 'use-local-guess', label: patternCheck.distractors[0] },
        { id: 'discard-needed-state', label: patternCheck.distractors[1] },
        { id: 'enumerate-every-plan', label: patternCheck.distractors[2] },
      ],
      correctOptionId: 'preserve-key-rule',
      feedback: {
        correct: `Correct for “${config.mission.title}.” The needed state stays available.`,
        incorrect: `“${config.mission.title}” needs a different state update. Check the common trap.`,
        secondIncorrect: `Use the recognition cue: ${config.recognitionCue}`,
      },
      hints: [patternCheck.hint, config.recognitionCue],
      diagram: patternCheck.diagram ?? diagram,
    },
    retrievalCheck: {
      prompt: retrievalCheck.prompt,
      acceptedAnswers: retrievalCheck.acceptedAnswers,
      ...(retrievalCheck.placeholder === undefined
        ? {}
        : { placeholder: retrievalCheck.placeholder }),
      feedback: {
        correct: `Yes. That is the key state for “${config.mission.title}.”`,
        incorrect: `Name the stored state and update used by “${config.mission.title}.”`,
        secondIncorrect: `Avoid this trap: ${config.misconception}`,
      },
      hints: [retrievalCheck.hint, config.objective],
      ...(retrievalCheck.diagram === undefined
        ? {}
        : { diagram: retrievalCheck.diagram }),
    },
    reconstructionCheck: {
      prompt: reconstructionPrompt,
      feedback: {
        correct: `Sequence restored for “${config.mission.title}.” Each step prepares the next.`,
        incorrect: `Recheck the setup and step order for “${config.mission.title}.”`,
        secondIncorrect: `Start with the base state for “${config.mission.title}.” Return after the full state is ready.`,
      },
      hints: [
        `Set the base cases for “${config.mission.title}” first.`,
        `Return after the full “${config.mission.title}” state is ready.`,
      ],
      diagram,
    },
    pythonChallenge: {
      prompt: pythonChallenge.prompt,
      starterCode: pythonChallenge.starterCode,
      cases: pythonChallenge.cases,
      feedback: {
        correct: `Mission complete for “${config.mission.title}.” Its state rule held.`,
        incorrect: `A “${config.mission.title}” case broke the state rule.`,
        secondIncorrect: `Watch for the known trap: ${config.misconception}`,
      },
      hints: pythonChallenge.hints,
      diagram: pythonChallenge.diagram ?? diagram,
    },
  }
}
