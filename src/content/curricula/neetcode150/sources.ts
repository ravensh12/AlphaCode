import type { SourceId, SourceRecord } from '../../../types/curriculum'

export const NEETCODE_REFERENCE_REVISION =
  '9907b7fed441fa55083c0751e208b7197101dbba'
export const OPENDSA_REVISION = 'f4e4afcee2fcc0b47a888ebb5648c8ebb659c53c'
export const OPEN_DATA_STRUCTURES_REVISION =
  '9d22c44906dda2017b2ef0c762025bee644b58aa'
export const CURRICULUM_VERIFICATION_REVISION =
  '7c6bbaf82765ca726fd54756fe7b59ba2e14e140'

export const CURRICULUM_SOURCE_IDS = {
  neetcodeReference: 'source:neetcode-gh-leetcode',
  openDsa: 'source:opendsa',
  openDataStructures: 'source:open-data-structures',
  curriculumVerification: 'source:neetcode-150-list-verification',
} as const satisfies Record<string, SourceId>

export const NEETCODE_REFERENCE_URL =
  `https://github.com/neetcode-gh/leetcode/tree/${NEETCODE_REFERENCE_REVISION}`

export const CURRICULUM_SOURCES = [
  {
    id: CURRICULUM_SOURCE_IDS.neetcodeReference,
    name: 'neetcode-gh/leetcode',
    owner: 'neetcode-gh contributors',
    url: NEETCODE_REFERENCE_URL,
    roles: ['reference-solution'],
    license: {
      spdxId: 'MIT',
      name: 'MIT License',
      url: `https://github.com/neetcode-gh/leetcode/blob/${NEETCODE_REFERENCE_REVISION}/LICENSE`,
      attributionRequired: true,
    },
    revision: {
      kind: 'git-commit',
      value: NEETCODE_REFERENCE_REVISION,
      url: `https://github.com/neetcode-gh/leetcode/commit/${NEETCODE_REFERENCE_REVISION}`,
      verifiedAt: '2026-07-11',
    },
    attribution:
      'Reference solutions © neetcode-gh contributors, provided under the MIT License.',
    usage:
      'Primary reference-solution source. The manifest stores links and provenance only; it copies no solution code.',
  },
  {
    id: CURRICULUM_SOURCE_IDS.openDsa,
    name: 'OpenDSA',
    owner: 'Ville Karavirta, Clifford A. Shaffer, and OpenDSA contributors',
    url: `https://github.com/OpenDSA/OpenDSA/tree/${OPENDSA_REVISION}`,
    roles: ['pedagogy'],
    license: {
      spdxId: 'MIT',
      name: 'MIT License',
      url: `https://github.com/OpenDSA/OpenDSA/blob/${OPENDSA_REVISION}/MIT-license.txt`,
      attributionRequired: true,
    },
    revision: {
      kind: 'git-commit',
      value: OPENDSA_REVISION,
      url: `https://github.com/OpenDSA/OpenDSA/commit/${OPENDSA_REVISION}`,
      verifiedAt: '2026-07-11',
    },
    attribution:
      'OpenDSA content © Ville Karavirta, Clifford A. Shaffer, and contributors, used under the MIT License.',
    usage:
      'Pedagogy reference for data-structure and algorithm explanations. Any AlphaCode instruction must be newly written.',
  },
  {
    id: CURRICULUM_SOURCE_IDS.openDataStructures,
    name: 'Open Data Structures',
    owner: 'Pat Morin and Open Data Structures contributors',
    url: `https://github.com/patmorin/ods/tree/${OPEN_DATA_STRUCTURES_REVISION}`,
    roles: ['pedagogy'],
    license: {
      spdxId: 'CC-BY-2.5',
      name: 'Creative Commons Attribution 2.5 Canada',
      url: 'https://creativecommons.org/licenses/by/2.5/ca/',
      attributionRequired: true,
    },
    revision: {
      kind: 'git-commit',
      value: OPEN_DATA_STRUCTURES_REVISION,
      url: `https://github.com/patmorin/ods/commit/${OPEN_DATA_STRUCTURES_REVISION}`,
      verifiedAt: '2026-07-11',
    },
    attribution:
      'Open Data Structures by Pat Morin and contributors, licensed under CC BY 2.5 Canada.',
    usage:
      'Pedagogy reference for foundational data structures. AlphaCode content must provide attribution and be independently phrased.',
  },
  {
    id: CURRICULUM_SOURCE_IDS.curriculumVerification,
    name: 'th-blitz/NeetCode-150',
    owner: 'Preetham Rakshith Prakasha and contributors',
    url: `https://github.com/th-blitz/NeetCode-150/tree/${CURRICULUM_VERIFICATION_REVISION}`,
    roles: ['curriculum-verification', 'problem-metadata'],
    license: {
      spdxId: 'MIT',
      name: 'MIT License',
      url: `https://github.com/th-blitz/NeetCode-150/blob/${CURRICULUM_VERIFICATION_REVISION}/LICENSE`,
      attributionRequired: true,
    },
    revision: {
      kind: 'git-commit',
      value: CURRICULUM_VERIFICATION_REVISION,
      url: `https://github.com/th-blitz/NeetCode-150/commit/${CURRICULUM_VERIFICATION_REVISION}`,
      verifiedAt: '2026-07-11',
    },
    attribution:
      'Curriculum-list cross-check © Preetham Rakshith Prakasha and contributors, provided under the MIT License.',
    usage:
      'Independent public cross-check for list membership and canonical problem metadata; no problem statements or solution code are copied.',
  },
] as const satisfies readonly SourceRecord[]
