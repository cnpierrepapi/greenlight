import { Bench } from '@/components/bench'

export default function Home() {
  return (
    <main>
      <header className="masthead">
        <div className="lockup">
          <svg width="52" height="52" viewBox="0 0 64 64" role="img" aria-label="Greenlight">
            <rect width="64" height="64" rx="7" fill="#141819" />
            <circle cx="32" cy="32" r="20.5" fill="none" stroke="#2BD07A" strokeOpacity=".22" strokeWidth="2" />
            <circle cx="32" cy="32" r="13" fill="#2BD07A" />
            <path d="M7.5 32h5M51.5 32h5" stroke="#DCDED7" strokeOpacity=".55" strokeWidth="2" strokeLinecap="square" />
          </svg>
          <p className="wordmark">
            Green<span>light</span>
          </p>
        </div>

        <div className="thesis">
          <h1>Find out which nine seconds cost you the ad revenue, before you upload.</h1>
          <p>
            Greenlight is a monetization check for a cut you have already made. Drop the video in. It gets
            transcribed on this machine, checked against what YouTube, TikTok and Instagram publish, and handed
            back to you as timecodes you can act on.
          </p>
        </div>
      </header>

      <Bench />
    </main>
  )
}
