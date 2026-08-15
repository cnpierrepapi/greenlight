/**
 * Shared formatting for the four documents.
 *
 * Contract: pure functions over engine types. Callers: everything else in
 * `lib/engine/docs/`.
 *
 * Documents are held to a stricter standard than the interface. A timecode on
 * screen is checked against the video in a second; a timecode in a brief filed
 * with a platform is not, so the ones written here carry milliseconds and the
 * frame rate they were converted at.
 */

import type { ClearingResult, Finding, Pack, PlatformVerdict, VerdictLevel } from '../types'

/** HH:MM:SS.mmm. What goes in a document. */
export function docTime(seconds: number): string {
  const whole = Math.floor(seconds)
  const hours = Math.floor(whole / 3600)
  const minutes = Math.floor((whole % 3600) / 60)
  const rest = whole % 60
  const millis = Math.round((seconds - whole) * 1000)
  return [
    String(hours).padStart(2, '0'),
    String(minutes).padStart(2, '0'),
    String(rest).padStart(2, '0'),
  ].join(':') + `.${String(millis).padStart(3, '0')}`
}

/** MM:SS.t. Short form for prose. */
export function shortTime(seconds: number): string {
  const whole = Math.floor(seconds)
  const minutes = Math.floor(whole / 60)
  const rest = whole % 60
  return `${String(minutes).padStart(2, '0')}:${String(rest).padStart(2, '0')}.${Math.floor((seconds - whole) * 10)}`
}

/**
 * HH:MM:SS:FF for an EDL.
 *
 * Frames are floored rather than rounded, so a converted timecode never lands
 * after the moment it describes. An editor trimming to a frame that arrives
 * late clips the first sound of the word they were trying to remove.
 */
export function edlTime(seconds: number, fps: number): string {
  const whole = Math.floor(seconds)
  const frames = Math.floor((seconds - whole) * fps)
  return [
    String(Math.floor(whole / 3600)).padStart(2, '0'),
    String(Math.floor((whole % 3600) / 60)).padStart(2, '0'),
    String(whole % 60).padStart(2, '0'),
    String(Math.min(frames, fps - 1)).padStart(2, '0'),
  ].join(':')
}

export function levelWord(level: VerdictLevel): string {
  if (level === 'cleared') return 'Cleared'
  if (level === 'limited') return 'Limited'
  return 'Strike risk'
}

/** Findings a given platform actually counted, in transcript order. */
export function findingsCountedBy(result: ClearingResult, packId: string): Finding[] {
  const platform = result.platforms.find((p) => p.packId === packId)
  if (!platform) return []
  const ids = new Set(
    platform.categories.filter((c) => c.level !== 'cleared').flatMap((c) => c.findingIds)
  )
  return result.findings.filter((finding) => ids.has(finding.id))
}

/** Findings any platform counted. What the cut list acts on. */
export function findingsThatCost(result: ClearingResult): Finding[] {
  const ids = new Set(
    result.platforms.flatMap((platform) =>
      platform.categories.filter((c) => c.level !== 'cleared').flatMap((c) => c.findingIds)
    )
  )
  return result.findings.filter((finding) => ids.has(finding.id))
}

export function platformById(result: ClearingResult, packId: string): PlatformVerdict | null {
  return result.platforms.find((p) => p.packId === packId) ?? null
}

/**
 * How a citation may be introduced.
 *
 * A pack citation is our summary of a published rule unless somebody has
 * checked it word for word and flipped `citation_verbatim`. The appeal brief
 * quotes citations inside a formal document, and presenting a summary as the
 * platform's own wording is the single mistake that would discredit the whole
 * output, so the introduction is generated from the flag rather than written by
 * hand at each call site.
 */
export function citationLead(verbatim: boolean, pack: Pack): string {
  return verbatim
    ? `The operative provision, as published in ${pack.sourceTitle}, states:`
    : `The operative provision is understood to arise under ${pack.sourceTitle}. The following is a summary of that provision rather than a quotation of it, and the published text is available at ${pack.sourceUrl}:`
}

/** Escapes text going into the HTML report. */
export function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

/** ISO date only, for document headers. */
export function isoDate(isoTimestamp: string): string {
  return isoTimestamp.slice(0, 10)
}
