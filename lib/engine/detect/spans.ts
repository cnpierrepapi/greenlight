/**
 * Hits to findings.
 *
 * Contract: `buildFindings(transcript, hits)` merges neighbouring hits of the
 * same class into one finding, applies the context modifiers, settles severity
 * and confidence, and attaches the quote from the creator's own words. Returns
 * findings in transcript order, suppressed ones included.
 *
 * Callers: `lib/engine/index.ts`, and tests.
 *
 * Why merge at all: a thirty second passage describing an assault produces a
 * dozen hits. Reporting twelve findings would be both unreadable and wrong,
 * because every pack threshold that counts findings would read one passage as a
 * dozen offences. Merging turns it into what it actually is, one sustained
 * passage with a start, an end, and a run of evidence behind it.
 */

import type { Finding, LexiconHit, Modifier, Severity, Transcript } from '../types'
import { buildContextIndex, judge } from './context'

/** Hits of the same class closer than this merge into one finding. */
const MERGE_GAP_TOKENS = 40
const MERGE_GAP_SECONDS = 15

/** Longest quote carried into a finding, in characters. */
const MAX_QUOTE = 320

/** Repeated findings in one class beyond this get an informational note. */
const DENSITY_NOTE_AT = 4

export interface BuildOptions {
  /** Opening window in seconds, passed through to the position modifier. */
  openingSec?: number
}

export function buildFindings(
  transcript: Transcript,
  hits: LexiconHit[],
  options: BuildOptions = {}
): Finding[] {
  const index = buildContextIndex(transcript, options.openingSec ?? 30)

  // Group first, judge second. Judging a merged span on its first hit keeps the
  // rationale readable: one passage gets one explanation rather than twelve
  // near identical ones.
  const groups = groupHits(transcript, hits)

  const findings = groups.map((group) => {
    const first = group[0] as LexiconHit
    const last = group[group.length - 1] as LexiconHit
    const modifiers = judge(first, transcript, index)

    const startToken = transcript.tokens[first.tokenStart]
    const endToken = transcript.tokens[last.tokenEnd]
    const untimed = startToken?.timing === 'none'

    const severity = settleSeverity(group, modifiers)
    const confidence = settleConfidence(modifiers)
    const suppressed = modifiers.some((m) => m.effect === 'suppress') || severity < 1

    return {
      id: `${first.class}@${first.tokenStart}`,
      class: first.class,
      categoryHint: first.class.split('.')[0] ?? first.class,
      startSec: untimed ? null : (startToken?.startSec ?? null),
      endSec: untimed ? null : (endToken?.endSec ?? null),
      tokenStart: first.tokenStart,
      tokenEnd: last.tokenEnd,
      quote: quoteFor(transcript, first.tokenStart, last.tokenEnd),
      severity: clampSeverity(severity),
      confidence,
      hits: group,
      modifiers,
      suppressed,
    } satisfies Finding
  })

  return addDensityNotes(findings)
}

/**
 * Groups by class, keeping one open group per class rather than only the most
 * recent group overall.
 *
 * That distinction is the difference between reading a passage correctly and
 * reading it as noise. A narrator describing an assault interleaves the act and
 * the injuries in the same breath, so the hits arrive as descriptive, graphic,
 * descriptive, graphic. Only tracking the last group would break that into four
 * findings, and every threshold that counts findings would then read one
 * passage as four separate offences.
 */
function groupHits(transcript: Transcript, hits: LexiconHit[]): LexiconHit[][] {
  const groups: LexiconHit[][] = []
  const openByClass = new Map<string, LexiconHit[]>()

  for (const hit of hits) {
    const open = openByClass.get(hit.class)
    const previous = open?.[open.length - 1]

    if (open && previous) {
      const tokenGap = hit.tokenStart - previous.tokenEnd
      const previousEnd = transcript.tokens[previous.tokenEnd]?.endSec ?? 0
      const currentStart = transcript.tokens[hit.tokenStart]?.startSec ?? 0
      const secondsGap = currentStart - previousEnd

      if (tokenGap <= MERGE_GAP_TOKENS && secondsGap <= MERGE_GAP_SECONDS) {
        open.push(hit)
        continue
      }
    }

    const started = [hit]
    groups.push(started)
    openByClass.set(hit.class, started)
  }

  // Findings are reported in transcript order, which after class grouping is no
  // longer the order the groups were opened in.
  return groups.sort((a, b) => (a[0]?.tokenStart ?? 0) - (b[0]?.tokenStart ?? 0))
}

/**
 * The most severe hit in the span sets the floor, then modifiers move it. A
 * passage is judged by its worst moment, not by the average of its words.
 */
function settleSeverity(group: LexiconHit[], modifiers: Modifier[]): number {
  const base = Math.max(...group.map((hit) => hit.baseSeverity))
  const delta = modifiers.reduce((sum, modifier) => sum + modifier.deltaSeverity, 0)
  return base + delta
}

function settleConfidence(modifiers: Modifier[]): number {
  const delta = modifiers.reduce((sum, modifier) => sum + modifier.deltaConfidence, 0)
  return Math.round(Math.min(0.99, Math.max(0.05, 0.94 + delta)) * 100) / 100
}

function clampSeverity(value: number): Severity {
  const clamped = Math.min(5, Math.max(1, Math.round(value)))
  return clamped as Severity
}

/**
 * The creator's own words around the finding. Whole cues are used rather than a
 * token window, because a half sentence reads as a system quoting fragments and
 * a whole line reads as a person who watched the video.
 */
function quoteFor(transcript: Transcript, tokenStart: number, tokenEnd: number): string {
  const firstCue = transcript.tokens[tokenStart]?.cueIndex ?? 0
  const lastCue = transcript.tokens[tokenEnd]?.cueIndex ?? firstCue

  const text = transcript.cues
    .slice(firstCue, lastCue + 1)
    .map((cue) => cue.text)
    .join(' ')
    .replace(/\s+/g, ' ')
    .trim()

  if (text.length <= MAX_QUOTE) return text
  return `${text.slice(0, MAX_QUOTE - 1).trimEnd()}…`
}

/**
 * Repetition is a fact about the video that a creator should see, but the packs
 * are what decide whether it matters: several of them already count findings in
 * a category. So this adds an explanatory modifier and deliberately no severity
 * change, rather than counting the same fact twice.
 */
function addDensityNotes(findings: Finding[]): Finding[] {
  const counts = new Map<string, number>()
  for (const finding of findings) {
    if (finding.suppressed) continue
    counts.set(finding.class, (counts.get(finding.class) ?? 0) + 1)
  }

  return findings.map((finding) => {
    const count = counts.get(finding.class) ?? 0
    if (finding.suppressed || count < DENSITY_NOTE_AT) return finding
    return {
      ...finding,
      modifiers: [
        ...finding.modifiers,
        {
          id: 'density.repetition',
          effect: 'raise',
          deltaSeverity: 0,
          deltaConfidence: 0,
          note: `This is one of ${count} separate moments in the same category across the video, which is what platforms mean by frequent rather than occasional.`,
        },
      ],
    }
  })
}
