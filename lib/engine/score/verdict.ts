/**
 * Findings to verdicts.
 *
 * Contract: `scorePack(pack, findings)` returns one `PlatformVerdict`, and
 * `scoreAll(packs, findings)` returns one per platform. No policy judgement
 * lives in this file. It evaluates the thresholds declared in the pack YAML and
 * nothing else, which is what makes "tune YouTube" a change to a data file that
 * a non programmer can read.
 *
 * Callers: `lib/engine/index.ts`, and tests.
 */

import type {
  CategoryVerdict,
  Finding,
  Pack,
  PackCategory,
  PlatformVerdict,
  Threshold,
  VerdictLevel,
} from '../types'

/** Worst first. Used to reduce category levels to a platform level. */
const SEVERITY_ORDER: VerdictLevel[] = ['strike', 'limited', 'cleared']

export function scoreAll(packs: Pack[], findings: Finding[]): PlatformVerdict[] {
  return packs.map((pack) => scorePack(pack, findings))
}

export function scorePack(pack: Pack, findings: Finding[]): PlatformVerdict {
  const categories = pack.categories.map((category) => scoreCategory(category, findings))

  return {
    packId: pack.id,
    packLabel: pack.label,
    packVersion: pack.version,
    level: worstOf(categories.map((category) => category.level)),
    categories,
  }
}

function scoreCategory(category: PackCategory, findings: Finding[]): CategoryVerdict {
  // Suppressed findings never reach a threshold. They were considered and
  // cleared, and the report shows them separately so that decision is visible
  // rather than silent.
  const relevant = findings.filter(
    (finding) => !finding.suppressed && category.classes.includes(finding.class)
  )

  for (const threshold of category.thresholds) {
    const matched = matchThreshold(threshold, relevant)
    if (!matched) continue

    return {
      categoryId: category.id,
      label: category.label,
      level: threshold.level,
      findingIds: matched.map((finding) => finding.id),
      reason: threshold.reason,
      citation: category.citation,
    }
  }

  // build-packs.mjs refuses to compile a category that does not end in an
  // unconditional cleared threshold, so this is unreachable through the normal
  // path. It stays because a pack constructed in a test could reach it, and
  // silently returning nothing would be worse than saying so.
  return {
    categoryId: category.id,
    label: category.label,
    level: 'cleared',
    findingIds: [],
    reason: 'No threshold in this category matched.',
    citation: category.citation,
  }
}

/**
 * Returns the findings that satisfied the threshold, or null. Conditions on a
 * threshold are ANDed: `min_severity: 4` with `min_findings: 3` means three
 * findings that each reach severity 4, which is how "used repeatedly" reads in
 * the guidelines themselves.
 */
function matchThreshold(threshold: Threshold, findings: Finding[]): Finding[] | null {
  let pool = findings

  if (threshold.withinOpeningSec !== undefined) {
    const limit = threshold.withinOpeningSec
    // An untimed transcript cannot answer a question about position, so an
    // opening window rule does not fire rather than guessing that it does.
    pool = pool.filter((finding) => finding.startSec !== null && finding.startSec <= limit)
  }

  if (threshold.minSeverity !== undefined) {
    const floor = threshold.minSeverity
    pool = pool.filter((finding) => finding.severity >= floor)
  }

  if (threshold.minFindings !== undefined && pool.length < threshold.minFindings) {
    return null
  }

  // A threshold with a severity floor and no count still needs something to
  // have reached the floor.
  if (threshold.minSeverity !== undefined && threshold.minFindings === undefined && pool.length === 0) {
    return null
  }

  // An unconditional threshold, which by convention is the closing cleared row.
  if (
    threshold.minSeverity === undefined &&
    threshold.minFindings === undefined &&
    threshold.withinOpeningSec === undefined
  ) {
    return []
  }

  return pool
}

export function worstOf(levels: VerdictLevel[]): VerdictLevel {
  for (const level of SEVERITY_ORDER) {
    if (levels.includes(level)) return level
  }
  return 'cleared'
}
