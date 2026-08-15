import Link from 'next/link'
import './landing.css'
import { ClipCard } from '@/components/landing/clip-card'
import { CLIPS } from '@/components/landing/clips'

export default function Landing() {
  return (
    <main className="landing">
      <div className="glow" aria-hidden="true" />

      <header className="lp-top">
        <div className="lockup">
          <svg width="38" height="38" viewBox="0 0 64 64" role="img" aria-label="Greenlight">
            <rect width="64" height="64" rx="7" fill="#141819" />
            <circle cx="32" cy="32" r="20.5" fill="none" stroke="#2BD07A" strokeOpacity=".22" strokeWidth="2" />
            <circle cx="32" cy="32" r="13" fill="#2BD07A" />
            <path d="M7.5 32h5M51.5 32h5" stroke="#DCDED7" strokeOpacity=".55" strokeWidth="2" strokeLinecap="square" />
          </svg>
          <p className="wordmark">
            Green<span>light</span>
          </p>
        </div>
        <Link href="/clear" className="btn btn-ghost">
          Clear a cut
        </Link>
      </header>

      <section className="hero">
        <div className="hero-copy">
          <p className="eyebrow">Runs on your machine. No account, no upload.</p>
          <h1>
            You already made the video.
            <span className="hot"> Now find out which nine seconds cost you the money.</span>
          </h1>
          <p className="hero-sub">
            Greenlight listens to a cut you have finished, finds the exact moments that get it limited or
            pulled, and tells you which platform cares about each one. Then it writes the edit list.
          </p>
          <div className="hero-cta">
            <Link href="/clear" className="btn btn-hot">
              Drop a cut in
            </Link>
            <span className="hero-note">Takes about as long as the video runs.</span>
          </div>
        </div>

        <div className="hero-stage">
          <ClipCard clip={CLIPS[1] as (typeof CLIPS)[number]} index={0} />
        </div>
      </section>

      <section className="lp-clips">
        <div className="lp-clips-head">
          <h2>Three clips. Same tool. Three different answers.</h2>
          <p>
            Every word, timecode and verdict below came out of Greenlight itself. The waveforms are drawn
            from the clips&apos; own audio, and the bubbles appear on the second the word was said.
          </p>
        </div>

        <div className="clip-grid">
          {CLIPS.map((clip, index) => (
            <ClipCard key={clip.id} clip={clip} index={index + 1} />
          ))}
        </div>
      </section>

      <section className="steps">
        <h2>What actually happens</h2>
        <ol>
          <li>
            <span className="step-n">01</span>
            <h3>It listens</h3>
            <p>
              Whisper runs inside your browser tab. The file never leaves the machine, which is also why
              there is nothing to sign up for.
            </p>
          </li>
          <li>
            <span className="step-n">02</span>
            <h3>It checks</h3>
            <p>
              Every flagged moment is matched against the published rules of each platform, kept as plain
              text files anyone can read and correct. No model decides your revenue.
            </p>
          </li>
          <li>
            <span className="step-n">03</span>
            <h3>It writes the fix</h3>
            <p>
              A runnable ffmpeg command that mutes exactly those seconds, an EDL for your editor, your
              self-certification answers, and a filed appeal if you have already been hit.
            </p>
          </li>
        </ol>
      </section>

      <section className="honest">
        <div>
          <h2>What it will not do</h2>
          <p>
            Greenlight hears what is said. It cannot see what is on screen, so it leaves the questions about
            imagery for you to answer rather than guessing them.
          </p>
          <p>
            It reads published policy. It does not speak for any platform, it is not legal advice, and it
            cannot promise you get paid. The platform still makes the call.
          </p>
          <p>
            And when your own footage backs up the decision that went against you, the appeal says so and
            asks for the timecodes instead. A confident appeal against a fair call is how a creator stops
            being read.
          </p>
        </div>
      </section>

      <section className="close">
        <h2>Find out before you upload, not after.</h2>
        <Link href="/clear" className="btn btn-hot btn-big">
          Drop a cut in
        </Link>
        <p className="close-note">
          Free, no account, nothing uploaded. Built by{' '}
          <a href="https://onenept.com">Onenept Studios</a>.
        </p>
      </section>
    </main>
  )
}
