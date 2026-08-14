# Greenlight

A monetization check for a cut you have already made.

Drop a finished video in. Greenlight transcribes it in your own browser, finds the
exact timecoded moments that will draw limited ads or a strike, cites the published
platform rule each one trips, and exports four documents built from that video's own
evidence: a clearing report, an ffmpeg and EDL cut list, pre-answered YouTube
self-certification, and an appeal brief if a decision has already gone against you.

No account, no API key, no upload. The video file never leaves your machine.

Greenlight reads published platform policy. It does not speak for any platform, it is
not legal advice, and it cannot guarantee monetization. The platform makes the call.

## Status

Under construction. Phase 0 complete: scaffold, data contract, fixtures, docs.

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
