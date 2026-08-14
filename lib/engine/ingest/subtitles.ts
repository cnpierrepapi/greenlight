/**
 * SRT and WebVTT parsing.
 *
 * Contract: `parseSubtitles(text, kind)` returns `RawSegment[]` in file order.
 * Called by `ingest/index.ts`. Produces no tokens and no timings finer than the
 * cue, because a subtitle file genuinely does not have them. Splitting a cue
 * into per word timings is `transcript/normalize.ts`'s job, and it marks the
 * result as inferred when it does.
 *
 * Both formats are handled here rather than in two files because they differ in
 * three characters: SRT separates a timecode's seconds and milliseconds with a
 * comma, WebVTT with a full stop, and WebVTT allows the hours field to be
 * dropped. Everything else about the parse is identical, and two files would
 * have meant two places to fix the same bug.
 */

import type { RawSegment } from '../types'

export type SubtitleKind = 'srt' | 'vtt'

const TIMECODE = /(\d{1,2}:)?(\d{1,2}):(\d{2})[.,](\d{1,3})/
const CUE_LINE = new RegExp(`^\\s*(${TIMECODE.source})\\s*-->\\s*(${TIMECODE.source})`)

/**
 * Seconds from a single timecode, or null if it does not parse. Hours are
 * optional so that `01:23.400` works, which WebVTT allows and creators' tools
 * emit often enough to matter.
 */
export function parseTimecode(raw: string): number | null {
  const m = TIMECODE.exec(raw.trim())
  if (!m) return null
  const hours = m[1] ? Number(m[1].slice(0, -1)) : 0
  const minutes = Number(m[2])
  const seconds = Number(m[3])
  // Pad so that ",4" reads as 400ms rather than 4ms.
  const millis = Number((m[4] ?? '0').padEnd(3, '0'))
  if ([hours, minutes, seconds, millis].some((n) => Number.isNaN(n))) return null
  return hours * 3600 + minutes * 60 + seconds + millis / 1000
}

export function parseSubtitles(text: string, kind: SubtitleKind): RawSegment[] {
  const segments: RawSegment[] = []
  // Normalise line endings first. Files exported on Windows and read on a Mac
  // are the most common source of a parse that silently returns nothing.
  const lines = text.replace(/\r\n?/g, '\n').split('\n')

  let index = 0
  while (index < lines.length) {
    const line = lines[index] ?? ''

    // WebVTT header, comments, style and region blocks carry no speech.
    if (kind === 'vtt' && /^(WEBVTT|NOTE|STYLE|REGION)\b/.test(line.trim())) {
      while (index < lines.length && (lines[index] ?? '').trim() !== '') index++
      continue
    }

    const cue = CUE_LINE.exec(line)
    if (!cue) {
      index++
      continue
    }

    const [startRaw, endRaw] = line.split('-->')
    const startSec = parseTimecode(startRaw ?? '')
    const endSec = parseTimecode(endRaw ?? '')
    index++

    const body: string[] = []
    while (index < lines.length && (lines[index] ?? '').trim() !== '') {
      body.push(lines[index] ?? '')
      index++
    }

    const content = cleanCueText(body.join(' '))
    if (content !== '') {
      segments.push({ text: content, startSec, endSec })
    }
  }

  return segments
}

/**
 * Strips the markup that both formats allow inside a cue. Speaker labels are
 * removed but the words after them are kept, because "SPEAKER 1: damn" is still
 * the creator saying damn and the finding needs the word, not the label.
 */
function cleanCueText(raw: string): string {
  return raw
    .replace(/<[^>]*>/g, ' ') // vtt inline tags, including karaoke timings
    .replace(/\{\\[^}]*\}/g, ' ') // ass/ssa overrides that leak into srt exports
    .replace(/^\s*[-–]\s*/gm, ' ') // dialogue dashes
    .replace(/^\s*[A-Z][A-Z0-9 _'-]{1,20}:\s*/g, ' ') // speaker labels
    .replace(/\s+/g, ' ')
    .trim()
}

/**
 * Best guess at the format of a dropped file. The extension is trusted first
 * because it is right almost always, and the content sniff exists for the case
 * where a creator renamed a file or pasted into a text box.
 */
export function detectSubtitleKind(filename: string, text: string): SubtitleKind | null {
  const lower = filename.toLowerCase()
  if (lower.endsWith('.vtt')) return 'vtt'
  if (lower.endsWith('.srt')) return 'srt'
  if (/^﻿?WEBVTT/.test(text)) return 'vtt'
  if (CUE_LINE.test(text.replace(/\r\n?/g, '\n').split('\n').slice(0, 40).join('\n'))) {
    return text.includes(',') ? 'srt' : 'vtt'
  }
  return null
}
