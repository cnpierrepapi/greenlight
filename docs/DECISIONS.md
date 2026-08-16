# Decisions

Numbered, with the context, the choice, why, and what it cost. Appended to as the
build goes, never rewritten after the fact.

---

## D1. One Next app at the repo root, not a monorepo

**Context.** The engine is pure TypeScript and the UI is React. The textbook answer
is a workspace with `packages/engine` and `apps/web`.

**Choice.** A single Next application at the repo root. The engine lives at
`lib/engine/` and its boundary is enforced by folder structure and a single barrel
export, not by a package manifest.

**Why.** Vercel deploys a root application with zero configuration. A workspace
setup would have cost an hour of build config to buy an import boundary that a
folder and a barrel already give. The properties that actually matter, that the
engine is DOM free, network free and unit testable in node, come from discipline
about what the engine imports, not from a package boundary.

**Cost.** Nothing stops a careless import of a React module into `lib/engine`. That
is a review problem rather than a build error. If the engine is ever published on
its own, this has to be revisited.

---

## D2. No language model in the critical path

**Context.** The obvious 2026 build is to hand the transcript to a model and ask it
what is risky.

**Choice.** Deterministic detection: a lexicon, declarative rules in YAML, and
context modifiers written as code with a stated rationale for each judgement.

**Why.** Three reasons, in the order they matter.

1. Every finding must be traceable to a published policy line, because that trace is
   the entire basis of the appeal brief. A model that says a passage feels risky
   gives a creator nothing to file.
2. Same input, same output, every run. That is what makes a live demo safe and what
   makes golden output tests meaningful.
3. No API key and no server, so anyone can run the whole product offline. That was a
   hard requirement.

**Cost.** No detection of implied meaning, and it will not catch sarcasm or a
euphemism that is not in the lexicon. Greenlight will miss things a model would
catch. The trade accepted here is being right about what it claims over guessing
broadly and being unable to show its work.

---

## D3. Transcription runs in the browser, not on a server

**Context.** Whisper needs to run somewhere. A server endpoint would be simpler to
write and faster on a weak laptop.

**Choice.** transformers.js in a Web Worker, on the creator's machine. WebGPU when
available, wasm when not.

**Why.** No API key means anyone can demo it, which was the requirement that shaped
the whole product. It also makes the privacy claim real rather than a policy
promise: the video file never leaves the machine, so there is no upload, no storage,
and no retention question to answer. And it keeps hosting cost at zero, which
matters for something that has to stay up after the event without a bill attached.

**Cost.** A model download on first use, and transcription speed depends on the
visitor's hardware. Mitigated by shipping the sample cuts with precomputed
transcripts, so the full product can be seen without downloading anything. That
mitigation is also demo insurance: if the model CDN is slow or blocked on the
judge's network, nothing about the demonstration breaks.

---

## D4. Policy packs are YAML data, compiled at build time

**Context.** Platform rules change, and they need correcting by whoever notices,
which will not always be a programmer.

**Choice.** Hand authored YAML in `packs/`, validated and compiled to a typed module
by `scripts/build-packs.mjs`, run from `prebuild` and `dev`.

**Why.** Correcting a rule stays a one line diff that a non programmer can read and
check against the platform's own page. Validation at build time means a malformed
pack fails the build, not the demo. Compiling to a module rather than fetching YAML
at runtime keeps the browser path simple and typed, with no loader and no fetch.

**Cost.** A build step that has to be remembered. It is wired into `dev` and
`prebuild` so that forgetting it is not possible in the normal flow.

---

## D5. No database, no accounts

**Context.** Reports could be saved, shared, and compared over time.

**Choice.** A clearing lives in the browser tab that produced it, and leaves as a
downloaded pack.

**Why.** Accounts are the single biggest thing standing between a stranger and
seeing the product work, and the brief was that anyone can demo it. Storing creators'
transcripts also creates a retention question that the browser only design avoids
entirely.

**Cost.** No history, no cross device access, and a shareable report link needs
something else later. Acceptable for now, and it is an additive change rather than a
rewrite.

---

## D6. Suppressed findings are kept, not discarded

**Context.** When context clears a match, the tidy instinct is to drop it.

**Choice.** It stays, flagged with `Finding.suppressed`, with the modifier trail that
cleared it.

