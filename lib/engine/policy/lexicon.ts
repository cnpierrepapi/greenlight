/**
 * The lexicon: the terms that start a finding.
 *
 * Contract: exports `LEXICON`, a flat list of entries, and `LEXICON_BY_FIRST`,
 * an index from the first normalised word of a pattern to the entries that
 * start with it. `detect/match.ts` is the only consumer.
 *
 * A hit here is a candidate, never a verdict. Severity set on an entry is a
 * starting point that `detect/context.ts` moves up or down, and the packs in
 * packs/*.yaml decide what any of it means for a given platform.
 *
 * Why TypeScript and not YAML, when the packs are YAML: pack rules get corrected
 * by whoever reads a platform's guideline page, so they must be editable by a
 * non programmer. The lexicon is matching machinery, it needs wildcards and
 * multi word sequences, and it is edited by whoever is working on the matcher.
 * Keeping it typed catches a bad class name at compile time instead of at run.
 */

import type { Severity } from '../types'

export interface LexiconEntry {
  id: string
  /** Dotted class. Packs reference these, so a rename is a breaking change. */
  class: string
  /**
   * Normalised word sequences. A trailing `*` matches the rest of that word,
   * so `damn*` covers damn, damned and damning. Multi word patterns are matched
   * across adjacent tokens.
   */
  patterns: string[]
  severity: Severity
  /** Shown in the report so a creator understands why this was picked up. */
  note: string
}

