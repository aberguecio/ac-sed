import Link from 'next/link'
import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'Desuscripción — AC SED',
  robots: { index: false, follow: false },
}

export default function UnsubscribePage() {
  return (
    <div className="max-w-lg mx-auto px-4 py-20 text-center">
      <div className="w-16 h-16 rounded-full bg-cream-dark flex items-center justify-center mx-auto mb-6">
        <span className="text-2xl">✓</span>
      </div>
      <h1 className="text-2xl font-extrabold text-navy mb-3">Desuscripción exitosa</h1>
      <p className="text-gray-500 mb-8">
        Te hemos removido de nuestra lista de newsletter. Ya no recibirás más correos de AC SED.
      </p>
      <Link
        href="/news"
        className="inline-block bg-navy text-cream px-6 py-2.5 rounded-lg text-sm font-semibold hover:bg-navy-light"
      >
        Ver noticias
      </Link>
    </div>
  )
}
