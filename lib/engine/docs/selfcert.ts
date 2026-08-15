/**
 * The self-certification answers, pre-filled with evidence.
 *
 * Contract: `renderSelfCert(result)` returns Markdown. Callers:
 * `lib/engine/docs/pack.ts`, and tests.
 *
 * The questionnaire is the chore this product exists next to: it is answered on
 * every upload, from memory, about a video the creator finished editing hours
 * ago. Answering it from the transcript takes it from a guess to a lookup, and
 * attaching the timecodes means that if the answer is ever questioned the
 * evidence is already written down.
 *
 * The limit is stated at the top of the output rather than buried: Greenlight
 * reads what is said, never what is shown. Questions about imagery are listed
 * unanswered instead of being guessed at from speech, because a wrong self-cert
 * answer is worse for a creator than no answer. The whole value here is that
 * the answers are defensible.
 */

import type { ClearingResult, Finding } from '../types'
import { platformById, shortTime } from './format'

interface Question {
  id: string
  /** The YouTube pack category this reads from, or null when we have no signal. */
  categoryId: string | null
  question: string
  none: string
  some: string
  heavy: string
}

const QUESTIONS: Question[] = [
  {
    id: 'language',
    categoryId: 'language',
    question: 'Does this video contain inappropriate language?',
    none: 'No inappropriate language.',
    some: 'Yes, infrequent or moderate language.',
    heavy: 'Yes, frequent or strong language.',
  },
  {
    id: 'violence',
    categoryId: 'violence',
    question: 'Does this video contain violence?',
    none: 'No violence.',
    some: 'Yes, non-graphic, or violence in the course of standard video game play.',
    heavy: 'Yes, graphic or sustained description of violence.',
  },
  {
    id: 'adult',
    categoryId: 'adult',
    question: 'Does this video contain adult content?',
    none: 'No adult content.',
    some: 'Yes, non-graphic references only.',
    heavy: 'Yes, explicit sexual content.',
  },
  {
    id: 'drugs',
    categoryId: 'drugs',
    question: 'Does this video contain recreational drugs or drug related content?',
    none: 'No drug related content.',
    some: 'Yes, referenced or discussed.',
    heavy: 'Yes, depicted or promoted.',
  },
  {
    id: 'hate',
    categoryId: 'hate',
    question: 'Does this video contain hateful or derogatory content?',
    none: 'No hateful or derogatory content.',
    some: 'Yes, discussed in an educational or documentary context.',
    heavy: 'Yes, present and directed at a person or group.',
  },
  {
    id: 'sensitive',
    categoryId: 'sensitive',
    question: 'Does this video discuss a controversial issue or a sensitive event?',
    none: 'No controversial issues or sensitive events.',
    some: 'Yes, referenced in passing.',
    heavy: 'Yes, the video discusses one at length.',
  },
]

/**
 * Questions Greenlight has no business answering. Everything here is either
 * visual or about intent, and both are outside what a transcript can show.
 */
const UNANSWERABLE = [
  'Harmful or dangerous acts, which turn on what is shown being performed rather than described.',
  'Firearms related content, where the question is whether a weapon appears on screen.',
  'Tobacco related content, same reason.',
  'Shocking or disturbing imagery.',
  'Incendiary or demeaning content, which turns on tone and intent rather than on any word.',
]

export function renderSelfCert(result: ClearingResult): string {
  const youtube = platformById(result, 'youtube')

  const lines: string[] = [
    '# Self-certification answers',
    '',
    `Prepared by Greenlight on ${result.clearedAt} from this video's own transcript.`,
    '',
    '**Read this before you copy the answers across.** Greenlight reads what is said in',
    'a video, never what is shown. Every answer below is drawn from the transcript and',
    'carries the timecodes it came from, so you can check it. The questions that turn on',
    'imagery are listed at the end unanswered, because a wrong self-certification answer',
    'costs a creator more than a missing one.',
    '',
    'These answers are a drafting aid. You are the one certifying, and the platform makes',
    'the call.',
    '',
    '---',
    '',
  ]

  for (const question of QUESTIONS) {
    const category = youtube?.categories.find((c) => c.categoryId === question.categoryId) ?? null
    const findings = category ? findingsFor(result, category.findingIds) : []
    const classFindings = findingsInCategoryClasses(result, question.categoryId)

    const answer =
      category && category.level !== 'cleared'
        ? question.heavy
        : classFindings.length > 0
          ? question.some
          : question.none

    lines.push(`### ${question.question}`, '', `**${answer}**`, '')

    const evidence = findings.length > 0 ? findings : classFindings
    if (evidence.length === 0) {
      lines.push('Nothing in the transcript touches this.', '')
    } else {
      lines.push('Evidence:', '')
      for (const finding of evidence.slice(0, 8)) {
        const at = finding.startSec === null ? 'no timing' : shortTime(finding.startSec)
        lines.push(`- \`${at}\` ${quoteTerms(finding)} — ${finding.class}`)
      }
      if (evidence.length > 8) lines.push(`- and ${evidence.length - 8} more, listed in the report.`)
      lines.push('')
    }

    if (category && category.level !== 'cleared') {
      lines.push(`> ${category.reason}`, '')
    }
  }

  lines.push(
    '---',
    '',
    '## Questions Greenlight cannot answer for you',
    '',
    'These need somebody to watch the video. Answer them yourself.',
    '',
    ...UNANSWERABLE.map((item) => `- ${item}`),
    '',
    '---',
    '',
    `Packs: ${result.platforms.map((p) => `${p.packLabel} ${p.packVersion}`).join(', ')}. Engine ${result.engineVersion}.`,
    '',
    'Greenlight reads published platform policy. It does not speak for any platform, it is',
    'not legal advice, and it cannot guarantee monetization.',
    '',
  )

  return lines.join('\n')
}

function findingsFor(result: ClearingResult, ids: string[]): Finding[] {
  const set = new Set(ids)
  return result.findings.filter((finding) => set.has(finding.id))
}

/**
 * Findings whose class belongs to a category, whether or not the category
 * counted them.
 *
 * A cleared category with findings in it is not the same answer as a category
 * with nothing in it. "Infrequent or moderate" is the honest answer to the
 * first and "none" is the honest answer to the second, and a creator who
 * certifies "none" over a video with three swear words in it has certified
 * something false even though the category cleared.
 */
function findingsInCategoryClasses(result: ClearingResult, categoryId: string | null): Finding[] {
  if (!categoryId) return []
  const youtube = platformById(result, 'youtube')
  const category = youtube?.categories.find((c) => c.categoryId === categoryId)
  if (!category) return []

  // The pack's class list is not on the verdict, so match on the class prefix
  // the category is named after plus anything it already counted.
  const counted = new Set(category.findingIds)
  return result.findings.filter(
    (finding) => counted.has(finding.id) || categoryMatchesClass(categoryId, finding.class)
  )
}

function categoryMatchesClass(categoryId: string, className: string): boolean {
  const root = className.split('.')[0] ?? ''
  if (categoryId === 'language') return root === 'profanity'
  if (categoryId === 'violence') return root === 'violence'
  if (categoryId === 'adult') return root === 'sexual'
  if (categoryId === 'drugs') return root === 'drugs'
  if (categoryId === 'hate') return root === 'hate'
  if (categoryId === 'sensitive') return root === 'controversial' || root === 'selfharm'
  return false
}

function quoteTerms(finding: Finding): string {
  const terms = [...new Set(finding.hits.map((hit) => hit.matched))]
  return terms.length > 0 ? `"${terms.join('", "')}"` : finding.quote.slice(0, 60)
}
