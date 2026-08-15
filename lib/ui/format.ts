/**
 * Presentation helpers shared by the bench components.
 *
 * Contract: pure functions over engine types. No React, no state. Callers:
 * everything in components/.
 *
 * These live outside components/ because two of them encode a rule rather than
 * a format. `levelForFinding` is the join that keeps the timeline honest: a
 * band is coloured by the verdict it actually drove, not by a guess from its
 * severity, so a red band on the strip always corresponds to a red row in the
 * verdict cards above it.
 */

import type { ClearingResult, Finding, VerdictLevel } from '@/lib/engine/types'

export interface Passage {
  quote: string
  findings: Finding[]
  tokenStart: number
  tokenEnd: number
}

/**
 * Findings that cover the same stretch of transcript become one card.
 *
 * Fixes a presentation bug rather than an engine one. A narrator describing an
 * assault and then its injuries produces two findings in different classes over
 * one sentence, and the first build printed that sentence twice, one card under
 * the other. It read like a bug because it looked like one. The engine was
 * right, two things were found. The list was wrong about how many things had
 * happened.
 *
 * Grouping is by overlapping token range, not by matching quote text. The first
 * attempt compared the quote strings and grouped nothing, because the two
 * findings rarely quote the same thing: one span reaches across four cues and
 * the other across one, so their quotes differ while describing the same
 * moment. The widest quote in the group is the one shown, since it is the one
 * that contains the others.
 */
export function groupIntoPassages(findings: Finding[]): Passage[] {
  const passages: Passage[] = []

  for (const finding of findings) {
    const open = passages[passages.length - 1]

    if (open && finding.tokenStart <= open.tokenEnd) {
      open.findings.push(finding)
      open.tokenEnd = Math.max(open.tokenEnd, finding.tokenEnd)
      if (finding.quote.length > open.quote.length) open.quote = finding.quote
      continue
    }

    passages.push({
      quote: finding.quote,
      findings: [finding],
      tokenStart: finding.tokenStart,
      tokenEnd: finding.tokenEnd,
    })
  }

  return passages
}

/** mm:ss.t, the format a creator reads off their editor's timeline. */
export function formatTime(seconds: number): string {
  const whole = Math.floor(seconds)
  const minutes = Math.floor(whole / 60)
  const rest = whole % 60
  const tenths = Math.floor((seconds - whole) * 10)
  return `${String(minutes).padStart(2, '0')}:${String(rest).padStart(2, '0')}.${tenths}`
}

/** mm:ss, for axis ticks where a tenth is noise. */
export function formatTick(seconds: number): string {
  const whole = Math.round(seconds)
  return `${String(Math.floor(whole / 60)).padStart(2, '0')}:${String(whole % 60).padStart(2, '0')}`
}

export function levelLabel(level: VerdictLevel): string {
  if (level === 'cleared') return 'Cleared'
  if (level === 'limited') return 'Limited'
  return 'Strike risk'
}

const RANK: Record<VerdictLevel, number> = { cleared: 0, limited: 1, strike: 2 }

export function worseOf(a: VerdictLevel, b: VerdictLevel): VerdictLevel {
  return RANK[a] >= RANK[b] ? a : b
}

/**
 * The worst verdict this finding actually caused, across every platform.
 *
 * A finding is not risky in the abstract. It is risky because some category on
 * some platform counted it, and that is what the colour on the timeline should
 * mean. Reading it back from the verdicts rather than from the finding's own
 * severity means the strip can never disagree with the cards.
 */
export function levelForFinding(result: ClearingResult, findingId: string): VerdictLevel {
  let level: VerdictLevel = 'cleared'
  for (const platform of result.platforms) {
    for (const category of platform.categories) {
      if (category.level === 'cleared') continue
      if (category.findingIds.includes(findingId)) {
        level = worseOf(level, category.level)
      }
    }
  }
  return level
}

/** Which platforms named this finding, for the finding card. */
export function platformsForFinding(result: ClearingResult, findingId: string): string[] {
  const names: string[] = []
  for (const platform of result.platforms) {
    const hit = platform.categories.some(
      (category) => category.level !== 'cleared' && category.findingIds.includes(findingId)
    )
    if (hit) names.push(platform.packLabel)
  }
  return names
}

/**
 * The runtime the timeline is drawn against.
 *
 * Falls back to the last finding or cue when the source could not say how long
 * the video is, which is the normal case for a subtitle file. Never returns 0,
 * because dividing by it puts every band at the left edge.
 */
export function runtimeOf(result: ClearingResult): number {
  if (result.transcript.durationSec && result.transcript.durationSec > 0) {
    return result.transcript.durationSec
  }
  const lastCue = result.transcript.cues.reduce((max, cue) => Math.max(max, cue.endSec ?? 0), 0)
  return lastCue > 0 ? lastCue : 1
}
