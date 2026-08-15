/**
 * The clearing report: one self-contained HTML file.
 *
 * Contract: `renderReport(result)` returns a complete HTML document with no
 * external requests of any kind. Callers: `lib/engine/docs/pack.ts`, and tests.
 *
 * Self-contained is the requirement that shapes this file. The report is the
 * thing a creator keeps, mails to an editor, or opens in six months when a
 * video gets flagged. A stylesheet link or a webfont would make it depend on a
 * server still being there, so the CSS is inline and the type is a system
 * stack. It opens from a folder with no network at all.
 *
 * It carries the considered and cleared findings as well as the counted ones,
 * because the report's job is to show that the video was reviewed rather than
 * filtered.
 */

import type { ClearingResult, Finding } from '../types'
import { buildCutRanges } from './cutlist'
import { escapeHtml, levelWord, shortTime } from './format'

export function renderReport(result: ClearingResult): string {
  const ranges = buildCutRanges(result)
  const runtime = result.transcript.durationSec

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Greenlight clearing report</title>
<style>
:root {
  --ground: #DCDED7; --panel: #F6F7F3; --panel-2: #EAEBE4;
  --ink: #141819; --soft: #4C5457; --faint: #767E7F;
  --rule: #C2C6BC; --rule-hard: #9AA096;
  --clear: #147F45; --clear-bg: #D3E7DA;
  --limit: #9A6A05; --limit-bg: #EFE2C4;
  --strike: #A32E27; --strike-bg: #EFD8D5;
  --serif: "Palatino Linotype", "Book Antiqua", Palatino, "Iowan Old Style", Georgia, serif;
  --mono: ui-monospace, "SF Mono", "Cascadia Mono", Menlo, Consolas, monospace;
}
@media (prefers-color-scheme: dark) {
  :root {
    --ground: #0E1214; --panel: #171C1E; --panel-2: #101517;
    --ink: #E3E6E0; --soft: #9BA29F; --faint: #6E7775;
    --rule: #293134; --rule-hard: #3C4649;
    --clear: #46D68C; --clear-bg: #12291C;
    --limit: #E0A72E; --limit-bg: #2B2210;
    --strike: #E76A5F; --strike-bg: #2E1715;
  }
}
* { box-sizing: border-box; }
body { margin: 0; padding: 0 clamp(16px,5vw,48px) 90px; background: var(--ground); color: var(--ink);
  font-family: var(--serif); font-size: 16px; line-height: 1.6; }
.wrap { max-width: 940px; margin: 0 auto; }
h1 { font-size: clamp(28px,5vw,44px); line-height: 1.05; letter-spacing: -.02em; font-weight: 400; margin: 0; }
h2 { font-size: 24px; font-weight: 400; letter-spacing: -.01em; margin: 0 0 16px; }
h3 { font-size: 18px; font-weight: 400; margin: 0; }
p { margin: 0 0 12px; }
.mono { font-family: var(--mono); font-variant-numeric: tabular-nums; }
.label { font-family: var(--mono); font-size: 10.5px; letter-spacing: .16em; text-transform: uppercase; color: var(--faint); }
header { padding: 48px 0 28px; }
.slate { display: grid; grid-template-columns: repeat(auto-fit,minmax(150px,1fr)); border: 1px solid var(--rule-hard);
  background: var(--panel-2); margin-top: 28px; }
.slate div { padding: 11px 15px; border-right: 1px solid var(--rule); }
.slate div:last-child { border-right: 0; }
.slate .v { font-family: var(--mono); font-size: 13px; margin-top: 4px; }
section { padding: 34px 0; border-top: 1px solid var(--rule); }
.cards { display: grid; grid-template-columns: repeat(auto-fit,minmax(250px,1fr)); gap: 12px; }
.card { border: 1px solid var(--rule); background: var(--panel); padding: 16px 18px; }
.card header { display: flex; justify-content: space-between; align-items: center; gap: 10px; padding: 0 0 10px; }
.stamp { font-family: var(--mono); font-size: 10.5px; letter-spacing: .14em; text-transform: uppercase;
  padding: 4px 9px; border: 1px solid currentColor; white-space: nowrap; }
.cleared .stamp { color: var(--clear); } .limited .stamp { color: var(--limit); } .strike .stamp { color: var(--strike); }
.card ul { margin: 0; padding-left: 16px; font-size: 14px; line-height: 1.45; }
.card li { margin-bottom: 6px; }
.finding { display: grid; grid-template-columns: 92px minmax(0,1fr); gap: 14px; border-top: 1px solid var(--rule); padding: 14px 0; }
.finding .t { font-family: var(--mono); font-size: 12px; color: var(--faint); }
.finding .q { font-size: 16px; margin: 0 0 8px; }
.finding .m { font-family: var(--mono); font-size: 11.5px; color: var(--faint); margin: 0 0 8px; }
.finding ul { margin: 0; padding-left: 16px; font-size: 13.5px; line-height: 1.5; color: var(--soft); }
.bar { border-left: 3px solid var(--rule-hard); padding-left: 12px; }
.bar-limited { border-left-color: var(--limit); } .bar-strike { border-left-color: var(--strike); }
pre { font-family: var(--mono); font-size: 12.5px; line-height: 1.65; background: var(--panel-2);
  border: 1px solid var(--rule); padding: 14px 16px; overflow-x: auto; margin: 0; }
.note { font-size: 13px; color: var(--faint); line-height: 1.5; }
.good { border-left: 3px solid var(--clear); background: var(--clear-bg); padding: 16px 18px; }
</style>
</head>
<body>
<div class="wrap">

<header>
  <h1>Clearing report</h1>
  <div class="slate">
    <div><div class="label">Cleared</div><div class="v">${escapeHtml(result.clearedAt)}</div></div>
    <div><div class="label">Runtime</div><div class="v">${runtime ? shortTime(runtime) : 'unknown'}</div></div>
    <div><div class="label">Source</div><div class="v">${escapeHtml(result.transcript.source)} · ${result.transcript.exactTimings ? 'word timings' : 'line timings'}</div></div>
    <div><div class="label">Engine</div><div class="v">${escapeHtml(result.engineVersion)}</div></div>
  </div>
</header>

<section>
  <h2>Verdicts</h2>
  <div class="cards">
    ${result.platforms
      .map(
        (platform) => `<article class="card ${platform.level}">
      <header><h3>${escapeHtml(platform.packLabel)}</h3><span class="stamp">${levelWord(platform.level)}</span></header>
      ${
        platform.categories.every((c) => c.level === 'cleared')
          ? `<p class="note">Nothing above the threshold in any of the ${platform.categories.length} categories.</p>`
          : `<ul>${platform.categories
              .filter((c) => c.level !== 'cleared')
              .map((c) => `<li><strong>${escapeHtml(c.label)}.</strong> ${escapeHtml(c.reason)}</li>`)
              .join('')}</ul>`
      }
      <p class="label" style="margin-top:12px">pack ${escapeHtml(platform.packVersion)}</p>
    </article>`
      )
      .join('')}
  </div>
</section>

<section>
  <h2>${result.findings.length} finding${result.findings.length === 1 ? '' : 's'}</h2>
  ${
    result.findings.length === 0
      ? `<div class="good"><p style="margin:0">Nothing above the threshold. This cut is clear on every pack, against the guidelines as published on their retrieval dates.</p></div>`
      : result.findings.map((finding) => renderFinding(finding, result)).join('')
  }
</section>

${
  result.considered.length > 0
    ? `<section>
  <h2>${result.considered.length} considered and cleared</h2>
  <p class="note">Greenlight found these and decided they do not count. They are recorded because they are the evidence that the video was reviewed rather than filtered, and because an appeal argues from them.</p>
  ${result.considered.map((finding) => renderFinding(finding, result)).join('')}
</section>`
    : ''
}

<section>
  <h2>Cut list</h2>
  ${
    ranges.length === 0
      ? `<p class="note">No edit to make. Nothing in this cut was counted against you by any pack.</p>`
      : `<pre>${ranges
          .map(
            (range, index) =>
              `${String(index + 1).padStart(2, ' ')}. ${shortTime(range.startSec)} to ${shortTime(range.endSec)}   ${escapeHtml(flatten(range.quote, 74))}`
          )
          .join('\n')}</pre>
  <p class="note" style="margin-top:12px">The runnable ffmpeg command and the EDL are in the pack alongside this file.</p>`
  }
</section>

<section>
  <p class="note">Packs: ${result.platforms.map((p) => `${escapeHtml(p.packLabel)} ${escapeHtml(p.packVersion)}`).join(', ')}.</p>
  <p class="note">Greenlight reads what is said in a video, never what is shown. It reads published platform policy, does not speak for any platform, is not legal advice, and cannot guarantee monetization. The platform makes the call.</p>
</section>

</div>
</body>
</html>
`
}

function renderFinding(finding: Finding, result: ClearingResult): string {
  const level = levelOf(finding, result)
  const at = finding.startSec === null ? 'no timing' : shortTime(finding.startSec)
  const to = finding.endSec === null ? '' : ` to ${shortTime(finding.endSec)}`

  return `<div class="finding">
  <div class="t">${escapeHtml(at)}${escapeHtml(to)}</div>
  <div class="bar bar-${level}">
    <p class="q">${escapeHtml(finding.quote)}</p>
    <p class="m">${escapeHtml(finding.class)} · severity ${finding.severity} · confidence ${finding.confidence.toFixed(2)}</p>
    <ul>${finding.modifiers.map((modifier) => `<li>${escapeHtml(modifier.note)}</li>`).join('')}</ul>
  </div>
</div>`
}

function levelOf(finding: Finding, result: ClearingResult): string {
  let level = 'cleared'
  for (const platform of result.platforms) {
    for (const category of platform.categories) {
      if (category.level !== 'cleared' && category.findingIds.includes(finding.id)) {
        level = category.level === 'strike' ? 'strike' : level === 'strike' ? 'strike' : 'limited'
      }
    }
  }
  return level
}

function flatten(text: string, max: number): string {
  const flat = text.replace(/\s+/g, ' ').trim()
  return flat.length <= max ? flat : `${flat.slice(0, max - 1)}…`
}
