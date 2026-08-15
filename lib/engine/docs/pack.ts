/**
 * The pack: the four documents, named and ready to download.
 *
 * Contract: `buildPack(result, options)` returns the documents that can be
 * produced from a clearing alone. The appeal brief is not among them, because
 * it needs facts only the creator has, and `buildAppeal()` takes those
 * separately. Callers: the UI, and tests.
 *
 * Filenames are stable and self describing, because a creator who downloads a
 * pack for three videos in one afternoon ends up with twelve files in one
 * folder, and `report (3).html` helps nobody.
 */

import type { ClearingResult, Pack } from '../types'
import { PACKS } from '../policy/generated/packs'
import { renderReport } from './report'
import { renderFfmpeg, renderEdl, type CutListOptions } from './cutlist'
import { renderSelfCert } from './selfcert'
import { renderAppeal, type AppealContext } from './appeal'

export interface Document {
  filename: string
  mime: string
  contents: string
  /** One line, shown next to the download button. */
  blurb: string
}

export interface PackOptions extends CutListOptions {
  /** Used to name the files, so a folder of packs stays readable. */
  slug?: string
  /** Overrides the compiled packs. Used by tests. */
  packs?: Pack[]
}

export function buildPack(result: ClearingResult, options: PackOptions = {}): Document[] {
  const slug = safeSlug(options.slug ?? 'cut')

  return [
    {
      filename: `${slug}-report.html`,
      mime: 'text/html',
      contents: renderReport(result),
      blurb: 'Every finding, its timecode, and the rule it trips. Opens with no internet.',
    },
    {
      filename: `${slug}-cutlist.sh`,
      mime: 'text/x-shellscript',
      contents: renderFfmpeg(result, options),
      blurb: 'Run this and the flagged seconds go silent. The picture is copied, not re-encoded.',
    },
    {
      filename: `${slug}-cutlist.edl`,
      mime: 'text/plain',
      contents: renderEdl(result, options),
      blurb: 'Same ranges for Premiere or Resolve, if you would rather cut them out than mute them.',
    },
    {
      filename: `${slug}-selfcert.md`,
      mime: 'text/markdown',
      contents: renderSelfCert(result),
      blurb: 'The advertiser questionnaire, already answered, with the timecode behind each answer.',
    },
  ]
}

/**
 * The appeal brief, generated only once a decision exists.
 *
 * Kept out of `buildPack` on purpose. A brief written before anything has gone
 * wrong would be a document arguing against a decision nobody has made, and
 * offering one would invite a creator to file it.
 */
export function buildAppeal(
  result: ClearingResult,
  context: AppealContext,
  options: PackOptions = {}
): Document {
  const pack = (options.packs ?? PACKS).find((candidate) => candidate.id === context.packId)
  if (!pack) throw new Error(`No policy pack called ${context.packId}.`)

  const slug = safeSlug(options.slug ?? 'cut')
  return {
    filename: `${slug}-appeal-${context.packId}.md`,
    mime: 'text/markdown',
    contents: renderAppeal(result, pack, context),
    blurb: 'A filed response with numbered exhibits from your own footage, ready to paste into the form.',
  }
}

function safeSlug(raw: string): string {
  const cleaned = raw
    .toLowerCase()
    .replace(/\.[a-z0-9]+$/, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
  return cleaned === '' ? 'cut' : cleaned.slice(0, 48)
}
