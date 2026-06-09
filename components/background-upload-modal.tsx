'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import ReactCrop, {
  centerCrop,
  makeAspectCrop,
  type Crop,
  type PixelCrop,
} from 'react-image-crop'

interface Props {
  files: File[]
  onClose: () => void
  onAllUploaded: () => void
}

async function canvasToBlob(canvas: HTMLCanvasElement, type = 'image/jpeg', quality = 0.92): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      b => (b ? resolve(b) : reject(new Error('toBlob failed'))),
      type,
      quality,
    )
  })
}

async function cropImageToBlob(
  image: HTMLImageElement,
  crop: PixelCrop,
): Promise<Blob> {
  const scaleX = image.naturalWidth / image.width
  const scaleY = image.naturalHeight / image.height
  const canvas = document.createElement('canvas')
  canvas.width = Math.max(1, Math.round(crop.width * scaleX))
  canvas.height = Math.max(1, Math.round(crop.height * scaleY))
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('canvas 2d unavailable')
  ctx.imageSmoothingQuality = 'high'
  ctx.drawImage(
    image,
    crop.x * scaleX,
    crop.y * scaleY,
    crop.width * scaleX,
    crop.height * scaleY,
    0,
    0,
    canvas.width,
    canvas.height,
  )
  return canvasToBlob(canvas)
}

export function BackgroundUploadModal({ files, onClose, onAllUploaded }: Props) {
  const [index, setIndex] = useState(0)
  const [objectUrl, setObjectUrl] = useState<string | null>(null)
  const [crop, setCrop] = useState<Crop>()
  const [completedCrop, setCompletedCrop] = useState<PixelCrop | undefined>()
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const imgRef = useRef<HTMLImageElement>(null)

  const currentFile = files[index] ?? null

  useEffect(() => {
    if (!currentFile) return
    const url = URL.createObjectURL(currentFile)
    setObjectUrl(url)
    setCrop(undefined)
    setCompletedCrop(undefined)
    setError(null)
    return () => URL.revokeObjectURL(url)
  }, [currentFile])

  const onImageLoad = useCallback((e: React.SyntheticEvent<HTMLImageElement>) => {
    const { width, height } = e.currentTarget
    const initial = centerCrop(
      makeAspectCrop({ unit: '%', width: 90 }, 1, width, height),
      width,
      height,
    )
    setCrop(initial)
    // Seed completedCrop with pixel values so "Aplicar recorte" works even
    // if the user doesn't move the selection.
    const px: PixelCrop = {
      unit: 'px',
      x: (initial.x / 100) * width,
      y: (initial.y / 100) * height,
      width: (initial.width / 100) * width,
      height: (initial.height / 100) * height,
    }
    setCompletedCrop(px)
  }, [])

  const advance = useCallback(() => {
    if (index + 1 >= files.length) {
      onAllUploaded()
      onClose()
    } else {
      setIndex(i => i + 1)
    }
  }, [index, files.length, onAllUploaded, onClose])

  const uploadBlob = useCallback(async (blob: Blob, originalName: string) => {
    const formData = new FormData()
    const baseName = originalName.replace(/\.[^.]+$/, '')
    formData.append('file', blob, `${baseName}.jpg`)
    formData.append('name', baseName)
    const res = await fetch('/api/instagram/backgrounds', { method: 'POST', body: formData })
    if (!res.ok) {
      const data = await res.json().catch(() => ({}))
      throw new Error(data.error || 'Error subiendo fondo')
    }
  }, [])

  const handleApplyCrop = async () => {
    if (!currentFile || !imgRef.current || !completedCrop) return
    setBusy(true)
    setError(null)
    try {
      const blob = await cropImageToBlob(imgRef.current, completedCrop)
      await uploadBlob(blob, currentFile.name)
      advance()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error')
    } finally {
      setBusy(false)
    }
  }

  const handleUploadOriginal = async () => {
    if (!currentFile) return
    setBusy(true)
    setError(null)
    try {
      await uploadBlob(currentFile, currentFile.name)
      advance()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error')
    } finally {
      setBusy(false)
    }
  }

  const handleSkip = () => {
    if (busy) return
    advance()
  }

  if (!currentFile) return null

  return (
    <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4">
      <div className="bg-white rounded-xl shadow-xl w-full max-w-2xl max-h-[90vh] flex flex-col">
        <div className="flex items-center justify-between px-5 py-3 border-b border-gray-100">
          <div>
            <h3 className="text-sm font-semibold text-navy">
              Recortar fondo ({index + 1} / {files.length})
            </h3>
            <p className="text-xs text-gray-500 truncate max-w-md">{currentFile.name}</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={busy}
            className="text-gray-400 hover:text-gray-700 text-sm disabled:opacity-40"
            aria-label="Cerrar"
          >
            ✕
          </button>
        </div>

        <p className="px-5 py-2 text-xs text-gray-500 bg-gray-50 border-b border-gray-100">
          Arrastrá las esquinas para ajustar el recorte (1:1, formato Instagram).
        </p>

        <div className="flex-1 overflow-auto p-4 bg-gray-900 text-center">
          {objectUrl && (
            <ReactCrop
              crop={crop}
              onChange={(_pixel, percent) => setCrop(percent)}
              onComplete={c => setCompletedCrop(c)}
              aspect={1}
              keepSelection
              ruleOfThirds
              minWidth={50}
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                ref={imgRef}
                src={objectUrl}
                alt="Recortar fondo"
                onLoad={onImageLoad}
                style={{ maxHeight: '60vh', display: 'block' }}
              />
            </ReactCrop>
          )}
        </div>

        {error && (
          <div className="px-5 py-2 text-xs text-red-600 border-t border-red-100 bg-red-50">
            {error}
          </div>
        )}

        <div className="flex items-center justify-between gap-2 px-5 py-3 border-t border-gray-100">
          <button
            type="button"
            onClick={handleSkip}
            disabled={busy}
            className="text-xs px-3 py-1.5 text-gray-500 hover:text-gray-700 disabled:opacity-40"
          >
            Saltar
          </button>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={handleUploadOriginal}
              disabled={busy}
              className="text-xs px-3 py-1.5 border border-gray-200 rounded-lg text-gray-700 hover:bg-gray-50 disabled:opacity-40"
            >
              Subir original
            </button>
            <button
              type="button"
              onClick={handleApplyCrop}
              disabled={busy || !completedCrop}
              className="text-xs px-3 py-1.5 bg-navy text-cream font-semibold rounded-lg hover:bg-navy-light disabled:opacity-40"
            >
              {busy ? 'Subiendo…' : 'Aplicar recorte y subir'}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
