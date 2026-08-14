/**
 * The engine's only public surface.
 *
 * Contract: the UI imports from here and nowhere deeper. Everything exported is
 * pure: no DOM, no network, no clock. `clearedAt` is passed in by the caller,
 * which is what makes a clearing reproducible and what lets golden output tests
 * compare two runs byte for byte.
 *
 * Callers: app/ and components/, lib/media/ once transcription lands, and
 * tests.
 *
 * The pipeline in one place, matching docs/ARCHITECTURE.md:
 *
 *   ingestText ─▶ normalize ─▶ matchLexicon ─▶ buildFindings ─▶ scoreAll
 */

import type { ClearingResult, Pack, RawSegment, TranscriptSource } from './types'
import { ingestText } from './ingest'
import { normalize } from './transcript/normalize'
import { matchLexicon } from './detect/match'
import { buildFindings } from './detect/spans'
import { scoreAll } from './score/verdict'
import { PACKS } from './policy/generated/packs'

export const ENGINE_VERSION = '0.1.0'

export interface ClearOptions {
  /** ISO timestamp, supplied by the caller. The engine never reads the clock. */
  clearedAt: string
  /** Defaults to every compiled pack. */
  packs?: Pack[]
  /** Opening window in seconds for position rules. */
  openingSec?: number
  language?: string | null
  durationSec?: number | null
}

/**
 * Clear a transcript that is already in segment form. This is the entry point
 * the Whisper worker output uses.
 */
export function clearSegments(
  segments: RawSegment[],
  source: TranscriptSource,
  options: ClearOptions
): ClearingResult {
  const transcript = normalize(segments, source, {
    language: options.language ?? null,
    durationSec: options.durationSec ?? null,
  })

  const hits = matchLexicon(transcript)
  const all = buildFindings(transcript, hits, { openingSec: options.openingSec })

  const findings = all.filter((finding) => !finding.suppressed)
  const considered = all.filter((finding) => finding.suppressed)

  return {
    transcript,
    findings,
    considered,
    platforms: scoreAll(options.packs ?? PACKS, findings),
    clearedAt: options.clearedAt,
    engineVersion: ENGINE_VERSION,
  }
}

/** Clear a dropped or pasted transcript file. */
export function clearText(filename: string, text: string, options: ClearOptions): ClearingResult {
  const { segments, source } = ingestText(filename, text)
  return clearSegments(segments, source, options)
}

export { PACKS } from './policy/generated/packs'
export { LEXICON, KNOWN_CLASSES } from './policy/lexicon'
export { ingestText } from './ingest'
export { normalize } from './transcript/normalize'
export { matchLexicon } from './detect/match'
export { buildFindings } from './detect/spans'
export { scoreAll, scorePack, worstOf } from './score/verdict'
export type * from './types'
