import { describe, expect, it } from 'vitest'
import { ingestText, parseTimecode, parseSubtitles } from '@/lib/engine/ingest'
import { normalize, normalizeWord } from '@/lib/engine/transcript/normalize'

const SRT = `1
00:00:01,500 --> 00:00:04,000
Right, so the patch dropped last night.

2
00:00:04,000 --> 00:00:06,000
<i>And this damn thing is broken.</i>
`

const VTT = `WEBVTT

NOTE this note is not speech

00:01.000 --> 00:03.000
SPEAKER 1: Right, so the patch dropped.

00:03.000 --> 00:05.000
And this damn thing is broken.
`

describe('timecodes', () => {
  it('reads both separators and optional hours', () => {
    expect(parseTimecode('00:00:04,250')).toBeCloseTo(4.25)
    expect(parseTimecode('00:00:04.250')).toBeCloseTo(4.25)
    expect(parseTimecode('01:02:03.500')).toBeCloseTo(3723.5)
    expect(parseTimecode('01:23.400')).toBeCloseTo(83.4)
  })

  it('pads a short milliseconds field rather than reading it as microseconds', () => {
    // ",4" is four hundred milliseconds. Read literally it would be 4ms, which
    // moves a cut point by a third of a second.
    expect(parseTimecode('00:00:01,4')).toBeCloseTo(1.4)
  })

  it('returns null instead of guessing', () => {
    expect(parseTimecode('nonsense')).toBeNull()
  })
})

describe('subtitle parsing', () => {
  it('reads SRT and strips inline markup', () => {
    const segments = parseSubtitles(SRT, 'srt')
    expect(segments).toHaveLength(2)
    expect(segments[1]?.text).toBe('And this damn thing is broken.')
    expect(segments[1]?.startSec).toBeCloseTo(4)
  })

  it('reads WebVTT, skipping the header and notes and dropping speaker labels', () => {
    const segments = parseSubtitles(VTT, 'vtt')
    expect(segments).toHaveLength(2)
    expect(segments[0]?.text).toBe('Right, so the patch dropped.')
    expect(segments[0]?.startSec).toBeCloseTo(1)
  })

  it('survives CRLF line endings', () => {
    const segments = parseSubtitles(SRT.replace(/\n/g, '\r\n'), 'srt')
    expect(segments).toHaveLength(2)
  })
})

describe('ingest dispatch', () => {
  it('detects SRT from the extension', () => {
    expect(ingestText('cut.srt', SRT).source).toBe('srt')
  })

  it('detects WebVTT from its header when the file was renamed', () => {
    expect(ingestText('mystery.txt', VTT).source).toBe('vtt')
  })

  it('reads the YouTube timedtext shape', () => {
    const json = JSON.stringify({
      events: [
        { tStartMs: 1500, dDurationMs: 2500, segs: [{ utf8: 'Right, so' }, { utf8: ' the patch' }] },
        { tStartMs: 4000, dDurationMs: 2000, segs: [{ utf8: '\n' }] },
      ],
    })
    const result = ingestText('transcript.json', json)
    expect(result.source).toBe('ytjson')
    expect(result.segments).toHaveLength(1)
    expect(result.segments[0]?.text).toBe('Right, so the patch')
  })

  it('reads the transcript library array shape in fractional seconds', () => {
    const json = JSON.stringify([
      { text: 'first line', start: 1.5, duration: 2 },
      { text: 'second line', start: 4, duration: 2 },
    ])
    const result = ingestText('t.json', json)
    expect(result.segments[0]?.startSec).toBeCloseTo(1.5)
    expect(result.segments[1]?.startSec).toBeCloseTo(4)
  })

  it('reads the offset variant as milliseconds, deciding once for the file', () => {
    // `offset` plus whole numbers is the shape libraries emit in milliseconds.
    // The unit is decided for the file, never per cue, so a long video cannot
    // end up with its early cues on one scale and its later ones on another.
    const json = JSON.stringify([
      { text: 'first line', offset: 1500, duration: 2000 },
      { text: 'second line', offset: 4000, duration: 2000 },
    ])
    const result = ingestText('t.json', json)
    expect(result.segments[0]?.startSec).toBeCloseTo(1.5)
    expect(result.segments[1]?.startSec).toBeCloseTo(4)
  })

  it('falls back to plain text with no timings', () => {
    const result = ingestText('script.txt', 'First sentence here. Second sentence here.')
    expect(result.source).toBe('plaintext')
    expect(result.segments).toHaveLength(2)
    expect(result.segments[0]?.startSec).toBeNull()
  })

  it('says what is wrong in words a creator can act on', () => {
    expect(() => ingestText('empty.srt', '   ')).toThrow(/empty/i)
    expect(() => ingestText('broken.json', '{oh dear')).toThrow(/not valid JSON/i)
  })
})

describe('normalize', () => {
  it('marks subtitle timings as inferred, because a cue times a line not a word', () => {
    const { segments, source } = ingestText('cut.srt', SRT)
    const transcript = normalize(segments, source)
    expect(transcript.exactTimings).toBe(false)
    expect(transcript.tokens.every((token) => token.timing === 'inferred')).toBe(true)
  })

  it('marks per word timings as measured when the source has them', () => {
    const transcript = normalize(
      [
        {
          text: 'this damn patch',
          startSec: 0,
          endSec: 1.2,
          words: [
            { text: 'this', startSec: 0, endSec: 0.3 },
            { text: 'damn', startSec: 0.3, endSec: 0.8 },
            { text: 'patch', startSec: 0.8, endSec: 1.2 },
          ],
        },
      ],
      'whisper'
    )
    expect(transcript.exactTimings).toBe(true)
    expect(transcript.tokens[1]?.startSec).toBeCloseTo(0.3)
  })

  it('spreads a cue across its words by character position', () => {
    const transcript = normalize([{ text: 'a bcdefghij', startSec: 0, endSec: 11 }], 'srt')
    // Ten characters of text across eleven seconds. The one character word
    // takes a tenth of the cue, the nine character word takes the rest.
    expect(transcript.tokens[0]?.endSec).toBeCloseTo(1.1, 2)
    expect(transcript.tokens[1]?.endSec).toBeCloseTo(11, 2)
  })

  it('carries no timings through as none rather than as zero', () => {
    const transcript = normalize([{ text: 'a line of script', startSec: null, endSec: null }], 'plaintext')
    expect(transcript.tokens[0]?.timing).toBe('none')
    expect(transcript.durationSec).toBeNull()
  })

  it('undoes light obfuscation without mangling ordinary words', () => {
    expect(normalizeWord('Fuuuuck')).toBe('fuck')
    expect(normalizeWord('sh$t')).toBe('shst')
    expect(normalizeWord('café')).toBe('cafe')
    expect(normalizeWord('really')).toBe('really')
    expect(normalizeWord('grass')).toBe('grass')
  })
})
