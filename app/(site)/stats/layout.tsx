import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'Estadísticas',
  description:
    'Estadísticas del Club Atlético SED en Liga B Chile: goleadores, tarjetas, rendimiento por jornada y tabla de posiciones.',
  alternates: { canonical: '/stats' },
  openGraph: {
    title: 'Estadísticas — AC SED',
    description:
      'Estadísticas del Club Atlético SED en Liga B Chile: goleadores, tarjetas y rendimiento por jornada.',
    url: '/stats',
    type: 'website',
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Estadísticas — AC SED',
    description:
      'Estadísticas del Club Atlético SED en Liga B Chile: goleadores, tarjetas y rendimiento por jornada.',
  },
}

export default function StatsLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>
}
