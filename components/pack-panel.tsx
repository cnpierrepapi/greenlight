'use client'

/**
 * The pack: four downloads, and the form that produces the fifth.
 *
 * Contract: renders download buttons for the documents a clearing can produce
 * on its own, plus an appeal brief once the creator says what happened.
 * Callers: `components/clearing.tsx`.
 *
 * The appeal is behind a form rather than a button on purpose. It needs three
 * facts only the creator has, and a brief generated before anything has gone
 * wrong would be a document arguing against a decision nobody has made. Offering
 * one would invite them to file it.
 */

import { useState } from 'react'
import { buildAppeal, buildPack, type AppealDecision, type Document } from '@/lib/engine'
import type { ClearingResult } from '@/lib/engine/types'

interface PackPanelProps {
  result: ClearingResult
  /** Whatever the clearing came from, used to name the documents. */
  sourceName: string | null
  /**
   * The media file the ffmpeg command will run against, when there is one.
   * Kept separate from `sourceName` because a clearing from a subtitle file
   * still produces a cut list, and that list runs against the creator's video
   * rather than against the .srt they gave us.
   */
  mediaName: string | null
}

const DECISIONS: { value: AppealDecision; label: string }[] = [
  { value: 'limited', label: 'Limited or no ads' },
  { value: 'age_restricted', label: 'Age restricted' },
  { value: 'removed', label: 'Removed' },
]

export function PackPanel({ result, sourceName, mediaName }: PackPanelProps) {
  const [open, setOpen] = useState(false)
  const [packId, setPackId] = useState(result.platforms[0]?.packId ?? 'youtube')
  const [decision, setDecision] = useState<AppealDecision>('limited')
  const [statedReason, setStatedReason] = useState('')
  const [caseRef, setCaseRef] = useState('')
  const [channelName, setChannelName] = useState('')
  const [error, setError] = useState<string | null>(null)

  const documents = buildPack(result, {
    slug: sourceName ?? 'cut',
    inputName: mediaName ?? 'input.mp4',
  })

  const draftAppeal = () => {
    setError(null)
    try {
      const document = buildAppeal(
        result,
        {
          packId,
          decision,
          statedReason,
          filedOn: new Date().toISOString().slice(0, 10),
          caseRef: caseRef.trim() || undefined,
          channelName: channelName.trim() || undefined,
        },
        { slug: sourceName ?? 'cut' }
      )
      download(document)
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'The brief could not be drafted.')
    }
  }

  return (
    <section className="pack" aria-label="The pack">
      <header className="pack-head">
        <span className="gl-label">The pack</span>
        <span className="pack-note">Everything below is written from this video, not from a template.</span>
      </header>

      <div className="pack-grid">
        {documents.map((document) => (
          <article key={document.filename} className="doc">
            <button type="button" className="doc-button" onClick={() => download(document)}>
              {document.filename}
            </button>
            <p className="doc-blurb">{document.blurb}</p>
          </article>
        ))}
      </div>

      <div className="appeal">
        <button type="button" className="appeal-toggle" onClick={() => setOpen(!open)} aria-expanded={open}>
          {open ? 'Close the appeal brief' : 'Already been hit? Draft an appeal brief'}
        </button>

        {open && (
          <div className="appeal-form">
            <p className="doc-blurb">
              A brief only makes sense once a decision exists. Tell Greenlight what happened and it will
              argue from this video&apos;s own findings. If the evidence supports the platform, the brief
              says so and asks for the timecodes instead, because a confident appeal against a fair
              decision is how a creator gets ignored.
            </p>

            <div className="field-row">
              <label className="field">
                <span className="gl-label">Platform</span>
                <select value={packId} onChange={(event) => setPackId(event.target.value)}>
                  {result.platforms.map((platform) => (
                    <option key={platform.packId} value={platform.packId}>
                      {platform.packLabel}
                    </option>
                  ))}
                </select>
              </label>

              <label className="field">
                <span className="gl-label">What happened</span>
                <select
                  value={decision}
                  onChange={(event) => setDecision(event.target.value as AppealDecision)}
                >
                  {DECISIONS.map((item) => (
                    <option key={item.value} value={item.value}>
                      {item.label}
                    </option>
                  ))}
                </select>
              </label>
            </div>

            <label className="field">
              <span className="gl-label">The reason they gave, pasted</span>
              <textarea
                rows={3}
                value={statedReason}
                onChange={(event) => setStatedReason(event.target.value)}
                placeholder="Paste the wording from the platform. It decides which rule the brief answers."
              />
            </label>

            <div className="field-row">
              <label className="field">
                <span className="gl-label">Channel name, optional</span>
                <input value={channelName} onChange={(event) => setChannelName(event.target.value)} />
              </label>
              <label className="field">
                <span className="gl-label">Case reference, optional</span>
                <input value={caseRef} onChange={(event) => setCaseRef(event.target.value)} />
              </label>
            </div>

            <button type="button" className="drop-button" onClick={draftAppeal}>
              Draft the brief
            </button>

            {error && (
              <p className="error" role="alert">
                {error}
              </p>
            )}
          </div>
        )}
      </div>
    </section>
  )
}

/**
 * Hands the file to the browser.
 *
 * The object URL is revoked on the next tick rather than immediately: revoking
 * in the same frame cancels the download in some browsers, which produces a
 * button that looks like it works and silently does nothing.
 */
function download(document_: Document) {
  const blob = new Blob([document_.contents], { type: `${document_.mime};charset=utf-8` })
  const url = URL.createObjectURL(blob)
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = document_.filename
  document.body.appendChild(anchor)
  anchor.click()
  anchor.remove()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}
