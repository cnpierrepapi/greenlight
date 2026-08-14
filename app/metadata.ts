import type { Metadata, Viewport } from 'next'

// Set once, everything else derives from it.
export const SITE_URL = 'https://greenlight.onenept.com'

const TITLE = 'Greenlight'
const TAGLINE = 'Monetization check for a cut you have already made'
const DESCRIPTION =
  'Drop in a video. Greenlight transcribes it in your browser, checks it against what YouTube, TikTok and Instagram publish, and hands back the timecodes, the cut list, the self-cert answers and an appeal brief.'

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: {
    default: `${TITLE}. ${TAGLINE}.`,
    template: `%s · ${TITLE}`,
  },
  description: DESCRIPTION,
  applicationName: TITLE,
  authors: [{ name: 'Onenept Studios', url: 'https://onenept.com' }],
  creator: 'Onenept Studios',
  keywords: [
    'monetization check',
    'advertiser friendly guidelines',
    'self certification',
    'limited ads',
    'demonetization appeal',
    'creator tools',
    'video transcript',
  ],
  alternates: { canonical: '/' },
  openGraph: {
    type: 'website',
    url: SITE_URL,
    siteName: TITLE,
    title: `${TITLE}. ${TAGLINE}.`,
    description: DESCRIPTION,
    locale: 'en_GB',
    // image comes from app/opengraph-image.tsx
  },
  twitter: {
    card: 'summary_large_image',
    title: `${TITLE}. ${TAGLINE}.`,
    description: DESCRIPTION,
  },
  robots: {
    index: true,
    follow: true,
    googleBot: { index: true, follow: true, 'max-image-preview': 'large' },
  },
  category: 'technology',
}

export const viewport: Viewport = {
  themeColor: [
    { media: '(prefers-color-scheme: light)', color: '#DCDED7' },
    { media: '(prefers-color-scheme: dark)', color: '#0E1214' },
  ],
  colorScheme: 'light dark',
}
