/**
 * The appeal brief.
 *
 * Contract: `renderAppeal(result, context)` returns Markdown. Callers:
 * `lib/engine/docs/pack.ts`, and tests.
 *
 * This is the one surface in the product that drops the plain voice, and it
 * does so deliberately. A creator writing "please look at this again, I don't
 * think this is fair" gets a form response. A dated submission that identifies
 * the operative provision, numbers its exhibits by timecode and states a
 * specific remedy reads as a prepared party, and it survives being forwarded to
 * a second reviewer without its author present.
 *
 * The rule that keeps it honest, and the reason `assessAgreement()` exists:
 * when this video's own findings support the platform's decision, the brief
 * says so and shifts to asking for the timecodes relied upon and offering a
 * conforming edit. It does not argue a losing point. A tool that generated
 * confident nonsense appeals would get creators ignored, and would deserve to
 * be.
 *
 * Every blank left in the output is a fact only the creator has: channel
 * identity, the platform's case reference, the decision date. Nothing about the
 * video itself is left blank, and nothing is invented.
 */

import type { ClearingResult, Finding, Pack, CategoryVerdict } from '../types'
import { citationLead, docTime, platformById, shortTime } from './format'

export type AppealDecision = 'limited' | 'removed' | 'age_restricted'

export interface AppealContext {
  /** Which platform made the decision. */
  packId: string
  decision: AppealDecision
  /** What the platform said, pasted by the creator. Drives category selection. */
  statedReason: string
  /** ISO date the brief is filed. Passed in, never read from a clock. */
  filedOn: string
  decisionDate?: string
  caseRef?: string
  assetId?: string
  channelName?: string
}

const DECISION_WORDS: Record<AppealDecision, string> = {
  limited: 'a determination of limited or no advertising suitability',
  age_restricted: 'the application of an age restriction',
  removed: 'the removal of the asset',
}

const REMEDY_WORDS: Record<AppealDecision, string> = {
  limited: 'reinstatement of full advertising suitability for the asset',
  age_restricted: 'removal of the age restriction applied to the asset',
  removed: 'reinstatement of the asset',
}

