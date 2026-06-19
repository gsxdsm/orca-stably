// Cross-module parity gate for the mirrored AskUserQuestion parser. The runtime
// parser bodies live as two copies (desktop + mobile) because Metro can't import
// values from src/shared; this test runs the SAME fixtures through both and asserts
// identical output so the copies can never silently drift (Finding #7, option (c)).
//
// Why root placement: this is a desktop-Vitest test (`src/**/*.test.ts`) that can
// import both `src/...` and `mobile/src/...` as plain TS. The mobile parser is pure
// (no RN-only runtime imports), so root Vitest can load it directly.

import { describe, expect, it } from 'vitest'

import {
  formatAskAnswer as desktopFormatAskAnswer,
  parseAskFromStatus as desktopParseAskFromStatus
} from '../renderer/src/components/native-chat/native-chat-interactive-prompt'
import {
  formatAskAnswer as mobileFormatAskAnswer,
  parseAskFromStatus as mobileParseAskFromStatus
} from '../../mobile/src/session/mobile-native-chat-ask'

type AskFixture = { name: string; json: string; toolName?: string }

const ASK_FIXTURES: AskFixture[] = [
  { name: 'null/empty input', json: '' },
  { name: 'not JSON', json: 'not json at all' },
  { name: 'empty object', json: '{}' },
  { name: 'empty questions array', json: JSON.stringify({ questions: [] }) },
  {
    name: 'canonical single question, string options',
    json: JSON.stringify({
      questions: [
        { question: 'Pick one', header: 'Choice', multiSelect: false, options: ['a', 'b', 'c'] }
      ]
    })
  },
  {
    name: 'object options with missing/non-string descriptions',
    json: JSON.stringify({
      questions: [
        {
          question: 'Q',
          multiSelect: true,
          options: [
            { label: 'one', description: 'desc' },
            { label: 'two' },
            { label: 'three', description: 42 },
            'four',
            { description: 'no label here' },
            null
          ]
        }
      ]
    })
  },
  {
    name: 'multiple questions, some empty/garbage filtered',
    json: JSON.stringify({
      questions: [
        { question: 'first', options: ['x'] },
        { question: '', options: [] },
        null,
        { question: 'third', header: 'H', multiSelect: true, options: [{ label: 'y' }] }
      ]
    })
  },
  {
    name: 'question with no question text but options present',
    json: JSON.stringify({ questions: [{ options: ['only-options'] }] })
  },
  {
    name: 'questions is not an array',
    json: JSON.stringify({ questions: 'nope' })
  },
  // toolName-bearing cases: exercise the registry dispatch on both signatures.
  {
    name: 'AskUserQuestion toolName (registered) routes through canonical shape',
    toolName: 'AskUserQuestion',
    json: JSON.stringify({
      questions: [{ question: 'Registered?', multiSelect: false, options: ['yes', 'no'] }]
    })
  },
  {
    name: 'unknown toolName falls back to canonical shape',
    toolName: 'SomeFutureTool',
    json: JSON.stringify({
      questions: [{ question: 'Fallback?', multiSelect: false, options: ['ok'] }]
    })
  }
]

describe('AskUserQuestion parser parity (desktop vs mobile)', () => {
  it.each(ASK_FIXTURES)('parseAskFromStatus parity: $name', ({ json, toolName }) => {
    const input = json === '' ? null : json
    const desktop = desktopParseAskFromStatus(input, toolName)
    const mobile = mobileParseAskFromStatus(input, toolName)
    expect(desktop).toEqual(mobile)
  })

  it('formatAskAnswer parity: one line per question, blanks preserved', () => {
    const parsed = desktopParseAskFromStatus(
      JSON.stringify({
        questions: [
          { question: 'a', options: ['x'] },
          { question: 'b', options: ['y'] },
          { question: 'c', options: ['z'] }
        ]
      })
    )
    expect(parsed).not.toBeNull()
    if (!parsed) {
      return
    }
    // Blank middle answer must stay an empty line so N lines == N questions.
    const selections = [['x'], [], ['z', 'extra']]
    const desktop = desktopFormatAskAnswer(parsed, selections)
    const mobile = mobileFormatAskAnswer(parsed, selections)
    expect(desktop).toEqual(mobile)
    expect(desktop).toBe('x\n\nz, extra')
    expect(desktop.split('\n')).toHaveLength(parsed.questions.length)
  })
})