**Why.** It is the evidence that the video was reviewed and the passage was
considered. The report shows it as considered and cleared, which is what makes the
tool feel like a review rather than a filter, and the appeal brief cites it when
arguing that a treatment was non gratuitous. It costs almost nothing to keep and
cannot be reconstructed later.

**Cost.** A slightly larger result object and one more state the UI has to render
without cluttering the main findings list.

---

## D7. Signal colour is reserved for verdicts

**Context.** Green, amber and red are the natural brand palette for a product about
approval.

**Choice.** They appear only on verdicts, stamps and timeline bands. Page chrome is
ink and paper. The accent green is used for the mark and links, nothing else.

**Why.** The report has to be readable at a glance, and that only works if a
saturated colour on screen always means one thing. A green button would quietly cost
the product its most important affordance.

**Cost.** The interface is more restrained than a typical creator tool. That suits a
document, which is what the output is.

---

## D8. Framing lowers a finding once, however many markers support it

**Context.** Found by testing, not by design. The true crime fixture has a narrator
who says "according to the coroner's report" and then "I am going to read this
plainly" before a description of injuries. That trips the reporting rule and the
quotation rule on the same passage.

**Choice.** `capMitigation()` in `lib/engine/detect/context.ts` applies the first
severity reduction and zeroes the arithmetic on every later one. The notes all
survive.

**Why.** Stacked, the two mitigations took a graphic description of injuries from
severity 4 to severity 2 and cleared it on all three platforms. That is precisely the
video a creator most needs warning about, and the tool would have told them it was
safe. Two markers are two pieces of evidence for one fact, not two facts.

**Cost.** A passage with genuinely layered justification gets no extra credit for the
second layer. The notes are all still on the finding, so the appeal brief can argue
from every one of them even though only one moved the number.

**Where this shows now:** the true crime fixture reads limited on Instagram and
cleared on YouTube and TikTok, because Instagram's published rule says graphic detail
stays ineligible in a news context and the other two allow documentary treatment.
`tests/clearing.test.ts` pins that difference.

---

## D9. The slur list is deliberately not vendored

**Context.** A hate speech category needs terms, and a complete list of slurs is a
known, published thing that could simply be pasted into `lib/engine/policy/lexicon.ts`.

**Choice.** The `hate.directed` class ships with a seed of phrasing patterns rather
than a slur list. The matching machinery is complete and does not change when the list
grows.

**Why.** Vendoring a slur list into a public repository puts it in every clone, every
search index and every diff, for a build where the detection machinery is the
interesting part and the list is not. An operator who needs full coverage extends the
class from a maintained public list at deploy time.

**Cost.** Out of the box, the hate category catches directed phrasing and not
individual slurs, and that limit is stated rather than hidden. Any real deployment has
to close it.

---

## D10. Transcript time units are decided per file, never per cue

**Context.** Transcript libraries emit `start` in fractional seconds and `offset` in
whole milliseconds, and `offset: 4000` is genuinely ambiguous: four seconds in one
library, four thousand seconds in a sixty six minute video in another.

**Choice.** `unitDivisor()` in `lib/engine/ingest/ytjson.ts` decides once for the whole
file, using the field name plus whether every value is a whole number.

**Why.** No value based rule settles the ambiguity, so the rule chosen matters less
than where it is applied. A per cue guess would put the early cues of a long video on
one scale and the later ones on another, and a creator would only find out after
cutting the wrong second.

**Cost.** A file that mixes both conventions is read on one scale. That file is
malformed, and reading it consistently is better than reading it creatively.

---

## D11. Transcription was pulled forward ahead of the documents and the UI

**Context.** The plan had transcription as the last build phase. It is the core path
and it holds every real unknown in the project: word level timestamps, container
decode, model weight, WebGPU availability. Everything scheduled ahead of it was work
whose outcome was already known.

**Choice.** Built it fourth in the plan and first in practice, before the document
generators and before the full bench.

**Why.** Risk order, not dependency order. If word timestamps had not worked, the
honest fallback changes what the cut list can promise, and that is a thing to discover
with two days left rather than two hours. It went the other way: `Xenova/whisper-tiny.en`
returns per word timings, WebGPU is picked up when present, and a clip transcribes and
clears in about twelve seconds on this machine.

