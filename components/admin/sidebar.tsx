'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { signOut } from 'next-auth/react'
import clsx from 'clsx'

const links = [
  { href: '/admin', label: 'Dashboard', icon: '📊' },
  { href: '/admin/scrape', label: 'Scraping', icon: '🔄' },
  { href: '/admin/news', label: 'Noticias', icon: '📰' },
  { href: '/admin/instagram', label: 'Instagram', icon: '📸' },
  { href: '/admin/subscribers', label: 'Suscriptores', icon: '✉️' },
  { href: '/admin/players', label: 'Jugadores', icon: '⚽' },
  { href: '/admin/matches', label: 'Asistencia', icon: '✅' },
  { href: '/admin/settings', label: 'Configuración', icon: '⚙️' },
]

export function AdminSidebar() {
  const pathname = usePathname()

  return (
    <aside className="md:w-56 w-full bg-navy-dark md:min-h-screen h-auto flex md:flex-col flex-row md:static fixed bottom-0 z-50">
      <div className="p-5 border-b border-navy-light/30 hidden md:block">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-full bg-wheat flex items-center justify-center font-bold text-navy text-xs">
            AC
          </div>
          <div>
            <p className="text-cream font-bold text-sm">AC SED</p>
            <p className="text-cream/50 text-xs">Admin</p>
          </div>
        </div>
      </div>
      <nav className="flex-1 p-3 md:block flex overflow-x-auto">
        <div className="flex md:flex-col flex-row gap-1 md:gap-0">
          {links.map(({ href, label, icon }) => (
            <Link
              key={href}
              href={href}
              className={clsx(
                'flex items-center justify-center md:justify-start gap-3 px-3 py-2.5 rounded-lg md:mb-1 text-sm font-medium transition-colors whitespace-nowrap min-w-[60px] md:min-w-0',
                pathname === href
                  ? 'bg-wheat text-navy'
                  : 'text-cream/70 hover:text-cream hover:bg-navy-light/40'
              )}
            >
              <span>{icon}</span>
              <span className="hidden md:inline">{label}</span>
            </Link>
          ))}
        </div>
      </nav>
      <div className="p-3 border-t border-navy-light/30 hidden md:block">
        <button
          onClick={() => signOut({ callbackUrl: '/admin/login' })}
          className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm text-cream/60 hover:text-cream hover:bg-navy-light/40 transition-colors"
        >
          <span>🚪</span>
          <span>Cerrar sesión</span>
        </button>
        <Link
          href="/"
          target="_blank"
          className="mt-1 w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm text-cream/60 hover:text-cream hover:bg-navy-light/40 transition-colors"
        >
          <span>🌐</span>
          <span>Ver sitio</span>
        </Link>
      </div>
    </aside>
  )
}
