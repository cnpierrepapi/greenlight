/**
 * Context judgement. This is the module that makes Greenlight more than a
 * keyword search, and the one to read first when a finding looks wrong.
 *
 * Contract: `buildContextIndex(transcript)` scans the transcript once and marks
 * which cues carry which framing. `judge(hit, transcript, index)` then returns
 * the `Modifier[]` for one hit, in the order they were applied. Callers:
 * `detect/spans.ts`, and tests.
 *
 * Every modifier records what it saw in a sentence written for a creator. That
 * trail is not logging. It is the evidence the appeal brief argues from, so a
 * modifier with a vague note is a bug even when its arithmetic is right.
 *
 * The framing markers below are deliberately plain words rather than a model.
 * They are checked against the surrounding cues, not just the cue containing
 * the hit, because framing usually arrives a sentence or two before the thing
 * it frames: a narrator says "according to the coroner's report" and then reads
 * the passage.
 */

import type { LexiconHit, Modifier, Transcript } from '../types'

/** How many cues either side of a hit are searched for framing. */
const FRAMING_WINDOW = 2

/** How many tokens before a hit are searched for a negation. */
const NEGATION_WINDOW = 3

const MARKERS = {
  /** Reporting on something that happened, rather than endorsing it. */
  news: [
    'according to',
    'reported',
    'reporting',
    'the report',
    'coroner',
    'inquest',
    'transcript',
    'court',
    'jury',
    'the record',
    'sources',
    'investigation',
    'police said',
    'documentary',
    'archive',
  ],
  /** Teaching or warning about the thing. */
  educational: [
    'this is why',
    'what to do',
    'how to avoid',
    'i am not going to speculate',
    'sources are in the description',
    'context',
    'the point of this',
    'lesson',
    'safety',
  ],
  /** Repeating someone else's words. */
  quotation: [
    'quote',
    'he said',
    'she said',
    'they said',
    'i am going to read',
    'reading this',
    'the statement',
    'wrote',
  ],
  /** Standard video game play, where violent verbs describe mechanics. */
  gameplay: [
    'patch',
    'ranked',
    'respawn',
    'loadout',
    'lobby',
    'map',
    'shotgun',
    'weapon',
    'gameplay',
    'players',
    'the clip',
    'hit box',
    'damage',
    'win rate',
    'nerf',
    'playlist',
  ],
} as const

export type FramingKind = keyof typeof MARKERS

export interface ContextIndex {
  /** Per cue, which framings that cue's text carries. */
  cueFraming: Set<FramingKind>[]
  /** Cached so position rules do not recompute it per hit. */
  openingSec: number
}

/** Classes where reporting or teaching genuinely changes the assessment. */
const FRAMING_SENSITIVE = new Set([
  'violence.descriptive',
  'violence.graphic',
  'controversial.tragedy',
  'selfharm',
  'drugs.recreational',
  'sexual.explicit',
  'hate.directed',
])

/** Classes that game context explains away entirely. */
const GAMEPLAY_EXPLAINS = new Set(['violence.descriptive', 'violence.graphic'])

export function buildContextIndex(transcript: Transcript, openingSec = 30): ContextIndex {
  const cueFraming = transcript.cues.map((cue) => {
    const haystack = cue.text.toLowerCase()
    const found = new Set<FramingKind>()
    for (const kind of Object.keys(MARKERS) as FramingKind[]) {
      if (MARKERS[kind].some((marker) => haystack.includes(marker))) found.add(kind)
    }
    return found
  })

  return { cueFraming, openingSec }
}

