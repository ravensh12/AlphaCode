import type { ProblemMissionSeed } from '../../problemMissionSeed'

type Unguided<T> = Omit<T, 'feedback' | 'hints'>

/**
 * Realm 4 authors supply every problem-specific story, visual, assessment,
 * and transfer case. This helper only keeps the feedback arc consistent.
 */
export type Realm4MissionSeedInput = Omit<
  ProblemMissionSeed,
  | 'patternCheck'
  | 'retrievalCheck'
  | 'reconstructionCheck'
  | 'pythonChallenge'
> & {
  keyRule: string
  patternCheck: Unguided<ProblemMissionSeed['patternCheck']>
  retrievalCheck: Unguided<ProblemMissionSeed['retrievalCheck']>
  reconstructionCheck: Unguided<ProblemMissionSeed['reconstructionCheck']>
  pythonChallenge: Unguided<ProblemMissionSeed['pythonChallenge']>
}

export function createRealm4MissionSeed(
  input: Realm4MissionSeedInput,
): ProblemMissionSeed {
  const { keyRule, ...content } = input
  const recallPhrase = input.retrievalCheck.acceptedAnswers[0]

  return {
    ...content,
    patternCheck: {
      ...input.patternCheck,
      feedback: {
        correct: `Exactly. ${keyRule}`,
        incorrect: `That plan breaks needed state in “${input.mission.title}.”`,
        secondIncorrect: `Use the recognition cue, then protect this rule: ${keyRule}`,
      },
      hints: [input.recognitionCue, keyRule],
    },
    retrievalCheck: {
      ...input.retrievalCheck,
      feedback: {
        correct: `Right. ${keyRule}`,
        incorrect: `Name the key state for “${input.mission.title}.”`,
        secondIncorrect: `A precise response can begin with “${recallPhrase}.”`,
      },
      hints: [input.recognitionCue, `Recall the rule: ${keyRule}`],
    },
    reconstructionCheck: {
      ...input.reconstructionCheck,
      feedback: {
        correct: `Order restored. ${keyRule}`,
        incorrect: `One action breaks the invariant. Watch for this trap: ${input.misconception}`,
        secondIncorrect: `Arrange the actions around this rule: ${keyRule}`,
      },
      hints: [
        `Set up “${input.mission.title}” before searching. Return last.`,
        keyRule,
      ],
    },
    pythonChallenge: {
      ...input.pythonChallenge,
      feedback: {
        correct: `Mission complete. ${input.objective}`,
        incorrect:
          'A visible, boundary, or adversarial input broke the intended invariant.',
        secondIncorrect: `Trace the smallest input while preserving: ${keyRule}`,
      },
      hints: [
        `Read “${input.mission.title}” input from the JSON object.`,
        keyRule,
        `Return the JSON result for “${input.mission.title}.” Do not print it.`,
      ],
    },
  }
}
