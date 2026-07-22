import type { ProblemMissionSeed } from '../../problemMissionSeed'

type Unguided<T> = Omit<T, 'feedback' | 'hints'>

/**
 * Realm 2 missions share the same evidence arc, but each module supplies its
 * own story, invariant, examples, choices, visuals, and transfer cases.
 */
export type Realm2MissionSeedInput = Omit<
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

export function createRealm2MissionSeed(
  input: Realm2MissionSeedInput,
): ProblemMissionSeed {
  const { keyRule, ...content } = input
  const recallPhrase = input.retrievalCheck.acceptedAnswers[0]

  return {
    ...content,
    patternCheck: {
      ...input.patternCheck,
      feedback: {
        correct: `Exactly. ${input.recognitionCue} ${keyRule}`,
        incorrect: `That plan loses needed state in “${input.mission.title}.”`,
        secondIncorrect: `Choose the plan that preserves this rule: ${keyRule}`,
      },
      hints: [input.recognitionCue, keyRule],
    },
    retrievalCheck: {
      ...input.retrievalCheck,
      feedback: {
        correct: `Right. The key rule is: ${keyRule}`,
        incorrect: `Name the key rule for “${input.mission.title}.”`,
        secondIncorrect: `A precise answer can begin with “${recallPhrase}.”`,
      },
      hints: [input.recognitionCue, `Recall this rule: ${keyRule}`],
    },
    reconstructionCheck: {
      ...input.reconstructionCheck,
      feedback: {
        correct: `Order restored. ${keyRule}`,
        incorrect: `One action breaks the invariant. Common trap: ${input.misconception}`,
        secondIncorrect: `Build the order around this rule: ${keyRule}`,
      },
      hints: [
        `Set up “${input.mission.title}” before repeated work. Return last.`,
        keyRule,
      ],
    },
    pythonChallenge: {
      ...input.pythonChallenge,
      feedback: {
        correct: `Mission complete. ${input.objective}`,
        incorrect:
          'At least one boundary or adversarial case broke the intended invariant.',
        secondIncorrect: `Trace the smallest case while preserving: ${keyRule}`,
      },
      hints: [
        `Read “${input.mission.title}” input from the JSON object.`,
        keyRule,
        `Return the JSON value for “${input.mission.title}.” Do not print it.`,
      ],
    },
  }
}
