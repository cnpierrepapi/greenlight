/**
 * Ingest dispatch.
 *
 * Contract: `ingestText(filename, text)` picks a parser by extension, falling
 * back to a content sniff, and returns the segments plus which source produced
 * them. Throws with a creator readable message when nothing fits.
 *
 * Callers: the UI drop handler in app/, and tests. The Whisper path in
 * lib/media/ does not come through here, because it already produces
 * `RawSegment[]` directly.
 */

import type { RawSegment, TranscriptSource } from '../types'
import { detectSubtitleKind, parseSubtitles } from './subtitles'
import { parseYouTubeJson } from './ytjson'
import { parsePlaintext } from './plaintext'

export interface IngestResult {
  segments: RawSegment[]
  source: TranscriptSource
}

export function ingestText(filename: string, text: string): IngestResult {
  // Strip a byte order mark. Files exported from Windows tools carry one often
  // enough that leaving it in breaks the very first cue of a WebVTT parse.
  const content = text.replace(/^﻿/, '')

  if (content.trim() === '') {
    throw new Error('That file is empty. There is nothing to clear.')
  }

  const lower = filename.toLowerCase()

  if (lower.endsWith('.json')) {
    return { segments: parseYouTubeJson(content), source: 'ytjson' }
  }

  const subtitleKind = detectSubtitleKind(filename, content)
  if (subtitleKind) {
    const segments = parseSubtitles(content, subtitleKind)
    if (segments.length === 0) {
      throw new Error('That subtitle file has cues but no speech in them.')
    }
    return { segments, source: subtitleKind }
  }

  // A JSON transcript pasted into a text box rather than dropped as a file.
  const trimmed = content.trimStart()
  if (trimmed.startsWith('{') || trimmed.startsWith('[')) {
    return { segments: parseYouTubeJson(content), source: 'ytjson' }
  }

  const segments = parsePlaintext(content)
  if (segments.length === 0) {
    throw new Error('There are no words in that text.')
  }
  return { segments, source: 'plaintext' }
}

export { parseSubtitles, parseTimecode, detectSubtitleKind } from './subtitles'
export { parseYouTubeJson } from './ytjson'
export { parsePlaintext } from './plaintext'
