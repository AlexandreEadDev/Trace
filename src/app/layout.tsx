import type { Metadata } from 'next'
import { Inter } from 'next/font/google'
import './globals.css'
import { ModeProvider } from '@/context/ModeContext'
import { Navbar } from '@/components/Navbar'

const inter = Inter({ subsets: ['latin'], variable: '--font-sans' })

export const metadata: Metadata = {
  title: 'Trace — Ta bibliothèque, ludothèque & cinémathèque',
  description:
    'Suis tes lectures, jeux vidéo et films. Note-les, partage tes avis et tiens un journal privé.',
}

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="fr" className={inter.variable}>
      <body className="min-h-screen bg-background font-sans antialiased">
        <ModeProvider>
          <Navbar />
          <main>{children}</main>
        </ModeProvider>
      </body>
    </html>
  )
}
