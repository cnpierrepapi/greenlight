# Architecture

Greenlight takes a finished video and answers one question: which seconds of this
will cost the creator ad revenue, and what can be done about it. This document is
written to be read cold by someone who has never seen the repo. It names real files
and real functions so that every claim here can be checked against the code.

Status: phases 0, 1, 3 and 4 complete. Only the four document generators remain. Phase 4, transcription, was pulled forward ahead
of the documents and the full UI because it held every real unknown in the project
(DECISIONS.md D11). A video now goes in one end and platform verdicts come out the
other, verified in a browser: an 11 second clip decodes, transcribes on WebGPU with
per word timings, and clears in about twelve seconds. 51 tests pass. Sections marked **planned** describe modules
that are designed but not yet written, and they are marked so nobody trusts a box that
has no code behind it. Each phase updates this file at its close.

## The shape of the thing

```
greenlight/
  app/                      routes and UI. no rules logic lives here
  components/               planned, phase 3
  lib/engine/               pure TypeScript. no DOM, no network, no clock
    types.ts                the data contract for everything below
    ingest/                 subtitles.ts (srt + vtt), ytjson.ts, plaintext.ts, index.ts
    transcript/normalize.ts any source to one Transcript, and the only place
                            that decides a word's timing
    policy/lexicon.ts       the terms that start a finding
    policy/generated/       compiled packs. do not edit, run `npm run packs`
    detect/                 match.ts, context.ts, spans.ts
    score/verdict.ts        pack thresholds to verdicts
    docs/                   planned, phase 2: the four generators
    index.ts                the only surface the UI may import
  lib/media/                planned, phase 4. browser only: decode, whisper worker
  packs/                    youtube.yaml, tiktok.yaml, instagram.yaml
  scripts/build-packs.mjs   YAML to a typed module at build time
  tests/                    packs, ingest and end to end clearings
  fixtures/                 sample transcripts used by tests and by the demo
  brand/                    tokens.css and the logo files
  docs/                     this file and DECISIONS.md
```

### The one rule that shapes everything

`lib/engine` never touches the DOM, never makes a network call, and never reads the
clock. `ClearingResult.clearedAt` in `lib/engine/types.ts` is passed in by the caller
for exactly this reason.

Three things follow from that rule, and they are the reason it exists:

1. The engine runs under vitest in node with no browser and no mocks.
2. The same input produces the same output on every run, which is what makes a
   demo in front of a judge safe and what makes golden output tests possible.
3. It runs with no API key and no server, so the whole product works offline once
   the page is loaded.

The UI is allowed to read the types in `lib/engine/types.ts`. It is not allowed to
reimplement anything that produces them.

## The data contract

One structure flows through the system, and each stage only adds to it. It is
defined in `lib/engine/types.ts`, which is the first file to read.

| Type | Produced by | Meaning |
| --- | --- | --- |
| `RawSegment` | ingest modules, and the Whisper worker | a timed block of text, before any normalising |
| `Transcript` | `transcript/normalize.ts` | flat `Token[]` plus displayable `Cue[]`. every later stage joins on `Token.index` |
| `LexiconHit` | `detect/match.ts` | one lexicon entry matching one place in the token stream |
| `Modifier` | `detect/context.ts` | one contextual judgement, with a plain sentence saying what it saw |
| `Finding` | `detect/spans.ts` | a timecoded span, a quote from this video, a severity, and the full modifier trail |
| `PlatformVerdict` | `score/verdict.ts` | cleared, limited or strike risk, per category, per platform |
| `ClearingResult` | the pipeline | everything above, and the only input the document generators take |

Two fields carry more weight than their size suggests.

**`Token.timing`** records whether a timestamp was measured or inferred. Subtitle
files time a block of text, not a word, so a word's position inside that block is an
estimate. That fact travels all the way to the report rather than being quietly
rounded away, because a creator about to cut their own video deserves to know
whether 00:04.2 is a measurement or an estimate.

**`Finding.suppressed`** marks a match that context cleared. Suppressed findings are
kept, never deleted. They are what the report shows as considered and cleared, and
they are the raw material the appeal brief uses to argue that a passage was
non gratuitous. Throwing them away would have cost nothing at detection time and
lost the most valuable evidence in the system.

## Flow, end to end

Numbered so it can be followed in the code. Steps 1 and 2 are browser only, the
rest run anywhere.

1. **File in.** `decodeToPcm()` in `lib/media/decode.ts` reads the dropped file with
   the Web Audio API and returns 16kHz mono PCM. There is no ffmpeg and no server: the
   browser already holds a demuxer and every codec it supports, and using it is what
   keeps the promise that the file never leaves the machine. The cost is that support
   is Chrome's rather than ffmpeg's, so most of that module is spent naming what it
   cannot open. MKV, AVI, WMV and FLV are refused by name with the subtitle route
   offered, rather than failing later and blaming the file.
2. **Speech to text.** `lib/media/whisper.worker.ts` runs Whisper through
   transformers.js inside a Web Worker so the main thread keeps painting the progress
   bar. `transcribe()` in `lib/media/transcribe.ts` is the only module that knows the
   worker exists, and it owns two judgements: device choice, where WebGPU is tried and
   wasm is the fallback including when WebGPU fails at runtime, and whether the
   timings that came back are per word or per chunk. That second one is measured from
   the output by `looksWordLevel()` rather than assumed from the request, because
   transformers.js honours `return_timestamps: 'word'` for most models and quietly
   falls back for others. It decides whether the cut list is accurate to the word or
   to the line, and it is carried to the report instead of being papered over.
   *Subtitle route:* `lib/engine/ingest/` returns the same `RawSegment[]`, which is
   why a subtitle upload and a video upload reach identical code from here on.
