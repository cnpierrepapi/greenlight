import Link from 'next/link'
import type { Metadata } from 'next'
import { Bench } from '@/components/bench'

export const metadata: Metadata = {
  title: 'Clear a cut',
  description:
    'Drop a video in. Greenlight transcribes it on your own machine and hands back the timecodes that cost you the ad revenue.',
}

export default function ClearPage() {
  return (
    <main>
      <header className="masthead masthead-app">
        <Link href="/" className="lockup lockup-link">
          <svg width="40" height="40" viewBox="0 0 64 64" role="img" aria-label="Greenlight">
            <rect width="64" height="64" rx="7" fill="#141819" />
            <circle cx="32" cy="32" r="20.5" fill="none" stroke="#2BD07A" strokeOpacity=".22" strokeWidth="2" />
            <circle cx="32" cy="32" r="13" fill="#2BD07A" />
            <path d="M7.5 32h5M51.5 32h5" stroke="#DCDED7" strokeOpacity=".55" strokeWidth="2" strokeLinecap="square" />
          </svg>
          <p className="wordmark wordmark-small">
            Green<span>light</span>
          </p>
        </Link>

        <p className="app-strap">
          Drop a cut in. It gets transcribed on this machine, checked against what YouTube, TikTok and
          Instagram publish, and handed back as timecodes you can act on. Nothing is uploaded.
        </p>
      </header>

      <Bench />
    </main>
  )
}