export const LEXICON: LexiconEntry[] = [
  // --- language ------------------------------------------------------------
  // The three tiers exist because platforms treat them differently, and because
  // placement matters more than presence. See packs/youtube.yaml.
  {
    id: 'lang.mild.damn',
    class: 'profanity.mild',
    patterns: ['damn*', 'goddamn*'],
    severity: 1,
    note: 'Mild language. Rarely an issue on its own, counted for density.',
  },
  {
    id: 'lang.mild.hell',
    class: 'profanity.mild',
    patterns: ['hell'],
    severity: 1,
    note: 'Mild language. Frequently a false positive in other senses.',
  },
  {
    id: 'lang.mild.crap',
    class: 'profanity.mild',
    patterns: ['crap*'],
    severity: 1,
    note: 'Mild language.',
  },
  {
    id: 'lang.mod.shit',
    class: 'profanity.moderate',
    patterns: ['shit*', 'bullshit*'],
    severity: 2,
    note: 'Moderate language. Placement in the opening drives the outcome.',
  },
  {
    id: 'lang.mod.ass',
    class: 'profanity.moderate',
    patterns: ['asshole*', 'arsehole*'],
    severity: 2,
    note: 'Moderate language, directed at a person.',
  },
  {
    id: 'lang.mod.bastard',
    class: 'profanity.moderate',
    patterns: ['bastard*'],
    severity: 2,
    note: 'Moderate language.',
  },
  {
    id: 'lang.mod.bitch',
    class: 'profanity.moderate',
    patterns: ['bitch*'],
    severity: 3,
    note: 'Moderate to strong depending on target. Raised when directed.',
  },
  {
    id: 'lang.strong.f',
    class: 'profanity.strong',
    patterns: ['fuck*', 'motherfuck*'],
    severity: 4,
    note: 'Strong language. The single biggest driver of limited ads.',
  },
  {
    id: 'lang.strong.c',
    class: 'profanity.strong',
    patterns: ['cunt*'],
    severity: 5,
    note: 'Strong language, treated at the top of the scale everywhere.',
  },

  // --- hate ----------------------------------------------------------------
  // Seed only. A complete slur list is deliberately not vendored into this
  // repo. Operators extend this class from a maintained public list, and the
  // machinery does not change when they do. See docs/DECISIONS.md D9.
  {
    id: 'hate.directed',
    class: 'hate.directed',
    patterns: ['you people', 'go back to your'],
    severity: 4,
    note: 'Phrasing that targets a group. Reviewed for quotation and reporting.',
  },

  // --- violence ------------------------------------------------------------
  {
    id: 'viol.assault',
    class: 'violence.descriptive',
    patterns: ['assault*', 'attack*', 'beat* him', 'beat* her', 'strangl*'],
    severity: 3,
    note: 'Description of violence against a person.',
  },
  {
    id: 'viol.weapon',
    class: 'violence.descriptive',
    patterns: ['blunt object', 'stab*', 'shot him', 'shot her', 'gunshot*'],
    severity: 3,
    note: 'Description of a weapon used against a person.',
  },
  {
    id: 'viol.injury',
    class: 'violence.graphic',
    patterns: ['injur*', 'wound*', 'blood*', 'impact sites', 'defensive injuries'],
    // Sits above violence.descriptive on purpose. Saying something violent
    // happened is not the same as describing the injuries it left, and the
    // platforms that draw a line draw it here.
    severity: 4,
    note: 'Clinical or graphic description of injury.',
  },
  {
    id: 'viol.death',
    class: 'violence.descriptive',
    patterns: ['kill*', 'murder*', 'unlawful killing', 'homicide*'],
    severity: 3,
    note: 'Description of a death caused by another person.',
  },

  // --- sensitive events ----------------------------------------------------
  {
    id: 'sens.tragedy',
    class: 'controversial.tragedy',
    patterns: ['shooting', 'terrorist*', 'massacre*', 'bombing*'],
    severity: 3,
    note: 'Reference to a tragedy or a sensitive event.',
  },
  {
    id: 'sens.selfharm',
    class: 'selfharm',
    patterns: ['suicide*', 'kill* himself', 'kill* herself', 'kill* myself', 'self harm*'],
    severity: 4,
    note: 'Reference to self harm. Handled strictly on every platform.',
  },

  // --- adult ---------------------------------------------------------------
  {
    id: 'sex.explicit',
    class: 'sexual.explicit',
    patterns: ['porn*', 'sex scene*', 'nude*', 'nudity'],
    severity: 3,
    note: 'Sexual content reference.',
  },
  {
    id: 'sex.innuendo',
    class: 'sexual.suggestive',
    patterns: ['hook* up with', 'sleeping with'],
    severity: 2,
    note: 'Suggestive reference. Low severity unless sustained.',
  },

  // --- regulated goods -----------------------------------------------------
  {
    id: 'drug.recreational',
    class: 'drugs.recreational',
    patterns: ['cocaine', 'heroin', 'meth', 'weed', 'edibles', 'getting high'],
    severity: 3,
    note: 'Recreational drug reference. Education and recovery contexts differ.',
  },
  {
    id: 'drug.alcohol',
    class: 'drugs.alcohol',
    patterns: ['drunk', 'wasted', 'hammered'],
    severity: 1,
    note: 'Alcohol reference. Rarely material on its own.',
  },
]

/**
 * Index from the first word of each pattern to the entries that could start
 * there. Built once at module load. The matcher does one map lookup per token
 * instead of walking the whole lexicon, which keeps a two hour transcript
 * comfortably under a second.
 */
export const LEXICON_BY_FIRST: Map<string, LexiconEntry[]> = (() => {
  const map = new Map<string, LexiconEntry[]>()
  for (const entry of LEXICON) {
    for (const pattern of entry.patterns) {
      const first = pattern.split(' ')[0]
      if (!first) continue
      const key = first.endsWith('*') ? first.slice(0, -1) : first
      // Wildcards are keyed on their stem, so the matcher looks up progressively
      // shorter prefixes of a token. Keeping the stem here keeps that cheap.
      const bucket = map.get(key)
      if (bucket) {
        if (!bucket.includes(entry)) bucket.push(entry)
      } else {
        map.set(key, [entry])
      }
    }
  }
  return map
})()

/** Every class the lexicon can emit. Used to validate packs at build time. */
export const KNOWN_CLASSES: string[] = [...new Set(LEXICON.map((e) => e.class))].sort()
