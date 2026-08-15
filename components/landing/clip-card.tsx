'use client'

/**
 * One clip on the landing page: its waveform, its words appearing as it plays,
 * and what three platforms made of it.
 *
 * Contract: takes a `LandingClip` and plays it on a loop. Callers:
 * `app/page.tsx`.
 *
 * The bubbles follow the video's own `currentTime` while it is running, so the
 * word lights up on the frame it was said. A CSS animation on a matching
 * duration would start in step and drift out of it, and a minute later the page
 * is highlighting a word over silence.
 *
 * When the video is not running the card keeps its own clock instead. Browsers
 * refuse muted autoplay in more situations than the specification suggests, and
 * on a page whose entire argument is a demonstration, a still frame is a dead
 * page. So playback is an enhancement: the bubbles always move, and they lock
 * to the footage whenever the footage is actually playing.
 */

import { useEffect, useRef, useState } from 'react'
import type { LandingClip } from './clips'

/** How long a bubble stays up once it has appeared. */
const BUBBLE_HOLD_SEC = 4

export function ClipCard({ clip, index }: { clip: LandingClip; index: number }) {
  const videoRef = useRef<HTMLVideoElement>(null)
  const [at, setAt] = useState(0)

  useEffect(() => {
    const video = videoRef.current
    if (!video) return

    const openedAt = Date.now()
    let lastVideoTime = -1

    // Poll on a timer rather than every animation frame.
    //
    // The first version read the clock in a requestAnimationFrame loop, which
    // re-rendered the card sixty times a second. Four of those on one page
    // aborted the media load outright, so every clip sat at readyState 0 with
    // no error to explain it, and the whole page went sluggish. Bubbles change
    // a handful of times per clip. Eight reads a second is more than enough and
    // costs nothing.
    const timer = setInterval(() => {
      const videoTime = video.currentTime
      const rolling = videoTime !== lastVideoTime && videoTime > 0
      lastVideoTime = videoTime

      setAt(rolling ? videoTime : ((Date.now() - openedAt) / 1000) % clip.runtimeSec)
    }, 125)

    // Play only while on screen. Four clips decoding at once for the benefit of
    // whichever one the reader is looking at is a waste of a laptop battery,
    // and browsers pause backgrounded video anyway, so without this the cards
    // below the fold sit frozen on their first frame once you reach them.
    //
    // Pausing is keyed on the card being entirely gone, not on it falling below
    // the visibility threshold. An earlier version paused on `!isIntersecting`,
    // and a single transient callback during mount left every clip frozen on
    // its first frame with no further callback coming to undo it.
    const watcher = new IntersectionObserver(
      ([entry]) => {
        if (!entry) return
        if (entry.intersectionRatio === 0) video.pause()
        else void video.play().catch(() => {})
      },
      { threshold: [0, 0.2] }
    )
    watcher.observe(video)

    return () => {
      clearInterval(timer)
      watcher.disconnect()
    }
  }, [clip.runtimeSec])

  const progress = clip.runtimeSec > 0 ? Math.min(1, at / clip.runtimeSec) : 0

  return (
    <article className="clip" style={{ ['--i' as string]: String(index) }}>
      <div className="clip-frame">
        <video
          ref={videoRef}
          className="clip-video"
          src={clip.video}
          poster={clip.poster}
          autoPlay
          loop
          muted
          playsInline
          preload="auto"
          aria-hidden="true"
        />

        <div className="clip-bubbles">
          {clip.bubbles.map((bubble) => {
            const live = at >= bubble.atSec && at < bubble.atSec + BUBBLE_HOLD_SEC
            return (
              <p
                key={`${bubble.atSec}-${bubble.before}`}
                className={`bubble ${live ? 'bubble-live' : ''} ${bubble.flagged ? `bubble-${bubble.level}` : ''}`}
              >
                <span className="bubble-at">{bubble.atSec.toFixed(1)}</span>
                <span>
                  {bubble.before}
                  {bubble.flagged && (
                    <>
                      {' '}
                      <mark className={`flag flag-${bubble.level}`}>{bubble.flagged}</mark>{' '}
                    </>
                  )}
                  {bubble.after}
                </span>
              </p>
            )
          })}
        </div>

        <span className="clip-progress" style={{ transform: `scaleX(${progress})` }} aria-hidden="true" />
      </div>

      <div className="clip-body">
        <h3>{clip.title}</h3>
        <p className="clip-strap">{clip.strap}</p>

        <dl className="clip-finding">
          <div>
            <dt>Found</dt>
            <dd className="gl-mono">{clip.finding.term}</dd>
          </div>
          <div>
            <dt>At</dt>
            <dd className="gl-mono">{clip.finding.span}</dd>
          </div>
          <div>
            <dt>Counted by</dt>
            <dd className="gl-mono">{clip.finding.countedBy}</dd>
          </div>
        </dl>

        <ul className="clip-verdicts">
          {clip.verdicts.map((verdict) => (
            <li key={verdict.platform} className={`chip chip-${verdict.level}`}>
              <span className="chip-dot" aria-hidden="true" />
              {verdict.platform}
              <strong>
                {verdict.level === 'cleared' ? 'cleared' : verdict.level === 'limited' ? 'limited' : 'removed'}
              </strong>
            </li>
          ))}
        </ul>
      </div>
    </article>
  )
}
