/**
 * Pasted text with no timings.
 *
 * Contract: `parsePlaintext(text)` returns `RawSegment[]` where every
 * `startSec` and `endSec` is null. Called by `ingest/index.ts`.
 *
 * This route exists so a creator who has a script but not a subtitle file can
 * still get findings. What they lose is the cut list, because you cannot mute a
 * range you cannot locate. The engine handles that by carrying
 * `TimingQuality: 'none'` through to the documents, so the report says the
 * findings are untimed rather than showing a made up 00:00.
 */

import type { RawSegment } from '../types'

export function parsePlaintext(text: string): RawSegment[] {
  const cleaned = text.replace(/\r\n?/g, '\n').trim()
  if (cleaned === '') return []

  // Split on sentence ends and on blank lines. Sentences make better cues than
  // paragraphs, because a cue is the unit the report quotes back and a
  // paragraph quote is too long to read next to a finding.
  const pieces = cleaned
    .split(/\n{2,}|(?<=[.!?])\s+(?=[A-Z"'])/)
    .map((piece) => piece.replace(/\s+/g, ' ').trim())
    .filter((piece) => piece !== '')

  return pieces.map((piece) => ({ text: piece, startSec: null, endSec: null }))
}
