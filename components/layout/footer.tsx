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
        <p className="text-sm">Liga B Chile · Todos los derechos reservados</p>
        <p className="text-sm">{new Date().getFullYear()}</p>
      </div>
    </footer>
  )
}
