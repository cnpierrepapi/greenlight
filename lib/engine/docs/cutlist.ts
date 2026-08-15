/**
 * The cut list: the ranges to mute, as something a creator can actually run.
 *
 * Contract: `buildCutRanges(result, options)` returns merged, padded ranges in
 * time order. `renderFfmpeg()` and `renderEdl()` turn those into the two files
 * in the pack. Callers: `lib/engine/docs/pack.ts`, and tests.
 *
 * This is the module that turns a report into saved time, so it is deliberately
 * conservative about what it touches.
 *
 * Only findings that actually cost something get a range. A finding that no
 * platform counted is real, is in the report, and is not worth editing a video
 * over, so it is left alone. Muting on our say so when nothing was at stake is
 * the fastest way to lose a creator's trust.
 *
 * Untimed findings never get a range, at all. You cannot mute a moment you
 * cannot locate, and a guessed range would be worse than none.
 */

import type { ClearingResult, Finding } from '../types'
import { docTime, edlTime, findingsThatCost, shortTime } from './format'

export interface CutRange {
  startSec: number
  endSec: number
  /** The findings inside this range, so the report can explain the cut. */
  findingIds: string[]
  /** What is being removed, in the creator's words. */
  quote: string
}

export interface CutListOptions {
  /**
   * Seconds added either side. Speech to text lands a fraction late on the
   * leading consonant, and a mute that starts on the vowel leaves the word
   * recognisable, which defeats the point.
   */
  padSec?: number
  /** Frames per second for the EDL. */
  fps?: number
  /** Name of the file the creator will run this against. */
  inputName?: string
}

const DEFAULT_PAD = 0.18
const DEFAULT_FPS = 25

export function buildCutRanges(result: ClearingResult, options: CutListOptions = {}): CutRange[] {
  const pad = options.padSec ?? DEFAULT_PAD

  const costly = findingsThatCost(result).filter(
    (finding): finding is Finding & { startSec: number; endSec: number } =>
      finding.startSec !== null && finding.endSec !== null
  )

  const ranges: CutRange[] = costly
    .map((finding) => ({
      startSec: Math.max(0, finding.startSec - pad),
      endSec: finding.endSec + pad,
      findingIds: [finding.id],
      quote: finding.quote,
    }))
    .sort((a, b) => a.startSec - b.startSec)

  // Merge anything that now overlaps after padding. Two mute filters over the
  // same second is not wrong, but it produces a command a creator cannot read,
  // and the point of this file is that they can check it before running it.
  const merged: CutRange[] = []
  for (const range of ranges) {
    const open = merged[merged.length - 1]
    if (open && range.startSec <= open.endSec) {
      open.endSec = Math.max(open.endSec, range.endSec)
      open.findingIds.push(...range.findingIds)
      continue
    }
    merged.push({ ...range })
  }

  return merged
}

/**
 * A runnable ffmpeg command that mutes the ranges and copies everything else.
 *
 * The video stream is copied rather than re-encoded, so this is fast and
 * lossless on the picture. Only the audio is touched.
 */
export function renderFfmpeg(result: ClearingResult, options: CutListOptions = {}): string {
  const ranges = buildCutRanges(result, options)
  const input = options.inputName ?? 'input.mp4'
  const output = suggestOutputName(input)

  const header = [
    '#!/bin/sh',
    '# Greenlight cut list.',
    `# Generated ${result.clearedAt} by engine ${result.engineVersion}.`,
    '#',
    '# Mutes the ranges below and copies the video stream untouched, so the',
    '# picture is not re-encoded and nothing else about the file changes.',
    '#',
    '# Check each range against your own audio before you run this. Greenlight',
    '# reads published platform policy and cannot guarantee monetization.',
    '',
  ]

  if (ranges.length === 0) {
    return [
      ...header,
      '# Nothing to mute. No finding in this cut was counted against you by any',
      '# platform pack, so there is no edit to make.',
      '',
    ].join('\n')
  }

  const lines = ranges.map(
    (range, index) =>
      `#  ${index + 1}. ${shortTime(range.startSec)} to ${shortTime(range.endSec)}  ${truncate(range.quote, 90)}`
  )

  // One volume filter carrying every range. In ffmpeg's expression language a
  // non zero value is true, so summing the between() terms is an OR across them.
  const enable = ranges
    .map((range) => `between(t,${range.startSec.toFixed(3)},${range.endSec.toFixed(3)})`)
    .join('+')

  return [
    ...header,
    '# Ranges:',
    ...lines,
    '',
    `ffmpeg -i "${input}" \\`,
    `  -af "volume=enable='${enable}':volume=0" \\`,
    '  -c:v copy \\',
    `  "${output}"`,
    '',
  ].join('\n')
}

