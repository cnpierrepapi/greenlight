/**
 * Segments to one Transcript.
 *
 * Contract: `normalize(segments, source, options)` returns a `Transcript`. This
 * is the only module that decides how a timed block of text becomes
 * individually timed words, and the only place that sets `Token.timing`.
 * Everything downstream joins on `Token.index`, so tokens are never reordered
 * or filtered after this function returns.
 *
 * Callers: `lib/engine/index.ts`, and tests.
 *
 * The judgement that matters here: a subtitle cue times a block, not a word. We
 * spread the cue's duration across its words by character position, which is
 * accurate to roughly a syllable at normal speech rates and is wrong in a
 * predictable direction when someone pauses mid sentence. Rather than hide
 * that, every token produced this way is marked `inferred`, the flag reaches
 * the report, and `detect/spans.ts` lowers confidence for findings built from
 * inferred tokens. A creator cutting their own video is told which timecodes
 * are measured and which are estimates.
 */

import type { Cue, RawSegment, Token, Transcript, TranscriptSource } from '../types'

export interface NormalizeOptions {
  /** BCP 47 if the source reported one. The packs are English only. */
  language?: string | null
  /** Known runtime, used when the last cue ends before the video does. */
  durationSec?: number | null
}

/** Characters stripped from the edges of a word before it is stored. */
const EDGE_PUNCTUATION = /^[^\p{L}\p{N}']+|[^\p{L}\p{N}']+$/gu

/**
 * Lowercase, strip accents, and undo the two obfuscations that actually show up
 * in creator speech to text output: character repetition and simple leet
 * substitution.
 *
 * Deliberately conservative. Aggressive de-obfuscation turns ordinary words
 * into matches, and a false finding costs more trust than a missed one: a
 * creator who cuts a clean line on our say so does not come back.
 */
export function normalizeWord(word: string): string {
  return word
    .toLowerCase()
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .replace(/[@]/g, 'a')
    .replace(/[$]/g, 's')
    .replace(/0/g, 'o')
    .replace(/(.)\1{2,}/g, '$1') // fuuuuck to fuck, but keeps ss and ll
    .replace(/[^\p{L}\p{N}']/gu, '')
}

export function normalize(
  segments: RawSegment[],
  source: TranscriptSource,
  options: NormalizeOptions = {}
): Transcript {
  const tokens: Token[] = []
  const cues: Cue[] = []
  let allMeasured = true
  let sawAnyTiming = false

  segments.forEach((segment, segmentIndex) => {
    const cueIndex = cues.length
    const tokenStart = tokens.length

    if (segment.words && segment.words.length > 0) {
      // The good case: the source timed each word. Whisper does this when it
      // can, and nothing has to be estimated.
      sawAnyTiming = true
      for (const word of segment.words) {
        const text = word.text.replace(EDGE_PUNCTUATION, '')
        if (text === '') continue
        tokens.push({
          index: tokens.length,
          text,
          norm: normalizeWord(text),
          startSec: word.startSec,
          endSec: word.endSec,
          timing: 'measured',
          cueIndex,
        })
      }
    } else {
      const words = segment.text.split(/\s+/).filter((w) => w.trim() !== '')
      const hasTiming = segment.startSec !== null && segment.endSec !== null
      if (hasTiming) sawAnyTiming = true
      else allMeasured = false

      // Spread the cue across its words by character position, so a long word
      // occupies more of the cue than a short one. Closer to speech than an
      // even split, and it costs nothing.
      const totalChars = words.reduce((n, w) => n + w.length, 0) || 1
      const cueStart = segment.startSec ?? 0
      const cueSpan = hasTiming ? Math.max(0, (segment.endSec ?? 0) - cueStart) : 0
      let charsSoFar = 0

      for (const word of words) {
        const text = word.replace(EDGE_PUNCTUATION, '')
        if (text === '') {
          charsSoFar += word.length
          continue
        }
        const startFraction = charsSoFar / totalChars
        charsSoFar += word.length
        const endFraction = charsSoFar / totalChars
        tokens.push({
          index: tokens.length,
          text,
          norm: normalizeWord(text),
          startSec: hasTiming ? cueStart + cueSpan * startFraction : 0,
          endSec: hasTiming ? cueStart + cueSpan * endFraction : 0,
          timing: hasTiming ? 'inferred' : 'none',
          cueIndex,
        })
      }

      if (hasTiming) allMeasured = false
    }

    // A cue with no words after cleaning contributes nothing and would show up
    // in the UI as an empty line, so it is dropped rather than kept as noise.
    if (tokens.length === tokenStart) return

    cues.push({
      index: cueIndex,
      text: segment.text,
      startSec: segment.startSec,
      endSec: segment.endSec,
      tokenStart,
      tokenEnd: tokens.length - 1,
    })
    void segmentIndex
  })

  const lastCueEnd = cues.reduce<number | null>(
    (max, cue) => (cue.endSec !== null && (max === null || cue.endSec > max) ? cue.endSec : max),
    null
  )

  return {
    tokens,
    cues,
    source,
    durationSec: options.durationSec ?? lastCueEnd,
    language: options.language ?? null,
    exactTimings: sawAnyTiming && allMeasured,
  }
}
