/**
 * The data contract for the whole engine.
 *
 * Contract: every stage of a clearing reads the shape produced by the stage
 * before it and adds to it. Nothing in this file imports anything, so the
 * contract stays readable on its own and cannot drift toward a particular
 * runtime.
 *
 * The flow, in order, with the module that owns each step:
 *
 *   media file ──▶ lib/media/decode.ts            ──▶ Float32Array (16kHz mono)
 *              ──▶ lib/media/whisper.worker.ts    ──▶ RawSegment[]
 *   subtitle   ──▶ lib/engine/ingest/*.ts         ──▶ RawSegment[]
 *              ──▶ lib/engine/transcript/normalize.ts ──▶ Transcript
 *              ──▶ lib/engine/detect/match.ts     ──▶ LexiconHit[]
 *              ──▶ lib/engine/detect/context.ts   ──▶ Modifier[] per hit
 *              ──▶ lib/engine/detect/spans.ts     ──▶ Finding[]
 *              ──▶ lib/engine/score/verdict.ts    ──▶ PlatformVerdict[]
 *              ──▶ lib/engine/docs/*.ts           ──▶ the four documents
 *
 * Callers: everything under lib/engine, plus the UI in app/ and components/,
 * which is allowed to read these types but never to reimplement the logic that
 * produces them.
 */

// ---------------------------------------------------------------------------
// Transcript
// ---------------------------------------------------------------------------

/**
 * Where a timing came from. This travels all the way to the report, because a
 * creator deserves to know whether 00:04.2 is a measurement or an estimate.
 *
 * - measured: the source gave a real start and end for this token.
 * - inferred: the source timed a larger block and we split it across the tokens
 *   inside that block by character position.
 * - none: no timings at all, e.g. pasted plain text. Findings still work, they
 *   just cannot point at a moment, and the cut list is unavailable.
 */
export type TimingQuality = 'measured' | 'inferred' | 'none'

/** Where the words came from. Shown in the report so results are reproducible. */
export type TranscriptSource = 'whisper' | 'srt' | 'vtt' | 'ytjson' | 'plaintext'

/**
 * What an ingest module hands to normalize(). Deliberately loose: subtitle
 * files and Whisper both produce timed blocks of text, and neither reliably
 * produces per-word timings, so the normalizer is the single place that decides
 * how a block becomes tokens.
 */
export interface RawSegment {
  text: string
  /** Seconds from the start of the media. Null when the source has no timings. */
  startSec: number | null
  endSec: number | null
  /** Per-word timings when the source has them. Whisper sometimes does. */
  words?: RawWord[]
}

export interface RawWord {
  text: string
  startSec: number
  endSec: number
}

/**
 * One word. `index` is its position in Transcript.tokens and is the join key
 * used by every later stage, so tokens are never reordered or filtered after
 * normalize() returns.
 */
export interface Token {
  index: number
  /** The word as spoken, punctuation stripped, original casing kept for quoting. */
  text: string
  /** Lowercased, de-accented, de-obfuscated. What the matcher actually reads. */
  norm: string
  startSec: number
  endSec: number
  timing: TimingQuality
  /** Index into Transcript.cues, so a token can be shown in its original line. */
  cueIndex: number
}

/** A displayable line, preserved so the UI can show the transcript as written. */
export interface Cue {
  index: number
  text: string
  startSec: number | null
  endSec: number | null
  tokenStart: number
  tokenEnd: number
}

export interface Transcript {
  tokens: Token[]
  cues: Cue[]
  source: TranscriptSource
  /** Runtime in seconds. Null when the source cannot tell us. */
  durationSec: number | null
  /** BCP 47 where known. The packs are English only, so this gates the run. */
  language: string | null
  /** True when every token timing is measured rather than inferred. */
  exactTimings: boolean
}

// ---------------------------------------------------------------------------
// Policy packs
// ---------------------------------------------------------------------------

/**
 * A pack is authored as YAML in packs/ and compiled to a typed module by
 * scripts/build-packs.mjs. Rules are data so that correcting a platform's
 * guideline is a one line diff a non programmer can read and check.
 */
export interface Pack {
  id: string
  label: string
  /** Bumped whenever the rules change. Printed on every document. */
  version: string
  /** ISO date the guidelines were read. Printed on every document. */
  retrieved: string
  sourceUrl: string
  /** Long form name of the guideline document, quoted in the appeal brief. */
  sourceTitle: string
  categories: PackCategory[]
}

