import type { ReactNode } from 'react'
import '@/brand/tokens.css'
import './app.css'

export { metadata, viewport } from './metadata'

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  )
}
