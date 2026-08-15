# Greenlight

**Live: https://greenlight.onenept.com**

A monetization check for a cut you have already made.

Drop a finished video in. Greenlight transcribes it in your own browser, finds the
exact timecoded moments that will draw limited ads or a strike, cites the published
platform rule each one trips, and exports four documents built from that video's own
evidence: a clearing report, an ffmpeg and EDL cut list, pre-answered YouTube
self-certification, and an appeal brief if a decision has already gone against you.

No account, no API key, no upload. The video file never leaves your machine.

Greenlight reads published platform policy. It does not speak for any platform, it is
not legal advice, and it cannot guarantee monetization. The platform makes the call.

## What you get back

Four documents, all written from your video's own findings rather than from a template.

| File | What it is |
| --- | --- |
| `report.html` | Every finding with its timecode, the published rule it trips, and what was considered and cleared. No scripts and no webfonts, so it opens from a folder with no network. |
| `cutlist.sh` | A runnable ffmpeg command that mutes the flagged ranges and copies the video stream untouched. |
| `cutlist.edl` | The same ranges as a CMX3600 EDL of what survives a trim, for Premiere or Resolve. |
| `selfcert.md` | The advertiser questionnaire answered from the transcript, with the timecodes behind each answer. |
| `appeal.md` | Generated only once a decision exists. Numbered exhibits from your video, quoted, with a stated remedy. |

Three rules hold across all of them.

The cut list only touches findings a platform actually counted. A finding nobody
counted is real, is in the report, and is not worth editing a video over.

The self-certification leaves the questions about imagery unanswered. Greenlight reads
what is said, never what is shown, and a wrong self-cert answer costs a creator more
than a missing one.

And the appeal brief will not argue a losing point. When your video's own evidence
supports the platform's decision, the brief says so and asks for the timecodes relied
upon so a conforming edit can be prepared, instead of arguing a case that would get you
ignored.

## Running it

```
npm install
npm run dev
```

`npm run dev` compiles the policy packs first, then starts the app on
http://localhost:3000.

```
npm test         # engine unit tests
npm run typecheck
```

## Reading the code

Start with `docs/ARCHITECTURE.md`. It names real files and functions and walks one
clearing from dropped file to appeal brief. `docs/DECISIONS.md` records why the build
looks the way it does, including what each choice cost.

The short version: `lib/engine/` is pure TypeScript with no DOM, no network and no
clock, so it runs under vitest in node and produces the same output every time.
`app/` is the interface and holds no rules logic. `packs/` holds the platform rules
as YAML, compiled to a typed module at build time.