export interface PackCategory {
  id: string
  label: string
  /** Lexicon classes that feed this category, e.g. 'profanity.strong'. */
  classes: string[]
  /** The published rule this category rests on. */
  citation: string
  /**
   * True only when `citation` is the platform's own wording, copied. False when
   * it is our faithful summary of the published rule.
   *
   * This flag is not decoration. The appeal brief quotes a citation inside a
   * formal document, and quoting a summary as if it were the platform's words
   * would be the one mistake that discredits the whole output. When false, the
   * generators introduce it as a summary and point at `sourceUrl` instead.
   */
  citationVerbatim: boolean
  /**
   * Where the line sits. Evaluated in order, first match wins, so a pack author
   * reads these top to bottom like the policy itself.
   */
  thresholds: Threshold[]
}

/**
 * A threshold is deliberately small and declarative. If a platform rule cannot
 * be expressed with these fields, the honest move is to add a field here and
 * document it, not to bury the logic in TypeScript.
 */
export interface Threshold {
  level: VerdictLevel
  /** Fires when at least this many findings in the category survive context. */
  minFindings?: number
  /** Fires when any finding reaches this severity. */
  minSeverity?: Severity
  /** Fires only for findings inside the opening N seconds. */
  withinOpeningSec?: number
  /** Human sentence explaining the rule, shown next to the verdict. */
  reason: string
}

// ---------------------------------------------------------------------------
// Findings
// ---------------------------------------------------------------------------

/** 1 trivial, 5 removal territory. Set by the lexicon, moved by modifiers. */
export type Severity = 1 | 2 | 3 | 4 | 5

/** One lexicon entry matching one place in the token stream. */
export interface LexiconHit {
  termId: string
  /** Dotted class, e.g. 'profanity.strong', 'violence.descriptive'. */
  class: string
  tokenStart: number
  tokenEnd: number
  /** Exactly what was matched, for quoting. */
  matched: string
  baseSeverity: Severity
}

/**
 * The record of one contextual judgement. This is the reason the appeal brief
 * can make an argument instead of a complaint: every adjustment says what it
 * saw and what it did about it.
 */
export interface Modifier {
  id: string
  effect: 'raise' | 'lower' | 'suppress'
  deltaSeverity: number
  deltaConfidence: number
  /** Plain sentence, written for the creator, not for a log file. */
  note: string
}

export interface Finding {
  id: string
  class: string
  categoryHint: string
  startSec: number | null
  endSec: number | null
  tokenStart: number
  tokenEnd: number
  /** The creator's own words around the hit. Used verbatim as an exhibit. */
  quote: string
  severity: Severity
  /** 0 to 1. Drops when timings are inferred or context is ambiguous. */
  confidence: number
  hits: LexiconHit[]
  /** The full rationale trail, in the order the modifiers were applied. */
  modifiers: Modifier[]
  /**
   * True when context cleared it. Suppressed findings are kept, never deleted:
   * they are what the report shows as considered and cleared, and what the
   * appeal brief cites when arguing that the treatment was non gratuitous.
   */
  suppressed: boolean
}

// ---------------------------------------------------------------------------
// Verdicts
// ---------------------------------------------------------------------------

export type VerdictLevel = 'cleared' | 'limited' | 'strike'

export interface CategoryVerdict {
  categoryId: string
  label: string
  level: VerdictLevel
  /** Findings that drove this, by Finding.id. */
  findingIds: string[]
  /** The threshold sentence that fired. */
  reason: string
  citation: string
}

export interface PlatformVerdict {
  packId: string
  packLabel: string
  packVersion: string
  /** The worst category level. What the creator reads first. */
  level: VerdictLevel
  categories: CategoryVerdict[]
}

/**
 * Everything one clearing produced. The four document generators each take this
 * and nothing else, which is what guarantees the documents describe this video
 * rather than a template with the numbers changed.
 */
export interface ClearingResult {
  transcript: Transcript
  findings: Finding[]
  /** Suppressed findings, split out for readability. Same objects. */
  considered: Finding[]
  platforms: PlatformVerdict[]
  /** Passed in by the caller. The engine never reads the clock itself. */
  clearedAt: string
  engineVersion: string
}