export function renderAppeal(
  result: ClearingResult,
  pack: Pack,
  context: AppealContext
): string {
  const platform = platformById(result, context.packId)
  if (!platform) {
    throw new Error(`No verdict for ${context.packId}. Clear the cut against that pack first.`)
  }

  const category = selectCategory(platform.categories, context.statedReason)
  const packCategory = pack.categories.find((c) => c.id === category?.categoryId) ?? null
  const exhibits = gatherExhibits(result, category, packCategory)
  const agreement = assessAgreement(category, context.decision)
  const grounds = buildGrounds(result, exhibits, agreement)

  const lines: string[] = []

  // --- header -------------------------------------------------------------
  lines.push(
    '# Request for Reconsideration',
    '',
    `**Platform:** ${platform.packLabel}`,
    `**Channel:** ${context.channelName ?? '[CHANNEL NAME]'}`,
    `**Asset:** ${context.assetId ?? '[VIDEO ID OR URL]'}`,
    `**Case reference:** ${context.caseRef ?? '[PLATFORM CASE REFERENCE]'}`,
    `**Decision date:** ${context.decisionDate ?? '[DECISION DATE]'}`,
    `**Filed:** ${context.filedOn}`,
    '',
    '---',
    ''
  )

  // --- I. statement -------------------------------------------------------
  lines.push(
    '## I. Statement of the matter',
    '',
    `The Submitting Party publishes the asset identified above and received, on ${context.decisionDate ?? '[DECISION DATE]'}, ${DECISION_WORDS[context.decision]}. The reason recorded by the platform is as follows:`,
    '',
    `> ${context.statedReason.trim() || '[REASON AS STATED BY THE PLATFORM]'}`,
    '',
    `The Submitting Party respectfully requests reconsideration of that determination on the grounds set out at Part III, and relies on the timestamped exhibits at Part IV, each of which is drawn from the asset as delivered.`,
    ''
  )

  // --- II. operative provision -------------------------------------------
  lines.push('## II. Operative provision', '')
  if (packCategory) {
    lines.push(
      citationLead(packCategory.citationVerbatim, pack),
      '',
      `> ${packCategory.citation.trim()}`,
      '',
      `The Submitting Party does not dispute the applicability of that provision and addresses only its application to the asset as delivered.`,
      ''
    )
  } else {
    lines.push(
      `The reason recorded by the platform does not identify a single provision of ${pack.sourceTitle}, and the Submitting Party has therefore addressed the asset as a whole. Should the platform identify the operative provision, the Submitting Party will address it directly.`,
      ''
    )
  }

  // --- III. grounds -------------------------------------------------------
  lines.push('## III. Grounds', '')
  if (grounds.length === 0) {
    lines.push(
      'The Submitting Party does not assert that the determination was reached in error.',
      '',
      'A review of the asset transcript identifies material falling within the provision at Part II, at the timecodes set out at Part IV. The Submitting Party accordingly limits this request to the alternative remedy at Part V, and asks that the platform identify the timecodes relied upon so that a conforming edit may be prepared.',
      ''
    )
  } else {
    grounds.forEach((ground, index) => {
      lines.push(`**Ground ${index + 1}. ${ground.title}**`, '', ground.body, '')
    })
  }

  // --- IV. exhibits -------------------------------------------------------
  lines.push('## IV. Exhibits', '')
  if (exhibits.length === 0) {
    lines.push(
      'A review of the asset transcript identifies no material falling within the provision at Part II. The Submitting Party is unable to identify the passage relied upon and asks that it be specified.',
      ''
    )
  } else {
    lines.push('```')
    exhibits.forEach((finding, index) => {
      const label = String.fromCharCode(65 + index)
      const span =
        finding.startSec === null
          ? 'timecode unavailable'
          : `${docTime(finding.startSec)} - ${docTime(finding.endSec ?? finding.startSec)}`
      lines.push(`EX. ${label}  ${span}`)
      lines.push(`         "${flatten(finding.quote, 150)}"`)
      lines.push(`         classification: ${finding.class}, severity ${finding.severity} of 5`)
    })
    lines.push('```', '')

    if (!result.transcript.exactTimings) {
      lines.push(
        `The timecodes above are derived from a transcript timed by line rather than by word, and locate each passage to within the line quoted.`,
        ''
      )
    }
  }

  // --- V. remedy ----------------------------------------------------------
  lines.push('## V. Remedy sought', '')
  if (grounds.length === 0) {
    lines.push(
      `The Submitting Party seeks written identification of the timecodes relied upon in reaching the determination, so that a conforming edit may be prepared and resubmitted.`,
      ''
    )
  } else {
    lines.push(
      `The Submitting Party seeks ${REMEDY_WORDS[context.decision]}.`,
      '',
      'In the alternative, and without prejudice to the foregoing, the Submitting Party seeks written identification of the timecodes relied upon, so that a conforming edit may be prepared and resubmitted.',
      ''
    )
  }

  // --- signature ----------------------------------------------------------
  lines.push(
    '---',
    '',
    `Prepared with Greenlight from the asset transcript on ${result.clearedAt}. Exhibit timecodes refer to the asset as delivered. Policy pack ${pack.id} ${pack.version}, guidelines read ${pack.retrieved}, source: ${pack.sourceUrl}`,
    '',
    'This document is a drafting aid. It is not legal advice, it is not affiliated with or',
    'endorsed by any platform, and it does not guarantee any outcome. Greenlight reads what',
    'is said in a video and not what is shown.',
    ''
  )

  return lines.join('\n')
}

/**
 * Which category the platform's stated reason is about.
 *
 * Matched on the words the platform used, because that is the only signal we
 * have about what they looked at. When nothing matches, the worst category we
 * found is the better guess than none, and Part II says plainly when no
 * provision could be identified at all.
 */
export function selectCategory(
  categories: CategoryVerdict[],
  statedReason: string
): CategoryVerdict | null {
  const reason = statedReason.toLowerCase()

  if (reason.trim() !== '') {
    const byLabel = categories.find((category) =>
      category.label
        .toLowerCase()
        .split(/[^a-z]+/)
        .filter((word) => word.length > 4)
        .some((word) => reason.includes(word))
    )
    if (byLabel) return byLabel
  }

  const flagged = categories.filter((category) => category.level !== 'cleared')
  if (flagged.length > 0) {
    return flagged.find((category) => category.level === 'strike') ?? flagged[0] ?? null
  }
  return null
}

interface Agreement {
  /** True when this video's own findings support the platform's decision. */
  supportsDecision: boolean
  category: CategoryVerdict | null
}

/**
 * Does our own reading agree with the platform?
 *
 * This is the check that stops the generator producing a confident appeal
 * against a decision the evidence supports.
 */
export function assessAgreement(
  category: CategoryVerdict | null,
  decision: AppealDecision
): Agreement {
  if (!category || category.level === 'cleared') {
    return { supportsDecision: false, category }
  }
  if (decision === 'limited') {
    return { supportsDecision: true, category }
  }
  // Removal and age restriction are past ad suitability. Only a strike level
  // finding of ours supports them.
  return { supportsDecision: category.level === 'strike', category }
}

