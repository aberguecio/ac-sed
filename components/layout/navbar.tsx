'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useEffect, useState } from 'react'
import clsx from 'clsx'

const links = [
  { href: '/', label: 'Inicio' },
  { href: '/players', label: 'Plantel' },
  { href: '/stats', label: 'Estadísticas' },
  { href: '/news', label: 'Noticias' },
]

export function Navbar() {
  const pathname = usePathname()
  const [open, setOpen] = useState(false)
  const [scrolled, setScrolled] = useState(false)

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 16)
    onScroll()
    window.addEventListener('scroll', onScroll, { passive: true })
    return () => window.removeEventListener('scroll', onScroll)
  }, [])

  return (
    <nav
      className={clsx(
        'sticky top-0 z-40 transition-colors duration-200',
        scrolled
          ? 'bg-navy/80 backdrop-blur-md shadow-md'
          : 'bg-navy shadow-lg'
      )}
    >
      <div className="max-w-6xl mx-auto px-4">
        <div
          className={clsx(
            'flex items-center justify-between transition-all duration-200',
            scrolled ? 'h-12' : 'h-16'
          )}
        >
          {/* Logo */}
          <Link href="/" className="flex items-center gap-2">
            <img
              src="/ACSED-transaparent.webp"
              alt="AC SED"
              className={clsx(
                'w-auto transition-all duration-200',
                scrolled ? 'h-9' : 'h-12'
              )}
            />
            <span className="text-cream font-bold text-lg tracking-wide">AC SED</span>
          </Link>

          {/* Desktop nav */}
          <div className="hidden md:flex items-center gap-1">
            {links.map(({ href, label }) => (
              <Link
                key={href}
                href={href}
                className={clsx(
                  'px-4 py-2 rounded text-sm font-medium transition-colors',
                  pathname === href
                    ? 'bg-wheat text-navy'
                    : 'text-cream/80 hover:text-cream hover:bg-navy-light'
                )}
              >
                {label}
              </Link>
            ))}
          </div>

          {/* Mobile hamburger */}
          <button
            className="md:hidden text-cream p-2"
            onClick={() => setOpen(!open)}
            aria-label="Menu"
          >
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              {open ? (
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              ) : (
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
              )}
            </svg>
          </button>
        </div>

        {/* Mobile menu */}
        {open && (
          <div className="md:hidden pb-3">
            {links.map(({ href, label }) => (
              <Link
                key={href}
                href={href}
                onClick={() => setOpen(false)}
                className={clsx(
                  'block px-4 py-2 text-sm font-medium rounded mb-1',
                  pathname === href
                    ? 'bg-wheat text-navy'
                    : 'text-cream/80 hover:text-cream hover:bg-navy-light'
                )}
              >
                {label}
              </Link>
            ))}
          </div>
        )}
      </div>
    </nav>
  )
}