export function judge(hit: LexiconHit, transcript: Transcript, index: ContextIndex): Modifier[] {
  const modifiers: Modifier[] = []
  const token = transcript.tokens[hit.tokenStart]
  if (!token) return modifiers

  const cueIndex = token.cueIndex
  const framing = framingAround(index, cueIndex)

  // --- 1. gameplay -------------------------------------------------------
  // Checked first because when it applies nothing else about the hit matters.
  if (framing.has('gameplay') && GAMEPLAY_EXPLAINS.has(hit.class)) {
    modifiers.push({
      id: 'context.gameplay',
      effect: 'suppress',
      deltaSeverity: 0,
      deltaConfidence: 0,
      note: 'This describes what happened in a game, not violence against a person. Platforms treat standard game play separately.',
    })
    return modifiers
  }

  // --- 2. reporting and documentary framing ------------------------------
  if (framing.has('news') && FRAMING_SENSITIVE.has(hit.class)) {
    modifiers.push({
      id: 'context.news',
      effect: 'lower',
      deltaSeverity: -1,
      deltaConfidence: -0.05,
      note: 'The surrounding lines attribute this to a report or an official record, which is the documentary treatment platforms assess differently from a gratuitous one.',
    })
  }

  // --- 3. quotation ------------------------------------------------------
  if (framing.has('quotation') && FRAMING_SENSITIVE.has(hit.class)) {
    modifiers.push({
      id: 'context.quotation',
      effect: 'lower',
      deltaSeverity: -1,
      deltaConfidence: -0.05,
      note: 'This is presented as somebody else being quoted rather than the creator speaking.',
    })
  }

  // --- 4. educational framing --------------------------------------------
  if (framing.has('educational') && FRAMING_SENSITIVE.has(hit.class)) {
    modifiers.push({
      id: 'context.educational',
      effect: 'lower',
      deltaSeverity: -1,
      deltaConfidence: -0.05,
      note: 'The surrounding lines frame this as explanation rather than depiction.',
    })
  }

  // --- 5. negation -------------------------------------------------------
  if (FRAMING_SENSITIVE.has(hit.class) && hasNegationBefore(transcript, hit.tokenStart)) {
    modifiers.push({
      id: 'context.negation',
      effect: 'lower',
      deltaSeverity: -1,
      deltaConfidence: -0.1,
      note: 'The words just before this negate it, so the thing described may not have happened.',
    })
  }

  // --- 6. directed at a person -------------------------------------------
  if (hit.class.startsWith('profanity') && isDirected(transcript, hit.tokenEnd)) {
    modifiers.push({
      id: 'context.directed',
      effect: 'raise',
      deltaSeverity: 1,
      deltaConfidence: 0,
      note: 'This is aimed at a person rather than used as an exclamation, which every platform treats more harshly.',
    })
  }

  // --- 7. position -------------------------------------------------------
  // No severity change. The opening window is a pack threshold, and changing
  // severity here as well would count the same fact twice. The modifier exists
  // so the report can explain why an ordinary word mattered.
  if (token.startSec !== null && token.timing !== 'none' && token.startSec <= index.openingSec) {
    modifiers.push({
      id: 'position.opening',
      effect: 'raise',
      deltaSeverity: 0,
      deltaConfidence: 0,
      // "content" rather than "language". The opening window rule exists on
      // the language category today, but this modifier is attached to every
      // class, so a violence finding at 00:02 was being explained with a
      // sentence about language. Caught by running a real clip through the
      // live site.
      note: `This falls inside the opening ${index.openingSec} seconds, where platforms judge content more harshly than they do later in a video.`,
    })
  }

  // --- 8. cap the mitigation ---------------------------------------------
  capMitigation(modifiers)

  // --- 9. timing quality --------------------------------------------------
  if (token.timing === 'inferred') {
    modifiers.push({
      id: 'timing.inferred',
      effect: 'lower',
      deltaSeverity: 0,
      deltaConfidence: -0.12,
      note: 'The source timed this line but not this word, so the timecode is an estimate within the line.',
    })
  } else if (token.timing === 'none') {
    modifiers.push({
      id: 'timing.none',
      effect: 'lower',
      deltaSeverity: 0,
      deltaConfidence: -0.3,
      note: 'This transcript has no timings, so the moment cannot be located in the video.',
    })
  }

  return modifiers
}

/**
 * Framing lowers a finding once, however many markers support it.
 *
 * Found by testing the true crime fixture. A narrator who says "according to
 * the coroner's report" and then "I am going to read this plainly" trips the
 * reporting rule and the quotation rule for the same passage. Stacking them
 * took a graphic description of injuries from severity 4 to severity 2 and
 * cleared it on every platform, which is exactly the video a creator most needs
 * warning about.
 *
 * Two markers are two pieces of evidence for one fact, not two facts. So every
 * mitigation after the first keeps its note, because the appeal brief wants all
 * of that evidence, and loses its arithmetic.
 */
function capMitigation(modifiers: Modifier[]): void {
  let spent = false
  for (const modifier of modifiers) {
    if (modifier.deltaSeverity >= 0) continue
    if (spent) {
      modifier.deltaSeverity = 0
      continue
    }
    spent = true
  }
}

function framingAround(index: ContextIndex, cueIndex: number): Set<FramingKind> {
  const combined = new Set<FramingKind>()
  const from = Math.max(0, cueIndex - FRAMING_WINDOW)
  const to = Math.min(index.cueFraming.length - 1, cueIndex + FRAMING_WINDOW)
  for (let i = from; i <= to; i++) {
    for (const kind of index.cueFraming[i] ?? []) combined.add(kind)
  }
  return combined
}

const NEGATIONS = new Set(['not', 'never', 'no', 'without', 'denied', 'didnt', "didn't", 'wasnt', "wasn't"])

function hasNegationBefore(transcript: Transcript, tokenIndex: number): boolean {
  const from = Math.max(0, tokenIndex - NEGATION_WINDOW)
  for (let i = from; i < tokenIndex; i++) {
    const token = transcript.tokens[i]
    if (token && NEGATIONS.has(token.norm)) return true
  }
  return false
}

/** Second person or a name immediately after the word is the usual shape. */
const DIRECTED_AT = new Set(['you', 'your', 'youre', "you're", 'him', 'her', 'them', 'they'])

function isDirected(transcript: Transcript, tokenIndex: number): boolean {
  const next = transcript.tokens[tokenIndex + 1]
  const previous = transcript.tokens[tokenIndex - 1]
  return Boolean(
    (next && DIRECTED_AT.has(next.norm)) || (previous && previous.norm === 'you')
  )
}
