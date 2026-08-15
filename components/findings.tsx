'use client'

/**
 * The findings list, grouped into passages.
 *
 * Contract: renders non suppressed findings in transcript order, with the
 * considered and cleared ones behind a disclosure. Selecting a finding raises
 * it to the caller, which drives the timeline, the transcript rail and the
 * player. Callers: `components/clearing.tsx`.
 *
 * Why passages exist: a narrator describing an assault and then its injuries
 * produces two findings in different classes over the same sentence, and the
 * first build of this list printed that sentence twice, one card under the
 * other. It read like a bug because it looked like one. Findings that quote the
 * same passage now share a card: the passage is stated once, and each finding
 * inside it keeps its own class, severity, confidence and reasoning. The engine
 * is untouched, because the engine was right. It was the presentation that was
 * lying about how many things had happened.
 */

import type { ClearingResult, Finding } from '@/lib/engine/types'
import { formatTime, groupIntoPassages, levelForFinding, platformsForFinding } from '@/lib/ui/format'

interface FindingsProps {
  result: ClearingResult
  selectedId: string | null
  onSelect: (finding: Finding) => void
}

export function Findings({ result, selectedId, onSelect }: FindingsProps) {
  const passages = groupIntoPassages(result.findings)

  return (
    <section className="findings" aria-label="Findings">
      <header className="findings-head">
        <span className="gl-label">
          {result.findings.length} finding{result.findings.length === 1 ? '' : 's'}
          {passages.length !== result.findings.length ? ` across ${passages.length} passages` : ''}
        </span>
      </header>

      {result.findings.length === 0 && (
        <p className="nothing">
          Nothing above the threshold. This cut is clear on every pack, against the guidelines as published
          on their retrieval dates.
        </p>
      )}

      {passages.map((passage) => (
        <article key={passage.findings[0]?.id} className="passage">
          <div className="passage-time gl-mono">
            {passage.findings[0]?.startSec === null
              ? 'no time'
              : formatTime(passage.findings[0]?.startSec ?? 0)}
          </div>

          <div className="passage-body">
            <p className="passage-quote">{passage.quote}</p>

            {passage.findings.map((finding) => (
              <FindingDetail
                key={finding.id}
                finding={finding}
                result={result}
                selected={selectedId === finding.id}
                onSelect={onSelect}
              />
            ))}
          </div>
        </article>
      ))}

      {result.considered.length > 0 && (
        <details className="considered">
          <summary>{result.considered.length} considered and cleared</summary>
          <p className="considered-note">
            Greenlight found these and decided they do not count. They stay on file because they are the
            evidence that the video was reviewed, and they are what an appeal argues from.
          </p>
          {result.considered.map((finding) => (
            <article key={finding.id} className="passage passage-muted">
              <div className="passage-time gl-mono">
                {finding.startSec === null ? 'no time' : formatTime(finding.startSec)}
              </div>
              <div className="passage-body">
                <p className="passage-quote">{finding.quote}</p>
                <FindingDetail finding={finding} result={result} selected={false} onSelect={onSelect} />
              </div>
            </article>
          ))}
        </details>
      )}
    </section>
  )
}

function FindingDetail({
  finding,
  result,
  selected,
  onSelect,
}: {
  finding: Finding
  result: ClearingResult
  selected: boolean
  onSelect: (finding: Finding) => void
}) {
  const level = levelForFinding(result, finding.id)
  const platforms = platformsForFinding(result, finding.id)
  const matched = [...new Set(finding.hits.map((hit) => hit.matched))]

  return (
    <div className={`detail detail-${level} ${selected ? 'detail-on' : ''}`}>
      <button type="button" className="detail-head" onClick={() => onSelect(finding)}>
        <span className="detail-terms">
          {matched.map((term) => (
            <span key={term} className="term">
              {term}
            </span>
          ))}
        </span>
        <span className="detail-span gl-mono">
          {finding.startSec === null
            ? 'untimed'
            : `${formatTime(finding.startSec)} to ${formatTime(finding.endSec ?? finding.startSec)}`}
        </span>
      </button>

      <p className="detail-meta gl-mono">
        {finding.class} · severity {finding.severity} · confidence {finding.confidence.toFixed(2)}
        {platforms.length > 0 ? ` · counted by ${platforms.join(', ')}` : ' · counted by nobody'}
      </p>

      <ul className="detail-why">
        {finding.modifiers.length === 0 && <li>No context changed this. It reads as stated.</li>}
        {finding.modifiers.map((modifier) => (
          <li key={modifier.id} className={`why why-${modifier.effect}`}>
            {modifier.note}
          </li>
        ))}
      </ul>
    </div>
  )
}
