'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { signOut } from 'next-auth/react'
import clsx from 'clsx'

const links = [
  { href: '/admin', label: 'Dashboard', icon: '📊' },
  { href: '/admin/scrape', label: 'Scraping', icon: '🔄' },
  { href: '/admin/news', label: 'Noticias', icon: '📰' },
  { href: '/admin/players', label: 'Jugadores', icon: '⚽' },
  { href: '/admin/settings', label: 'Configuración', icon: '⚙️' },
]

export function AdminSidebar() {
  const pathname = usePathname()

  return (
    <aside className="w-56 bg-navy-dark min-h-screen flex flex-col">
      <div className="p-5 border-b border-navy-light/30">
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
      <nav className="flex-1 p-3">
        {links.map(({ href, label, icon }) => (
          <Link
            key={href}
            href={href}
            className={clsx(
              'flex items-center gap-3 px-3 py-2.5 rounded-lg mb-1 text-sm font-medium transition-colors',
              pathname === href
                ? 'bg-wheat text-navy'
                : 'text-cream/70 hover:text-cream hover:bg-navy-light/40'
            )}
          >
            <span>{icon}</span>
            <span>{label}</span>
          </Link>
        ))}
      </nav>
      <div className="p-3 border-t border-navy-light/30">
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