**Cost.** The bench UI was built twice, once thin to prove the path and again properly
in phase 3. That was the cheaper mistake to risk.

---

## D12. The onnxruntime-node and sharp advisories are accepted, not fixed

**Context.** `npm audit` reports four high severity advisories, all reached through
`@huggingface/transformers`: `adm-zip` via `onnxruntime-node`, and `libvips` via
`sharp`. Neither has a fix available upstream.

**Choice.** Kept, and recorded here rather than silenced.

**Why.** Both are node side backends of transformers.js. Greenlight only ever loads the
library inside a browser Web Worker, where the wasm and WebGPU backends are used and
neither package is bundled or executed. `sharp` is for server side image decoding,
which this product does not do at all. Neither advisory is reachable from anything
Greenlight ships.

**Cost.** `npm audit` is not clean, so anybody running it has to know why. That is what
this entry is for. If transformers.js is ever imported from server code, this decision
is void and has to be revisited.

---

## D13. Three bench bugs the tests could not have caught

**Context.** The engine has 62 tests and all of them passed while the interface was
telling a creator the wrong thing. Recording this because the lesson is about where to
look, not about the three fixes.

**What the browser found.**

1. **Bands overlapping on the strip.** Findings overlap in time, so their bands overlap
   too, and the last one drawn wins. In transcript order that was whichever came
   second, so a grey cleared band painted over the amber one underneath it and hid the
   only finding on the strip that had changed a verdict. `PAINT_ORDER` in
   `components/timeline.tsx` now draws the worst level last.
2. **Passages grouped on quote text grouped nothing.** The first version of
   `groupIntoPassages()` compared quote strings. Two findings over the same sentence
   rarely quote the same thing, because one span reaches across four cues and the other
   across one. Grouping is by overlapping token range now, and the widest quote is
   shown since it contains the others.
3. **`scrollTo({ behavior: 'smooth' })` silently did nothing.** Clicking a band left
   the transcript exactly where it was. An instant scroll to the same offset worked, so
   the arithmetic was right and the animation was swallowing the call. The animation is
   CSS on `.rail-scroll` now, so the rail lands even where a browser declines to
   animate.

**Why it matters.** All three are failures of presentation over a correct result, and
the whole product is a presentation of a correct result. A unit test cannot see a band
painted over another band. Driving the real interface in a real browser is not a final
check on this build, it is the only way to test the half of it that a creator actually
looks at.

**Cost.** Browser verification is slower than a test run and cannot be left to CI as it
stands. Worth it.

---

## D16. The transcription estimate is a projection and says so

**Context.** A transcription with no time estimate is the worst part of using this.
Whisper runs at roughly one times realtime on an ordinary laptop, so a thirteen minute
video is thirteen minutes of a bar that does not move.

**Choice.** `lib/media/transcribe.ts` projects the total from how fast this machine went
last time, stored in `localStorage`. The interface counts down from it and says "about".
When the projection runs out and the work is still going, it stops counting and says it
is running long, with elapsed time instead.

**Why.** transformers.js builds every 30 second window up front and loops through them
inside a single call, exposing no per window hook. A first version passed a
`chunk_callback` that does not exist in that version, so it never fired and the
countdown ran against nothing: it reached zero and sat there saying "any second now"
while five minutes of audio was still being transcribed. Nothing here can honestly claim
to know how far through it is, so it does not claim to.

**Cost.** The first run on a machine is a guess, and says so. Runs under 45 seconds do
not update the stored speed, because a short clip is mostly fixed startup cost and
timing one made this laptop look several times slower than it is.

**Measured:** a five minute clip projected 4m48s and took 5m05s.

---

## D17. What the landing page cost, in bugs

**Context.** Recorded for the same reason as D13. Everything here was found by opening
the page, and none of it would have shown up in a test.

1. **A 60fps render loop aborted the media load.** The clip cards read the video clock in
   `requestAnimationFrame` and re-rendered on every frame. Four of those on one page left
   every video at `readyState 0` with no error to explain it. It polls eight times a
   second now, which is more than the bubbles need.
2. **Pausing on `!isIntersecting` froze every clip.** One transient callback during mount
   paused them, and no further callback ever came to undo it. It pauses on
   `intersectionRatio === 0` instead.
