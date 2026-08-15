'use client'

/**
 * The verdict cards. Read before any detail.
 *
 * Contract: one card per platform, worst category first inside each. Clicking a
 * category selects the first finding that drove it, which is what connects a
 * verdict to the moment that caused it. Callers: `components/clearing.tsx`.
 *
 * Cleared categories are collapsed behind a count rather than listed. A creator
 * scanning this row is looking for what is wrong, and eighteen green rows
 * across three cards buries the two that are not.
 */

import type { ClearingResult, Finding } from '@/lib/engine/types'
import { levelLabel } from '@/lib/ui/format'

interface VerdictsProps {
  result: ClearingResult
  onSelect: (finding: Finding) => void
}

export function Verdicts({ result, onSelect }: VerdictsProps) {
  const byId = new Map(result.findings.map((finding) => [finding.id, finding]))

  return (
    <section className="verdicts" aria-label="Verdicts by platform">
      {result.platforms.map((platform) => {
        const flagged = platform.categories.filter((category) => category.level !== 'cleared')
        const clearedCount = platform.categories.length - flagged.length

        return (
          <article key={platform.packId} className={`verdict level-${platform.level}`}>
            <header>
              <h3>{platform.packLabel}</h3>
              <span className="stamp">{levelLabel(platform.level)}</span>
            </header>

            {flagged.length === 0 ? (
              <p className="all-clear">
                Nothing above the threshold in any of the {platform.categories.length} categories.
              </p>
            ) : (
              <ul>
                {flagged.map((category) => {
                  const first = category.findingIds.map((id) => byId.get(id)).find(Boolean)
                  return (
                    <li key={category.categoryId}>
                      <button
                        type="button"
                        className="cat"
                        onClick={() => first && onSelect(first)}
                        disabled={!first}
                      >
                        <span className={`dot dot-${category.level}`} aria-hidden="true" />
                        <span>
                          <strong>{category.label}.</strong> {category.reason}
                        </span>
                      </button>
                    </li>
                  )
                })}
              </ul>
            )}

            <footer className="gl-mono">
              {clearedCount > 0 && flagged.length > 0 ? `${clearedCount} other categories cleared · ` : ''}
              pack {platform.packVersion}
            </footer>
          </article>
        )
      })}
    </section>
  )
}
