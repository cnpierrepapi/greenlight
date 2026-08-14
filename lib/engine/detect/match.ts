/**
 * Lexicon matching.
 *
 * Contract: `matchLexicon(transcript)` returns every `LexiconHit` in token
 * order. A hit is a candidate, never a verdict. `detect/context.ts` judges it
 * and `detect/spans.ts` turns surviving hits into findings.
 *
 * Callers: `lib/engine/index.ts`, and tests.
 *
 * Cost: one map lookup per prefix of each token, so roughly fifteen cheap
 * lookups per word rather than a walk of the whole lexicon. A two hour
 * transcript is about 20,000 tokens and completes in single digit
 * milliseconds, which is what lets the UI re-run a clearing on every pack
 * change without a spinner.
 */

import type { LexiconHit, Token, Transcript } from '../types'
import { LEXICON_BY_FIRST, type LexiconEntry } from '../policy/lexicon'

/** Shortest stem worth looking up. Below this every token matches something. */
const MIN_STEM = 2

export function matchLexicon(transcript: Transcript): LexiconHit[] {
  const hits: LexiconHit[] = []
  const tokens = transcript.tokens

  for (let i = 0; i < tokens.length; i++) {
    const token = tokens[i]
    if (!token || token.norm.length < MIN_STEM) continue

    for (const entry of candidatesFor(token)) {
      for (const pattern of entry.patterns) {
        const end = matchPattern(pattern, tokens, i)
        if (end === -1) continue

        hits.push({
          termId: entry.id,
          class: entry.class,
          tokenStart: i,
          tokenEnd: end,
          matched: tokens
            .slice(i, end + 1)
            .map((t) => t.text)
            .join(' '),
          baseSeverity: entry.severity,
        })
        // First pattern of an entry wins. A second pattern from the same entry
        // matching the same place is the same finding said twice.
        break
      }
    }
  }

  return dropOverlaps(hits)
}

/**
 * Entries whose first pattern word could start at this token. Wildcards are
 * indexed on their stem, so progressively shorter prefixes of the token are
 * looked up: "goddamned" finds the entry keyed on "goddamn".
 */
function candidatesFor(token: Token): LexiconEntry[] {
  const found: LexiconEntry[] = []
  const exact = LEXICON_BY_FIRST.get(token.norm)
  if (exact) found.push(...exact)

  for (let length = token.norm.length - 1; length >= MIN_STEM; length--) {
    const bucket = LEXICON_BY_FIRST.get(token.norm.slice(0, length))
    if (!bucket) continue
    for (const entry of bucket) {
      if (!found.includes(entry)) found.push(entry)
    }
  }
  return found
}

/**
 * Returns the last token index of the match, or -1. A trailing `*` on a pattern
 * word matches the rest of that token, so `kill*` covers killed and killing but
 * never runs past a word boundary.
 */
function matchPattern(pattern: string, tokens: Token[], start: number): number {
  const words = pattern.split(' ')
  let cursor = start

  for (const word of words) {
    const token = tokens[cursor]
    if (!token) return -1

    if (word.endsWith('*')) {
      const stem = word.slice(0, -1)
      if (!token.norm.startsWith(stem)) return -1
    } else if (token.norm !== word) {
      return -1
    }
    cursor++
  }

  return cursor - 1
}

/**
 * When two entries match overlapping token ranges, keep the more severe one and
 * then the longer one.
 *
 * Why this matters in practice: "kill* himself" and "kill*" both match the same
 * words, and reporting both would double count the finding in every threshold
 * that counts findings, which would turn one sensitive moment into a limited
 * verdict on its own.
 */
function dropOverlaps(hits: LexiconHit[]): LexiconHit[] {
  const ordered = [...hits].sort((a, b) => {
    if (a.tokenStart !== b.tokenStart) return a.tokenStart - b.tokenStart
    if (a.baseSeverity !== b.baseSeverity) return b.baseSeverity - a.baseSeverity
    return b.tokenEnd - b.tokenStart - (a.tokenEnd - a.tokenStart)
  })

  const kept: LexiconHit[] = []
  let lastEnd = -1
  for (const hit of ordered) {
    if (hit.tokenStart <= lastEnd) continue
    kept.push(hit)
    lastEnd = hit.tokenEnd
  }
  return kept
}