3. **`.strip` collided across two global stylesheets.** app.css owns `.strip` for the
   timeline with `height: 34px`. The landing declared its own for the clip section, so
   the section collapsed to 181px and the cards spilled through the section below.
   Landing CSS is scoped under `.landing` and the section is `.lp-clips`.
4. **The `poster` attribute was not enough.** Browsers drop the poster once the video
   buffers and show frame one, and frame one of a waveform is silence, which is black.
   A loud frame is painted behind the video instead.

**The pattern worth keeping:** every one of these presented as "nothing is happening"
with no error anywhere. On this build, silence is the failure mode to go looking for.

---

## D14. The appeal brief refuses to argue a losing point

**Context.** The obvious appeal generator takes a decision and produces the strongest
possible argument against it. That is what a creator asks for and it is the wrong
product.

**Choice.** `assessAgreement()` in `lib/engine/docs/appeal.ts` compares the platform's
decision against our own verdict for the category the platform named. When this
video's own findings support the decision, no grounds are asserted: Part III says so in
terms and Part V asks for written identification of the timecodes relied upon so a
conforming edit can be prepared and resubmitted.

**Why.** Reviewers see a lot of appeals. A creator who files a confident argument
against a decision the evidence plainly supports is a creator whose next appeal is read
with less care. The tool's value is that its documents are worth reading, and that only
holds if it declines to write one when writing one would hurt.

**Cost.** Sometimes the answer is "we agree with them", which is not what the person
clicking the button wanted. It is what they needed, and it still gives them the useful
half: a request for the specific timecodes, which is the thing platforms rarely
volunteer and which turns a dead end into an edit.

**Verified in the browser:** Instagram limits the true crime fixture, our own reading
agrees, and the generated brief asserts no grounds. YouTube clears the same passage, so
a YouTube limitation on the same video produces a brief with three grounds.
`tests/documents.test.ts` pins both directions.

---

## D15. The appeal brief is not in the pack

**Context.** Four documents are offered as a set. The brief could have been the fifth
button.

**Choice.** `buildPack()` returns the three documents plus the self-cert. The brief
comes from `buildAppeal()`, behind a form that asks what happened, which platform, and
what reason was given.

**Why.** A brief generated before anything has gone wrong is a document arguing against
a decision nobody has made. Putting it in the pack would invite a creator to file it,
and the reason the platform gave is also what selects the operative provision, so the
brief is materially worse without it.

**Cost.** One more click at the moment a creator is most annoyed. That is the right
moment to slow down.

---

## D18. The policy watcher reports drift, it never rewrites a pack

**Context.** Every pack in `packs/` is written from a published platform policy page
and records `source_url` and `retrieved`. Those pages move. A creator who runs
Greenlight in November against thresholds read in August has no way to know that.

**Choice.** `scripts/watch-policies.mjs` runs on a daily schedule
(`.github/workflows/policy-watch.yml`), fetches each `source_url`, reduces it to
visible text, hashes it, and compares against the baseline in
`packs/policy-watch.json`. Drift exits non-zero, which files an issue. The script
never edits a pack. Reconciliation is a human reading the diff, deciding whether a
threshold actually changes, bumping `retrieved` and `version`, then running
`--adopt` to move the baseline.

**Why.** The tempting version ingests the page and updates the rules. That would move
verdicts without anybody checking, which is the one failure this product cannot have:
the whole claim is that every verdict traces to a line of YAML somebody wrote on
purpose. A watcher that only ever says "go and look" keeps that true.

**What it actually covers.** One source of three today. YouTube's page reads fine.
Instagram returns HTTP 400 to a plain request, and TikTok's page is client rendered,
so a fetch gets 58 characters of text and 5 MB of bundle. Both are recorded with the
reason and counted as unchecked. The footer says `1/3 sources`, not `all sources`,
because claiming otherwise would be the product lying in exactly the register it was
built to fix.

**The false positive we accept.** The comparison is over the whole page, so a nav
rewrite counts as a change. That is the right way round: a check that misses a real
policy change is much worse than one that occasionally asks a human to look.

**Cost, paid once already.** Google's Help Center stamps a fresh request id into the
page chrome on every response, so the first version reported drift on its own second
run. Long digit runs and long mixed alphanumeric tokens are now blanked before
hashing, pinned by `tests/watch-policies.test.ts`.