/**
 * CMX3600 EDL of the segments that survive if the flagged spans are trimmed
 * out entirely.
 *
 * This is a different remedy from the ffmpeg script above, and the header says
 * so. Muting keeps the runtime and leaves a silent gap, which is what most
 * creators want for a single word. Trimming shortens the video, which is what
 * you want for a sustained passage. Shipping both and naming the difference
 * beats picking one and hoping.
 */
export function renderEdl(result: ClearingResult, options: CutListOptions = {}): string {
  const fps = options.fps ?? DEFAULT_FPS
  const ranges = buildCutRanges(result, options)
  const runtime = result.transcript.durationSec ?? lastEnd(result)

  const lines = [
    'TITLE: GREENLIGHT CUT LIST',
    'FCM: NON-DROP FRAME',
    `* GENERATED ${result.clearedAt} ENGINE ${result.engineVersion} AT ${fps}FPS`,
    '* THE SEGMENTS BELOW ARE WHAT REMAINS IF THE FLAGGED SPANS ARE TRIMMED OUT.',
    '* FOR A MUTE THAT KEEPS THE RUNTIME, USE THE FFMPEG SCRIPT INSTEAD.',
    '',
  ]

  // Invert the mute ranges into the spans that are kept.
  const keeps: { startSec: number; endSec: number }[] = []
  let cursor = 0
  for (const range of ranges) {
    if (range.startSec > cursor) keeps.push({ startSec: cursor, endSec: range.startSec })
    cursor = Math.max(cursor, range.endSec)
  }
  if (cursor < runtime) keeps.push({ startSec: cursor, endSec: runtime })

  let recordCursor = 0
  keeps.forEach((keep, index) => {
    const duration = keep.endSec - keep.startSec
    const event = String(index + 1).padStart(3, '0')
    lines.push(
      `${event}  AX       AA/V  C        ${edlTime(keep.startSec, fps)} ${edlTime(keep.endSec, fps)} ${edlTime(recordCursor, fps)} ${edlTime(recordCursor + duration, fps)}`
    )
    recordCursor += duration
  })

  if (keeps.length === 0) {
    lines.push('* NOTHING TO TRIM. NO FINDING IN THIS CUT WAS COUNTED BY ANY PLATFORM.')
  }

  return `${lines.join('\n')}\n`
}

/** A plain listing of the ranges, used inside the report. */
export function describeRanges(result: ClearingResult, options: CutListOptions = {}): string[] {
  return buildCutRanges(result, options).map(
    (range) => `${docTime(range.startSec)} to ${docTime(range.endSec)}`
  )
}

function lastEnd(result: ClearingResult): number {
  return result.transcript.cues.reduce((max, cue) => Math.max(max, cue.endSec ?? 0), 0)
}

function suggestOutputName(input: string): string {
  const dot = input.lastIndexOf('.')
  if (dot <= 0) return `${input}-cleared`
  return `${input.slice(0, dot)}-cleared${input.slice(dot)}`
}

function truncate(text: string, max: number): string {
  const flat = text.replace(/\s+/g, ' ').trim()
  return flat.length <= max ? flat : `${flat.slice(0, max - 1)}…`
}
