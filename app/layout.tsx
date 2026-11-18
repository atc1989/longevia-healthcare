import type { Metadata } from 'next'
import './globals.css'

export const metadata: Metadata = {
  title: 'LONGEVIA — Personalized Health & Longevity',
  description: 'Physician-led care, diagnostics and personalized health tracking.',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  )
}