3. **Normalize.** `normalize()` in `lib/engine/transcript/normalize.ts` turns segments
   into one `Transcript`. This is the only place that decides how a timed block
   becomes individually timed tokens, and the only place that sets `Token.timing`. A
   cue's duration is spread across its words by character position, and every token
   produced that way is marked `inferred`.
4. **Match.** `matchLexicon()` in `lib/engine/detect/match.ts` walks tokens against
   the lexicon and emits `LexiconHit[]`. `dropOverlaps()` at the bottom of that file
   keeps one hit where two entries cover the same words, so a single moment cannot be
   counted twice by a threshold that counts findings.
5. **Context.** `judge()` in `lib/engine/detect/context.ts` applies the judgements
   that make this more than a keyword search: game play, reporting and documentary
   framing, quotation, educational framing, negation, whether the word is directed at
   a person, position in the runtime, and timing quality. Each appends a `Modifier`
   saying what it saw and what it did. `capMitigation()` then makes sure framing
   lowers a finding once however many markers support it, which is DECISIONS.md D8
   and the single most load bearing line in the file.
6. **Spans.** `buildFindings()` in `lib/engine/detect/spans.ts` merges hits into
   `Finding[]`, attaches the quote from the creator's own words, and settles severity
   and confidence. `groupHits()` keeps one open group per class rather than one
   overall, because a narrator interleaves the act and the injuries in the same
   breath and four alternating hits are one passage, not four offences.
7. **Score.** `scoreAll()` in `lib/engine/score/verdict.ts` evaluates each pack's
   thresholds against the findings and returns `PlatformVerdict[]`. Conditions on a
   threshold are ANDed, thresholds are first match wins, and an opening window rule
   does not fire at all on a transcript with no timings rather than guessing. No
   policy judgement lives in this file.
8. **Documents.** The four generators in `lib/engine/docs/` (planned) each take the
   `ClearingResult` and nothing else. That constraint is what guarantees the output
   describes this video rather than a template with the numbers swapped.

## One clearing, worked through

`fixtures/true-crime-hollow-lane.srt`, cleared by `clearText()` in
`lib/engine/index.ts`. This is the walkthrough to read alongside the code.

1. `ingestText()` sees the `.srt` extension and hands the file to
   `parseSubtitles(text, 'srt')`, which returns 26 segments.
2. `normalize()` produces roughly 500 tokens, all `inferred`, because a subtitle cue
   times a line and not a word. `Transcript.exactTimings` is false.
3. `matchLexicon()` hits on `assault`, `blunt object`, `injuries`, `impact sites` and
   `defensive injuries` in the passage at 06:12, and on `unlawful killing` at 11:29.
4. `groupHits()` folds those into three findings: one `violence.graphic` span of four
   hits at 06:17, one `violence.descriptive` span of two at 06:19, and a single
   `violence.descriptive` at 11:32.
5. `judge()` finds reporting markers ("according to the coroner's report") and a
   quotation marker ("I am going to read this") in the surrounding cues. Both are
   recorded. `capMitigation()` lets the first one lower severity and zeroes the
   second, so the graphic passage settles at severity 3 rather than 2.
6. `scoreAll()` reads the three packs. Instagram's violence category fires at
   `min_severity: 3, min_findings: 1` and returns **limited**. YouTube needs three
   such findings and TikTok needs two, so both return **cleared**.

The same cut, three different answers, each one traceable to a line in a YAML file.
That is the product in one paragraph, and `tests/clearing.test.ts` pins every step of
it.

## Policy packs

A pack is one platform's published rules, authored as YAML in `packs/`, carrying its
version, the date the guidelines were read, the source URL, and the quoted citation
for every category. `scripts/build-packs.mjs` validates and compiles them into a
typed module at build time, so a malformed pack breaks the build rather than the
demo, and the browser gets a typed import instead of a runtime fetch.

`Threshold` in `lib/engine/types.ts` is deliberately small: a level, a minimum
finding count, a minimum severity, an optional opening window, and a human sentence.
If a platform rule cannot be expressed in those fields, the honest move is to add a
field and document it here, not to bury the logic in TypeScript where a reader
cannot see it.

## The bench

`components/bench.tsx` owns the whole client flow and is the only component that
calls into `lib/media` and `lib/engine`. Everything under it renders a
`ClearingResult` and nothing else. `components/clearing.tsx` holds the one piece of
state the panels share, which finding is selected, because the point of the layout is
that the four views agree: click a band on the strip and the transcript scrolls to it,
the finding card opens, and the video seeks to the second it happened. Four panels
each holding their own idea of the selection is how that stops being true.

| Component | Job |
| --- | --- |
| `components/timeline.tsx` | full bleed risk strip. bands sorted so the worst level paints last, because findings overlap in time and the last band drawn is the one a creator sees |
| `components/verdicts.tsx` | one card per platform, cleared categories collapsed to a count so the two that matter are not buried under eighteen green rows |
| `components/transcript-rail.tsx` | the transcript, scrolled to the selection. finds its anchor by query rather than by ref, and lets CSS animate the scroll |
| `components/findings.tsx` | findings grouped into passages by `groupIntoPassages()` in `lib/ui/format.ts` |

`lib/ui/format.ts` holds the presentation rules that are logic rather than styling.
`levelForFinding()` is the join that keeps the strip honest: a band is coloured by the
verdict it actually drove, read back from the platform verdicts, so the strip can
never disagree with the cards above it. `tests/ui.test.ts` pins that.

## What is deliberately absent

There is no language model in the critical path. See DECISIONS.md D2 for the
reasoning and the cost.

There is no database and no user accounts. A clearing lives in the browser tab that
produced it. See D5.
