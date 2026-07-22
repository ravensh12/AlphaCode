import { expect, test, type Page } from '@playwright/test'
import { NEETCODE_150_MANIFEST } from '../src/content/curricula/neetcode150/manifest'

const EMPTY_GUEST_PROGRESS = {
  streak: { current: 0, longest: 0 },
  lessons: {},
  badgeCounts: {
    lightning: 0,
    quick: 0,
    'speed-demon': 0,
    flawless: 0,
  },
  academyProgress: {
    schemaVersion: 1,
    curriculumId: 'curriculum:neetcode150',
    curriculumVersion: 'v1.0.0',
    contentVersion: 'v1.0.0',
    missionCompletions: {},
    realmQuizzes: {},
    bossDefeats: {},
  },
} as const

async function installLocalState(
  page: Page,
  identity: 'guest' | 'signed-out',
): Promise<void> {
  await page.addInitScript(
    ({ identity: nextIdentity, progress }) => {
      localStorage.clear()
      sessionStorage.clear()
      if (nextIdentity === 'guest') {
        localStorage.setItem('alphacode.guest', 'true')
        localStorage.setItem(
          'alphacode.progress.guest',
          JSON.stringify(progress),
        )
      }
    },
    { identity, progress: EMPTY_GUEST_PROGRESS },
  )
}

const missionPath = (
  problem: (typeof NEETCODE_150_MANIFEST.problems)[number],
): string =>
  `/academy/${problem.realmId}/${problem.trackId}/${problem.leetcodeSlug}`

test('landing sends a signed-out learner through deterministic guest auth', async ({
  page,
}) => {
  test.setTimeout(60_000)
  await installLocalState(page, 'signed-out')
  await page.goto('/')

  await expect(page.getByRole('heading', { name: 'AlphaCode' })).toBeVisible()
  await page.getByRole('link', { name: 'Play Now' }).click()
  await expect(page).toHaveURL(/\/auth$/u)
  await expect(
    page.getByRole('button', { name: 'Continue as guest' }),
  ).toBeVisible()

  await page.getByRole('button', { name: 'Continue as guest' }).click()
  await expect(page).toHaveURL(/\/intro$/u)
  // The intro chunk got heavier with the city redesign; give a dev-server
  // cold compile room to finish.
  await expect(page.getByRole('button', { name: 'Skip' })).toBeVisible({
    timeout: 60_000,
  })
})

test('Realm 1 academy track and first mission render for a guest', async ({
  page,
}) => {
  await installLocalState(page, 'guest')
  await page.goto('/academy/realm1/arrays-hashing')

  await expect(
    page.getByRole('heading', { name: 'Arrays & Hashing' }),
  ).toBeVisible()
  await expect(page.locator('.academy-missions > li')).toHaveCount(9)
  await expect(page.getByText('Contains Duplicate', { exact: true })).toBeVisible()

  await page.goto(
    '/academy/realm1/arrays-hashing/contains-duplicate',
  )
  await expect(
    page.getByRole('heading', { name: 'Contains Duplicate', level: 1 }),
  ).toBeVisible()
  await expect(page.getByText('The Echoing Badge Alarm')).toBeVisible()
  await expect(page.getByText('Something broke')).toHaveCount(0)
})

test('all 150 mission routes respond and every track has a render sample', async ({
  page,
  request,
}) => {
  test.setTimeout(90_000)
  expect(NEETCODE_150_MANIFEST.problems).toHaveLength(150)

  const paths = NEETCODE_150_MANIFEST.problems.map(missionPath)
  for (let start = 0; start < paths.length; start += 25) {
    const responses = await Promise.all(
      paths.slice(start, start + 25).map((path) => request.get(path)),
    )
    for (const response of responses) {
      expect(response.status()).toBe(200)
      expect(await response.text()).toContain('<div id="root"></div>')
    }
  }

  await installLocalState(page, 'guest')
  const samples = NEETCODE_150_MANIFEST.tracks.map((track) => {
    const problem = NEETCODE_150_MANIFEST.problems.find(
      ({ id }) => id === track.problemIds[0],
    )
    if (!problem) throw new Error(`Track ${track.id} has no render sample`)
    return problem
  })
  expect(samples).toHaveLength(18)

  for (const sample of samples) {
    await page.goto(missionPath(sample))
    await expect(page.locator('h1').first()).toBeVisible()
    await expect(page.getByText('Something broke')).toHaveCount(0)
  }
})

test('demo guarantee is permanently labeled and bad academy routes are safe', async ({
  page,
}) => {
  await installLocalState(page, 'guest')
  await page.goto('/demo/guarantee')

  await expect(page.getByText(/DEMO ONLY/u).first()).toBeVisible()
  await expect(
    page.getByText(/No payment provider is connected and no money can move/u)
      .first(),
  ).toBeVisible()

  await page.goto('/academy/not-a-realm/not-a-track')
  await expect(page).toHaveURL(/\/quest\/list$/u)
  await expect(page.getByText('Something broke')).toHaveCount(0)
})

test('browser Python judge distinguishes a correct and wrong tiny solution', async ({
  page,
}) => {
  // The harness imports the judge straight from the dev server's /src module
  // graph; a production preview build has no such path. Dev-server runs
  // (the default, and CI) execute this in full.
  test.skip(
    process.env.E2E_PREVIEW === '1',
    'Python judge harness imports /src/… from the dev server; not available under vite preview',
  )
  test.setTimeout(90_000)
  await installLocalState(page, 'guest')
  await page.goto('/')

  const result = await page.evaluate(async () => {
    const { PythonJudgeClient } = await import('/src/hooks/usePythonJudge.ts')
    const assessment = {
      schemaVersion: 1,
      id: 'assessment:e2e:add-one',
      kind: 'pythonCode',
      prompt: 'Return the integer plus one.',
      evidenceKind: 'code-tests',
      entrypoint: { kind: 'function', name: 'solve' },
      codecs: {
        arguments: [{ kind: 'integer' }],
        result: { kind: 'integer' },
      },
      cases: [
        {
          id: 'case:e2e:positive',
          arguments: [2],
          expected: 3,
          visibility: 'example',
        },
        {
          id: 'case:e2e:negative',
          arguments: [-4],
          expected: -3,
          visibility: 'hidden',
        },
      ],
      comparator: { kind: 'deepEqual' },
      limits: {
        timeoutMs: 5_000,
        memoryMb: 64,
        maxOutputBytes: 2_048,
        maxSourceBytes: 16_384,
      },
      starterCode: 'def solve(value):\n    pass',
    } as const
    const client = new PythonJudgeClient({
      initializationTimeoutMs: 60_000,
    })
    try {
      const correct = await client.run(assessment, {
        kind: 'pythonCode',
        code: 'def solve(value):\n    return value + 1',
      })
      const wrong = await client.run(assessment, {
        kind: 'pythonCode',
        code: 'def solve(value):\n    return value',
      })
      return {
        correctStatus: correct.status,
        correctPassed: correct.passedCases,
        correctError: correct.error,
        wrongStatus: wrong.status,
        wrongPassed: wrong.passedCases,
        wrongError: wrong.error,
      }
    } finally {
      client.dispose()
    }
  })

  expect(result).toEqual({
    correctStatus: 'passed',
    correctPassed: 2,
    correctError: undefined,
    wrongStatus: 'failed',
    wrongPassed: 0,
    wrongError: undefined,
  })
})
