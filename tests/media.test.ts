/**
 * The pure parts of the media layer.
 *
 * Decoding and the worker itself need a browser and are checked by running the
 * app. What is tested here is the part that decides how much precision the rest
 * of the system is allowed to claim, which is the part that would fail quietly.
 */

import { describe, expect, it } from 'vitest'
import { chunksToSegments, looksWordLevel } from '@/lib/media/transcribe'
import { extensionOf, isProbablySupported } from '@/lib/media/decode'
import { normalize } from '@/lib/engine/transcript/normalize'
import { clearSegments } from '@/lib/engine'

const WORD_CHUNKS = [
  { text: ' Right,', timestamp: [0.0, 0.3] as [number, number | null] },
  { text: ' so', timestamp: [0.3, 0.45] as [number, number | null] },
  { text: ' the', timestamp: [0.45, 0.6] as [number, number | null] },
  { text: ' fucking', timestamp: [0.6, 1.1] as [number, number | null] },
  { text: ' patch', timestamp: [1.1, 1.5] as [number, number | null] },
  { text: ' dropped.', timestamp: [1.5, 2.0] as [number, number | null] },
  { text: ' And', timestamp: [2.2, 2.4] as [number, number | null] },
  { text: ' it', timestamp: [2.4, 2.6] as [number, number | null] },
  // Whisper leaves an end timestamp null often enough that it has to be
  // handled rather than hoped about.
  { text: ' broke', timestamp: [2.6, null] as [number, number | null] },
  { text: ' everything.', timestamp: [3.0, 3.6] as [number, number | null] },
]

const CHUNK_LEVEL = [
  { text: ' Right, so the fucking patch dropped.', timestamp: [0, 2.0] as [number, number | null] },
  { text: ' And it broke everything.', timestamp: [2.2, 3.6] as [number, number | null] },
]

describe('timing granularity', () => {
  it('recognises word level output', () => {
    expect(looksWordLevel(WORD_CHUNKS)).toBe(true)
  })

  it('recognises chunk level output, so nothing claims a precision it lacks', () => {
    expect(looksWordLevel(CHUNK_LEVEL)).toBe(false)
  })

  it('treats empty output as chunk level rather than crashing', () => {
    expect(looksWordLevel([])).toBe(false)
  })
})

describe('chunks to segments', () => {
  it('gathers words into sentences while keeping every word timing', () => {
    const segments = chunksToSegments(WORD_CHUNKS, true)
    expect(segments).toHaveLength(2)
    expect(segments[0]?.text).toBe('Right, so the fucking patch dropped.')
    expect(segments[0]?.words).toHaveLength(6)
    expect(segments[0]?.words?.[3]?.text).toBe('fucking')
    expect(segments[0]?.words?.[3]?.startSec).toBeCloseTo(0.6)
  })

  it('fills a missing end time from the next word rather than guessing wide', () => {
    const segments = chunksToSegments(WORD_CHUNKS, true)
    const broke = segments[1]?.words?.find((word) => word.text === 'broke')
    expect(broke?.endSec).toBeCloseTo(3.0)
  })

  it('passes chunk level output straight through with no word timings', () => {
    const segments = chunksToSegments(CHUNK_LEVEL, false)
    expect(segments).toHaveLength(2)
    expect(segments[0]?.words).toBeUndefined()
  })
})

describe('the video path reaches the same engine as a subtitle file', () => {
  it('produces measured timings, which a subtitle file can never do', () => {
    const transcript = normalize(chunksToSegments(WORD_CHUNKS, true), 'whisper')
    expect(transcript.exactTimings).toBe(true)
    expect(transcript.tokens.every((token) => token.timing === 'measured')).toBe(true)
  })

  it('finds the language and puts it at the second it was said', () => {
    const result = clearSegments(chunksToSegments(WORD_CHUNKS, true), 'whisper', {
      clearedAt: '2026-08-15T00:00:00.000Z',
    })
    const finding = result.findings.find((f) => f.class === 'profanity.strong')
    expect(finding).toBeDefined()
    // Measured, not estimated. This is the whole reason the video path exists.
    expect(finding!.startSec).toBeCloseTo(0.6)
    expect(finding!.endSec).toBeCloseTo(1.1)
    expect(finding!.modifiers.map((m) => m.id)).not.toContain('timing.inferred')
  })

  it('still flags the opening window rule on a transcribed video', () => {
    const result = clearSegments(chunksToSegments(WORD_CHUNKS, true), 'whisper', {
      clearedAt: '2026-08-15T00:00:00.000Z',
    })
    const finding = result.findings.find((f) => f.class === 'profanity.strong')!
    expect(finding.modifiers.map((m) => m.id)).toContain('position.opening')

    const youtube = result.platforms.find((p) => p.packId === 'youtube')!
    const language = youtube.categories.find((c) => c.categoryId === 'language')!
    expect(language.level).toBe('limited')
    expect(language.reason).toMatch(/opening/i)
  })

  it('degrades honestly when only chunk timings came back', () => {
    const result = clearSegments(chunksToSegments(CHUNK_LEVEL, false), 'whisper', {
      clearedAt: '2026-08-15T00:00:00.000Z',
    })
    const finding = result.findings.find((f) => f.class === 'profanity.strong')!
    expect(finding.modifiers.map((m) => m.id)).toContain('timing.inferred')
    expect(finding.confidence).toBeLessThan(0.9)
  })
})

describe('container support is stated, not guessed', () => {
  it('reads extensions', () => {
    expect(extensionOf('My Video FINAL v3.MP4')).toBe('mp4')
    expect(extensionOf('noextension')).toBe('')
  })

  it('knows what a browser can open', () => {
    expect(isProbablySupported('cut.mp4')).toBe(true)
    expect(isProbablySupported('cut.mov')).toBe(true)
    expect(isProbablySupported('cut.mkv')).toBe(false)
  })
})
