const SPONSORS = [
  { name: 'AirLife', logo: '/sponsors/airlife.png', url: 'https://airlife.com/airlife' },
  { name: 'Proactiva Seguros', logo: '/sponsors/proactiva.png', url: 'https://www.proactivaseguros.cl/' },
]

export function Footer() {
  return (
    <footer className="bg-navy-dark text-cream/60 mt-auto">
      <div className="max-w-6xl mx-auto px-4 py-6 border-b border-cream/10">
        <p className="text-center text-xs uppercase tracking-[0.2em] text-wheat mb-4">
          Auspician
        </p>
        <div className="flex flex-wrap items-center justify-center gap-6 md:gap-10">
          {SPONSORS.map((s) => (
            <a
              key={s.name}
              href={s.url}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center justify-center w-40 h-14 md:w-48 md:h-16 hover:scale-105 transition-transform"
              title={s.name}
            >
              <img
                src={s.logo}
                alt={s.name}
                className="max-w-full max-h-full object-contain"
              />
            </a>
          ))}
        </div>
      </div>
      <div className="max-w-6xl mx-auto px-4 py-6 flex flex-col md:flex-row items-center justify-between gap-4">
        <div className="flex items-center gap-2">
          <img src="/ACSED-transaparent.webp" alt="AC SED" className="h-8 w-auto" />
          <span className="font-semibold text-cream">AC SED</span>
        </div>
        <p className="text-sm">
          Hecho por{" "}
          <a
            href="https://agustin.berguecio.cl/"
            target="_blank"
            rel="noopener noreferrer"
            className="text-cream/80 hover:text-wheat underline underline-offset-4 decoration-wheat/40 hover:decoration-wheat transition-colors"
          >
            Agustín Berguecio
          </a>
        </p>
        <p className="text-sm">{new Date().getFullYear()}</p>
      </div>
    </footer>
  )
}
