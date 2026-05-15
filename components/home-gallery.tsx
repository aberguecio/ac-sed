'use client'

import { useEffect, useState } from 'react'

export interface HomeGalleryImage {
  src: string
  alt: string
}

export function HomeGallery({ images }: { images: HomeGalleryImage[] }) {
  const [active, setActive] = useState<number | null>(null)

  useEffect(() => {
    if (active === null) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setActive(null)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [active])

  // Lock scroll while the lightbox is open so the page doesn't move behind it.
  useEffect(() => {
    if (active === null) return
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.body.style.overflow = prev
    }
  }, [active])

  return (
    <>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 md:gap-4">
        {images.map((img, idx) => (
          <button
            key={`${img.src}-${idx}`}
            onClick={() => setActive(idx)}
            className="relative aspect-square rounded-xl md:rounded-2xl overflow-hidden group cursor-pointer shadow-lg hover:shadow-2xl transition-all duration-300"
            aria-label={`Ver ${img.alt}`}
          >
            <img
              src={img.src}
              alt={img.alt}
              className="w-full h-full object-cover group-hover:scale-110 transition-transform duration-500"
            />
            <div className="absolute inset-0 bg-navy/0 group-hover:bg-navy/20 transition-colors duration-300" />
          </button>
        ))}
      </div>

      {active !== null && images[active] && (
        <div
          className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center p-4"
          onClick={() => setActive(null)}
          role="dialog"
          aria-modal="true"
        >
          <button
            onClick={(e) => {
              e.stopPropagation()
              setActive(null)
            }}
            className="absolute top-4 right-4 text-white text-3xl leading-none w-10 h-10 flex items-center justify-center bg-black/40 rounded-full hover:bg-black/60"
            aria-label="Cerrar"
          >
            ×
          </button>
          <img
            src={images[active].src}
            alt={images[active].alt}
            className="max-w-[90vw] max-h-[90vh] object-contain rounded-lg"
            onClick={(e) => e.stopPropagation()}
          />
        </div>
      )}
    </>
  )
}
