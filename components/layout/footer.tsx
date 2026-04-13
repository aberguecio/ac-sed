export function Footer() {
  return (
    <footer className="bg-navy-dark text-cream/60 mt-auto">
      <div className="max-w-6xl mx-auto px-4 py-8 flex flex-col md:flex-row items-center justify-between gap-4">
        <div className="flex items-center gap-2">
          <div className="w-7 h-7 rounded-full bg-wheat flex items-center justify-center font-bold text-navy text-xs">
            AC
          </div>
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
