import { createHash } from 'node:crypto'
import { mkdir, writeFile } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const OUTPUT = resolve(
  ROOT,
  'src/content/curricula/neetcode150/generated/source-lock.json',
)

const SOURCES = [
  {
    id: 'source:neetcode-gh-leetcode',
    owner: 'neetcode-gh',
    repo: 'leetcode',
    revision: '9907b7fed441fa55083c0751e208b7197101dbba',
    licensePath: 'LICENSE',
    license: 'MIT',
  },
  {
    id: 'source:opendsa',
    owner: 'OpenDSA',
    repo: 'OpenDSA',
    revision: 'f4e4afcee2fcc0b47a888ebb5648c8ebb659c53c',
    licensePath: 'MIT-license.txt',
    license: 'MIT',
  },
  {
    id: 'source:open-data-structures',
    owner: 'patmorin',
    repo: 'ods',
    revision: '9d22c44906dda2017b2ef0c762025bee644b58aa',
    licensePath: 'COPYING',
    license: 'CC-BY-2.5',
  },
  {
    id: 'source:neetcode-150-list-verification',
    owner: 'th-blitz',
    repo: 'NeetCode-150',
    revision: '7c6bbaf82765ca726fd54756fe7b59ba2e14e140',
    licensePath: 'LICENSE',
    license: 'MIT',
  },
]

const sha256 = (value) =>
  createHash('sha256').update(value, 'utf8').digest('hex')

async function fetchText(url) {
  const response = await fetch(url, {
    headers: {
      Accept: 'application/vnd.github+json',
      'User-Agent': 'AlphaCode-curriculum-source-verifier',
    },
  })
  if (!response.ok) {
    throw new Error(`${response.status} ${response.statusText}: ${url}`)
  }
  return response.text()
}

async function verifySource(source) {
  const repository = `${source.owner}/${source.repo}`
  const commitUrl = `https://api.github.com/repos/${repository}/commits/${source.revision}`
  const commit = JSON.parse(await fetchText(commitUrl))
  if (commit.sha !== source.revision) {
    throw new Error(
      `${source.id} resolved to ${commit.sha}; expected ${source.revision}`,
    )
  }

  const licenseUrl =
    `https://raw.githubusercontent.com/${repository}/${source.revision}/` +
    source.licensePath
  const licenseText = await fetchText(licenseUrl)

  return {
    id: source.id,
    repository,
    revision: source.revision,
    commitUrl: commit.html_url,
    license: source.license,
    licenseUrl,
    licenseSha256: sha256(licenseText),
  }
}

const verified = []
for (const source of SOURCES) {
  verified.push(await verifySource(source))
}

await mkdir(dirname(OUTPUT), { recursive: true })
await writeFile(
  OUTPUT,
  `${JSON.stringify(
    {
      schemaVersion: 1,
      policy:
        'Metadata, licensed reference solutions, and pedagogy references only. No LeetCode or neetcode.io statements, editorials, or transcripts.',
      sources: verified,
    },
    null,
    2,
  )}\n`,
  'utf8',
)

console.log(`Verified ${verified.length} pinned sources.`)
console.log(`Wrote ${OUTPUT}`)