interface Ground {
  title: string
  body: string
}

function buildGrounds(result: ClearingResult, exhibits: Finding[], agreement: Agreement): Ground[] {
  const grounds: Ground[] = []

  // When our own findings support the decision, no grounds are asserted. Part
  // III says so in terms and Part V asks for the timecodes instead.
  if (agreement.supportsDecision) return grounds

  if (exhibits.length === 0) {
    grounds.push({
      title: 'The asset transcript contains no material falling within the provision.',
      body: 'A review of the full transcript of the asset identifies no passage falling within the provision identified at Part II. The Submitting Party is unable to locate the material relied upon and asks that the timecodes be specified.',
    })
    return grounds
  }

  const framed = exhibits.filter((finding) =>
    finding.modifiers.some(
      (modifier) => modifier.id === 'context.news' || modifier.id === 'context.quotation'
    )
  )
  if (framed.length > 0) {
    grounds.push({
      title: 'The treatment is documentary rather than gratuitous.',
      body: `The passages at ${exhibitList(framed, exhibits)} are attributed within the asset itself to a report, an official record, or a third party being quoted. The surrounding narration establishes that framing before the passage rather than after it. The provision at Part II distinguishes documentary, educational and news treatments from gratuitous ones, and the Submitting Party submits that the asset falls on the former side of that line.`,
    })
  }

  const brief = exhibits.filter(
    (finding) => finding.startSec !== null && (finding.endSec ?? 0) - finding.startSec < 2
  )
  if (brief.length === exhibits.length && exhibits.length <= 3) {
    grounds.push({
      title: 'The material is limited in extent.',
      body: `The asset contains ${exhibits.length} instance${exhibits.length === 1 ? '' : 's'} falling within the provision, at ${exhibitList(exhibits, exhibits)}, each of under two seconds in duration. The Submitting Party submits that material of this extent, in an asset of ${runtimeWords(result)}, is incidental rather than a feature of the content.`,
    })
  }

  const directed = exhibits.filter((finding) =>
    finding.modifiers.some((modifier) => modifier.id === 'context.directed')
  )
  if (directed.length === 0 && exhibits.length > 0) {
    grounds.push({
      title: 'The material is not directed at any person or group.',
      body: 'None of the passages at Part IV is addressed to an individual or to a group. Each occurs as narration or as exclamation. The Submitting Party submits that this bears on the assessment of the material under the provision at Part II.',
    })
  }

  if (result.considered.length > 0) {
    grounds.push({
      title: 'The asset has been reviewed in full against the published guidelines.',
      body: `A review of the complete transcript identified a further ${result.considered.length} candidate passage${result.considered.length === 1 ? '' : 's'} which, on examination of their context, do not fall within the provision. The Submitting Party raises this to confirm that the asset has been assessed in full rather than in part, and that the exhibits at Part IV represent the entirety of the material at issue.`,
    })
  }

  return grounds
}

/**
 * Exhibits for the brief.
 *
 * When the platform flagged something we cleared, the exhibits still come from
 * the same category's classes, so the brief argues about the passages the
 * platform is most likely to have meant rather than about nothing at all.
 */
function gatherExhibits(
  result: ClearingResult,
  category: CategoryVerdict | null,
  packCategory: { classes: string[] } | null
): Finding[] {
  if (category && category.findingIds.length > 0) {
    const ids = new Set(category.findingIds)
    return result.findings.filter((finding) => ids.has(finding.id)).slice(0, 8)
  }
  if (packCategory) {
    return result.findings
      .concat(result.considered)
      .filter((finding) => packCategory.classes.includes(finding.class))
      .slice(0, 8)
  }
  return result.findings.slice(0, 8)
}

function exhibitList(subset: Finding[], all: Finding[]): string {
  const labels = subset.map((finding) => {
    const index = all.indexOf(finding)
    return `Exhibit ${String.fromCharCode(65 + (index < 0 ? 0 : index))}`
  })
  if (labels.length === 1) return labels[0] as string
  return `${labels.slice(0, -1).join(', ')} and ${labels[labels.length - 1]}`
}

function runtimeWords(result: ClearingResult): string {
  const runtime = result.transcript.durationSec
  if (!runtime) return 'the length submitted'
  return `${shortTime(runtime).split('.')[0]} in length`
}

function flatten(text: string, max: number): string {
  const flat = text.replace(/\s+/g, ' ').trim()
  return flat.length <= max ? flat : `${flat.slice(0, max - 1)}…`
}
