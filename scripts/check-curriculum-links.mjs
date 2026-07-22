import { readFile, readdir } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'

const root = fileURLToPath(new URL('../', import.meta.url))
const sourcesPath = new URL(
  '../src/content/curricula/neetcode150/sources.ts',
  import.meta.url,
)
const realmsPath = new URL(
  '../src/content/curricula/neetcode150/problems/',
  import.meta.url,
)

const source = await readFile(sourcesPath, 'utf8')

function revision(name) {
  const match = source.match(
    new RegExp(
      `export const ${name}\\s*=\\s*['"]([0-9a-f]{40})['"]`,
      'u',
    ),
  )
  if (!match) throw new Error(`Could not read pinned revision ${name}`)
  return match[1]
}

const neetcode = revision('NEETCODE_REFERENCE_REVISION')
const openDsa = revision('OPENDSA_REVISION')
const ods = revision('OPEN_DATA_STRUCTURES_REVISION')
const verification = revision('CURRICULUM_VERIFICATION_REVISION')

const pinnedUrls = [
  `https://github.com/neetcode-gh/leetcode/tree/${neetcode}`,
  `https://github.com/neetcode-gh/leetcode/blob/${neetcode}/LICENSE`,
  `https://github.com/neetcode-gh/leetcode/commit/${neetcode}`,
  `https://github.com/OpenDSA/OpenDSA/tree/${openDsa}`,
  `https://github.com/OpenDSA/OpenDSA/blob/${openDsa}/MIT-license.txt`,
  `https://github.com/OpenDSA/OpenDSA/commit/${openDsa}`,
  `https://github.com/patmorin/ods/tree/${ods}`,
  `https://github.com/patmorin/ods/commit/${ods}`,
  'https://creativecommons.org/licenses/by/2.5/ca/',
  `https://github.com/th-blitz/NeetCode-150/tree/${verification}`,
  `https://github.com/th-blitz/NeetCode-150/blob/${verification}/LICENSE`,
  `https://github.com/th-blitz/NeetCode-150/commit/${verification}`,
]

async function problemSlugs() {
  const realmDirectories = (await readdir(realmsPath, { withFileTypes: true }))
    .filter((entry) => entry.isDirectory() && /^realm[1-6]$/u.test(entry.name))
    .map(({ name }) => name)
    .sort()
  const slugs = []
  for (const realm of realmDirectories) {
    const indexPath = new URL(
      `../src/content/curricula/neetcode150/problems/${realm}/index.ts`,
      import.meta.url,
    )
    const index = await readFile(indexPath, 'utf8')
    for (const match of index.matchAll(/['"]problem:([^'"]+)['"]\s*:/gu)) {
      slugs.push(match[1])
    }
  }
  if (slugs.length !== 150 || new Set(slugs).size !== 150) {
    throw new Error(
      `Expected 150 unique problem links from ${root}; found ${slugs.length}/${new Set(slugs).size}`,
    )
  }
  return slugs
}

async function check(url) {
  const headers = {
    'user-agent': 'AlphaCode-curriculum-link-check/1.0',
  }
  try {
    let response = await fetch(url, {
      method: 'HEAD',
      redirect: 'follow',
      headers,
      signal: AbortSignal.timeout(15_000),
    })
    if (response.status === 405 || response.status === 501) {
      response = await fetch(url, {
        method: 'GET',
        redirect: 'follow',
        headers: { ...headers, range: 'bytes=0-0' },
        signal: AbortSignal.timeout(15_000),
      })
      await response.body?.cancel()
    }
    return {
      url,
      ok: response.status >= 200 && response.status < 400,
      status: response.status,
    }
  } catch (error) {
    return {
      url,
      ok: false,
      status: 0,
      error: error instanceof Error ? error.message : String(error),
    }
  }
}

const includeProblems = process.argv.includes('--all-problems')
const urls = [
  ...pinnedUrls,
  ...(includeProblems
    ? (await problemSlugs()).map(
        (slug) => `https://leetcode.com/problems/${slug}/`,
      )
    : []),
]

const results = []
for (let index = 0; index < urls.length; index += 8) {
  results.push(...(await Promise.all(urls.slice(index, index + 8).map(check))))
}

const failures = results.filter(({ ok }) => !ok)
console.info(
  `Curriculum links: ${results.length - failures.length}/${results.length} reachable.`,
)
for (const failure of failures) {
  console.error(
    `- ${failure.url}: ${failure.status || failure.error || 'request failed'}`,
  )
}
if (failures.length > 0) process.exitCode = 1
