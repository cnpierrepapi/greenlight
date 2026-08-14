/**
 * YouTube transcript JSON.
 *
 * Contract: `parseYouTubeJson(text)` returns `RawSegment[]`, or throws with a
 * message written for a creator rather than a developer. Called by
 * `ingest/index.ts`.
 *
 * Two shapes are accepted, because these are the two a creator actually ends up
 * with. The first is YouTube's own timedtext response, which is what the
 * network tab gives you. The second is the array shape every third party
 * transcript library emits. Supporting both means the paste usually just works,
 * which matters more here than format purity.
 */

import type { RawSegment } from '../types'

interface TimedTextEvent {
  tStartMs?: number
  dDurationMs?: number
  segs?: { utf8?: string }[]
}

interface LibraryCue {
  text?: string
  start?: number | string
  duration?: number | string
  offset?: number | string
}

export function parseYouTubeJson(text: string): RawSegment[] {
  let data: unknown
  try {
    data = JSON.parse(text)
  } catch {
    throw new Error('That file is not valid JSON. If it came from a subtitle editor, save it as SRT instead.')
  }

  // Shape 1: YouTube timedtext.
  if (data && typeof data === 'object' && Array.isArray((data as { events?: unknown }).events)) {
    const events = (data as { events: TimedTextEvent[] }).events
    const segments: RawSegment[] = []
    for (const event of events) {
      const words = (event.segs ?? []).map((s) => s.utf8 ?? '').join('')
      const content = words.replace(/\s+/g, ' ').trim()
      // Timedtext emits empty events as spacing. They carry no speech.
      if (content === '' || content === '\n') continue
      const startSec = typeof event.tStartMs === 'number' ? event.tStartMs / 1000 : null
      const endSec =
        startSec !== null && typeof event.dDurationMs === 'number'
          ? startSec + event.dDurationMs / 1000
          : null
      segments.push({ text: content, startSec, endSec })
    }
    if (segments.length === 0) throw new Error('That transcript file has no speech in it.')
    return segments
  }

  // Shape 2: the array every transcript library returns.
  if (Array.isArray(data)) {
    const cues = data as LibraryCue[]
    const divisor = unitDivisor(cues)
    const segments: RawSegment[] = []
    for (const cue of cues) {
      const content = String(cue.text ?? '').replace(/\s+/g, ' ').trim()
      if (content === '') continue
      const rawStart = Number(cue.start ?? cue.offset ?? NaN)
      const startSec = Number.isFinite(rawStart) ? rawStart / divisor : null
      const rawDuration = Number(cue.duration ?? NaN)
      const duration = Number.isFinite(rawDuration) ? rawDuration / divisor : null
      segments.push({
        text: content,
        startSec,
        endSec: startSec !== null && duration !== null ? startSec + duration : null,
      })
    }
    if (segments.length === 0) throw new Error('That transcript file has no speech in it.')
    return segments
  }

  throw new Error('That JSON is not a transcript Greenlight recognises. Export as SRT and drop that in instead.')
}

/**
 * Decides seconds versus milliseconds once for the whole file, never per cue.
 *
 * The ambiguity is real: `offset: 4000` is four seconds in one library and four
 * thousand seconds in another, and no value based heuristic settles it, because
 * a 66 minute video genuinely starts a cue at 4000 seconds. So the decision is
 * made on the field name, which does track the convention: libraries that call
 * it `offset` emit whole milliseconds, libraries that call it `start` emit
 * fractional seconds.
 *
 * Deciding once per file rather than per cue matters more than the rule itself.
 * A per cue guess would put the early cues of a long video on one scale and the
 * later ones on another, which is the kind of failure a creator only notices
 * after they have cut the wrong second.
 */
function unitDivisor(cues: LibraryCue[]): number {
  const usesOffset = cues.some((cue) => cue.offset !== undefined && cue.start === undefined)
  const allIntegers = cues.every((cue) => {
    const value = Number(cue.start ?? cue.offset ?? NaN)
    return !Number.isFinite(value) || Number.isInteger(value)
  })
  return usesOffset && allIntegers ? 1000 : 1
}
