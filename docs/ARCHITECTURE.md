# Architecture

Greenlight takes a finished video and answers one question: which seconds of this
will cost the creator ad revenue, and what can be done about it. This document is
written to be read cold by someone who has never seen the repo. It names real files
and real functions so that every claim here can be checked against the code.

Status: phase 0 complete. Sections marked **planned** describe modules that are
designed but not yet written, and they are marked so nobody trusts a box that has no
code behind it. Each phase updates this file at its close.

## The shape of the thing

```
greenlight/
  app/                      routes and UI. no rules logic lives here
  components/               planned, phase 3
  lib/engine/               pure TypeScript. no DOM, no network, no clock
    types.ts                the data contract for everything below
    ingest/                 planned, phase 1: srt, vtt, ytjson, plaintext
    transcript/             planned, phase 1: normalize any source to one shape
    policy/                 planned, phase 1: pack loader and validation
    detect/                 planned, phase 1: match, context, spans
    score/                  planned, phase 1: thresholds to verdicts
    docs/                   planned, phase 2: the four generators
    index.ts                planned: the only surface the UI may import
  lib/media/                planned, phase 4. browser only: decode, whisper worker
  packs/                    planned, phase 1. YAML policy packs, authored by hand
  scripts/build-packs.mjs   planned, phase 1. YAML to a typed module at build time
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

1. **File in.** `lib/media/decode.ts` (planned) reads the dropped file through the
   Web Audio API and returns 16kHz mono PCM. Containers that Chrome cannot decode
   are named at this point and the SRT route is offered, rather than failing later
   and blaming the file.
2. **Speech to text.** `lib/media/whisper.worker.ts` (planned) runs Whisper through
   transformers.js inside a Web Worker so the main thread keeps painting. Returns
   `RawSegment[]`. Nothing is uploaded.
   *Subtitle route:* `lib/engine/ingest/srt.ts` and friends (planned) return the
   same `RawSegment[]`, which is why an SRT upload and a video upload produce
   reports of the same quality.
3. **Normalize.** `lib/engine/transcript/normalize.ts` (planned) turns segments into
   one `Transcript`. This is the only place that decides how a timed block becomes
   individually timed tokens, and the only place that sets `Token.timing`.
4. **Match.** `lib/engine/detect/match.ts` (planned) walks tokens against the
   lexicon and emits `LexiconHit[]`.
5. **Context.** `lib/engine/detect/context.ts` (planned) applies the judgements that
   make this more than a keyword search: negation, quoted or reported speech, news
   and educational framing, clinical versus directed use, density inside a window,
   repetition, and position in the runtime. Each judgement appends a `Modifier` that
   says what it saw and what it did.
6. **Spans.** `lib/engine/detect/spans.ts` (planned) merges neighbouring hits into
   `Finding[]`, attaches the quote from the creator's own words, and settles
   severity and confidence.
7. **Score.** `lib/engine/score/verdict.ts` (planned) evaluates each pack's
   thresholds against the findings and returns `PlatformVerdict[]`. Thresholds live
   in the pack YAML, not in this file, so tuning a platform never means editing
   TypeScript.
8. **Documents.** The four generators in `lib/engine/docs/` (planned) each take the
   `ClearingResult` and nothing else. That constraint is what guarantees the output
   describes this video rather than a template with the numbers swapped.

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

## What is deliberately absent

There is no language model in the critical path. See DECISIONS.md D2 for the
reasoning and the cost.

There is no database and no user accounts. A clearing lives in the browser tab that
produced it. See D5.
