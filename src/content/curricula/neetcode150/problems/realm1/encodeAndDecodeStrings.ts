import { createProblemMission } from '../../problemMissionFactory'
import type { ProblemMissionSeed } from '../../problemMissionSeed'

export const encodeAndDecodeStringsMissionSeed = {
  slug: 'encode-and-decode-strings',
  estimatedMinutes: 24,
  mission: {
    title: 'The Deep-Space Message Crate',
    context:
      'A probe can transmit only one string at a time, but the crew needs to pack a whole list of messages. Messages may be empty or may contain the separator #.',
    prompt:
      'Build a reversible format by writing each message length before its contents, then unpack it without guessing where a message ends.',
  },
  objective:
    'Encode and decode arbitrary strings with a length prefix and delimiter.',
  priorKnowledge: [
    'A string length tells exactly how many characters to read.',
    'Several pieces can be joined into one string.',
    'Digit characters can be parsed into an integer.',
  ],
  recognitionCue:
    'Several unrestricted strings must cross a boundary as one string and later be recovered exactly.',
  misconception:
    'Joining on a separator alone fails when a message contains that same separator.',
  algorithmSteps: [
    { id: 'write-length', instruction: 'For each message, append its decimal length followed by #.' },
    { id: 'write-message', instruction: 'Append the message itself and join all pieces for encoding.' },
    { id: 'read-prefix', instruction: 'While decoding, read digits from the cursor up to the next #.' },
    { id: 'parse-length', instruction: 'Convert those digits to the message length.' },
    { id: 'slice-message', instruction: 'Move past # and slice exactly that many characters.' },
    { id: 'repeat-to-end', instruction: 'Append the slice and repeat until the encoded string ends.' },
  ],
  complexity: {
    time: 'O(c)',
    space: 'O(c)',
    explanation:
      'Encoding or decoding touches each of c payload and prefix characters a constant number of times; the output is size c.',
  },
  explanationVisuals: {
    diagram: {
      kind: 'string',
      chars: '4#nova0#3#a#b',
      pointers: [
        { index: 0, label: 'length' },
        { index: 2, label: 'payload' },
      ],
    },
  },
  workedExample: {
    prompt:
      'Packing [“nova”, “”, “a#b”] produces “4#nova0#3#a#b”. During unpacking, lengths 4, 0, and 3 determine every boundary.',
    code: [
      'def unpack(encoded):',
      '    messages, i = [], 0',
      '    while i < len(encoded):',
      '        j = i',
      '        while encoded[j] != "#": j += 1',
      '        size = int(encoded[i:j])',
      '        start = j + 1',
      '        messages.append(encoded[start:start + size])',
      '        i = start + size',
      '    return messages',
    ],
    currentLineIndex: 7,
    walkthrough: [
      'Prefix 4 selects nova, regardless of its letters.',
      'Prefix 0 selects the empty slice and still advances past its header.',
      'Prefix 3 selects a#b, so the # inside the payload causes no confusion.',
    ],
    diagram: {
      kind: 'string',
      chars: '3#a#b',
      pointers: [
        { index: 0, label: '3 chars' },
        { index: 2, label: 'start' },
      ],
    },
  },
  patternCheck: {
    prompt:
      'Which format can safely pack empty messages and messages containing #?',
    options: [
      { id: 'length-prefix', label: 'Write length#message for every message.' },
      { id: 'separator-only', label: 'Join every message with # and split on every #.' },
      { id: 'remove-symbols', label: 'Delete all # characters before joining.' },
      { id: 'fixed-guess', label: 'Assume every message has exactly five characters.' },
    ],
    correctOptionId: 'length-prefix',
    feedback: {
      correct: 'Correct. The length says how much payload to consume, even when payload contains #.',
      incorrect: 'That format either changes the data or cannot identify every boundary.',
      secondIncorrect: 'Store boundary information as decimal length# before each unchanged message.',
    },
    hints: ['The payload must remain untouched.', 'A number can tell the decoder where to stop.'],
    diagram: { kind: 'string', chars: '3#a#b', pointers: [{ index: 0, label: 'prefix' }] },
  },
  retrievalCheck: {
    prompt:
      'Write the three-part header-and-payload shape used for one packed message.',
    acceptedAnswers: [
      'length#message',
      'length # message',
      'message length then # then message',
      'size#payload',
      'size#message',
      'length#payload',
      'length, #, message',
      'length then # then message',
    ],
    placeholder: 'Type the format',
    feedback: {
      correct: 'Exactly. The delimiter ends the number; the number ends the payload.',
      incorrect: 'Include the length, the # that ends the length, and the unchanged message.',
      secondIncorrect: 'Use “length#message.”',
    },
    hints: ['The # separates metadata from payload.', 'The payload may contain more # characters.'],
  },
  reconstructionCheck: {
    prompt:
      'Put the packing and unpacking actions into a complete codec sequence.',
    feedback: {
      correct: 'Codec restored. The decoder advances by measured payload lengths, never by guesses.',
      incorrect: 'The decoder must parse the prefix before it can slice the message.',
      secondIncorrect: 'Write length and payload; then read prefix, parse length, slice, and repeat.',
    },
    hints: ['Encoding creates the header before the payload.', 'Decoding moves past # before slicing.'],
    diagram: { kind: 'string', chars: '4#nova', pointers: [{ index: 2, label: 'slice 4' }] },
  },
  pythonChallenge: {
    prompt:
      'Write solve(data). For action "encode", return one packed string from data["messages"]. For action "decode", return the message list from data["encoded"]. Use length#message.',
    starterCode: `def solve(data):
    action = data["action"]
    if action == "encode":
        pieces = []
        for message in data["messages"]:
            # Add a length header and the unchanged message.
            pass
        return "".join(pieces)

    encoded = data["encoded"]
    messages = []
    i = 0
    # Parse prefixes and exact-size payloads until i reaches the end.
    return messages`,
    cases: {
      visibleExample: {
        input: { action: 'encode', messages: ['nova', '', 'a#b'] },
        expected: '4#nova0#3#a#b',
      },
      hiddenBoundary: { input: { action: 'decode', encoded: '' }, expected: [] },
      hiddenAdversarial: {
        input: { action: 'decode', encoded: '0#6#x#y#z!' },
        expected: ['', 'x#y#z!'],
      },
    },
    feedback: {
      correct: 'Crate delivered! Your codec preserves empty and separator-filled messages exactly.',
      incorrect: 'Packing or boundaries changed. Recheck the prefix cursor and exact payload slice.',
      secondIncorrect: 'Encode with str(len(message))+"#"+message; decode digits to #, then take size characters.',
    },
    hints: [
      'The decoder first searches for the # ending the decimal number.',
      'After start = j + 1, the payload ends at start + size.',
      'Set i to that payload end before the next loop.',
    ],
    diagram: { kind: 'string', chars: '0#6#x#y#z!', pointers: [{ index: 4, label: 'second payload' }] },
  },
} as const satisfies ProblemMissionSeed

export const problemLesson = createProblemMission(encodeAndDecodeStringsMissionSeed)
export default problemLesson
