/**
 * Pack integrity.
 *
 * scripts/build-packs.mjs validates a pack's structure at build time, but it
 * cannot check class names because that needs the lexicon module loaded
 * alongside. That check lives here, where both are real TypeScript.
 *
 * A pack naming a class the lexicon does not emit is the worst failure mode in
 * the product: the category silently clears every video, and a creator is told
 * they are safe because nothing could ever match.
 */

import { describe, expect, it } from 'vitest'
import { PACKS } from '@/lib/engine/policy/generated/packs'
import { KNOWN_CLASSES } from '@/lib/engine/policy/lexicon'

describe('policy packs', () => {
  it('compiles at least the three launch platforms', () => {
    expect(PACKS.map((pack) => pack.id).sort()).toEqual(['instagram', 'tiktok', 'youtube'])
  })

  it('only references classes the lexicon can emit', () => {
    const unknown: string[] = []
    for (const pack of PACKS) {
      for (const category of pack.categories) {
        for (const className of category.classes) {
          if (!KNOWN_CLASSES.includes(className)) {
            unknown.push(`${pack.id}/${category.id}: ${className}`)
          }
        }
      }
    }
    expect(unknown).toEqual([])
  })

  it('ends every category with an unconditional cleared threshold', () => {
    for (const pack of PACKS) {
      for (const category of pack.categories) {
        const last = category.thresholds[category.thresholds.length - 1]
        expect(last, `${pack.id}/${category.id}`).toBeDefined()
        expect(last?.level, `${pack.id}/${category.id}`).toBe('cleared')
        expect(last?.minFindings, `${pack.id}/${category.id}`).toBeUndefined()
        expect(last?.minSeverity, `${pack.id}/${category.id}`).toBeUndefined()
      }
    }
  })

  it('carries provenance on every pack, because the documents print it', () => {
    for (const pack of PACKS) {
      expect(pack.sourceUrl, pack.id).toMatch(/^https:\/\//)
      expect(pack.sourceTitle, pack.id).not.toBe('')
      expect(pack.retrieved, pack.id).toMatch(/^\d{4}-\d{2}-\d{2}$/)
    }
  })

  it('marks every citation as a summary until someone verifies the wording', () => {
    // Guard rail, not a preference. The appeal brief quotes citations inside a
    // formal document, so a summary must never be presented as the platform's
    // own words. When a citation is checked against the live page and copied
    // exactly, flip citation_verbatim in the YAML and this test will tell you
    // to update the expectation deliberately.
    for (const pack of PACKS) {
      for (const category of pack.categories) {
        expect(category.citationVerbatim, `${pack.id}/${category.id}`).toBe(false)
      }
    }
  })
})
