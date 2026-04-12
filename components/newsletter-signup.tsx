'use client'

import { useState } from 'react'

export function NewsletterSignup() {
  const [email, setEmail] = useState('')
  const [status, setStatus] = useState<'idle' | 'loading' | 'success' | 'error'>('idle')
  const [message, setMessage] = useState('')

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setStatus('loading')
    try {
      const res = await fetch('/api/subscribe', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email }),
      })
      const data = await res.json()
      if (res.ok) {
        setStatus('success')
        setMessage(data.message)
        setEmail('')
      } else {
        setStatus('error')
        setMessage(data.error ?? 'Ocurrió un error, intenta de nuevo.')
      }
    } catch {
      setStatus('error')
      setMessage('Ocurrió un error, intenta de nuevo.')
    }
  }

  return (
    <div className="bg-navy rounded-2xl px-6 py-8 text-center max-w-xl mx-auto">
      <p className="text-wheat text-xs font-semibold uppercase tracking-widest mb-2">Newsletter</p>
      <h2 className="text-cream text-xl font-extrabold mb-2">Recibe las noticias en tu correo</h2>
      <p className="text-cream/60 text-sm mb-6">
        Suscríbete y te avisaremos cada vez que publiquemos una nueva nota.
      </p>

      {status === 'success' ? (
        <div className="bg-green-900/40 border border-green-500/30 rounded-lg px-4 py-3">
          <p className="text-green-300 text-sm font-medium">{message}</p>
        </div>
      ) : (
        <form onSubmit={handleSubmit} className="flex flex-col sm:flex-row gap-3">
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="tucorreo@ejemplo.com"
            required
            disabled={status === 'loading'}
            className="flex-1 rounded-lg px-4 py-2.5 text-sm bg-white/10 border border-white/20 text-cream placeholder-cream/40 focus:outline-none focus:ring-2 focus:ring-wheat/50 disabled:opacity-50"
          />
          <button
            type="submit"
            disabled={status === 'loading'}
            className="px-5 py-2.5 rounded-lg bg-wheat text-navy font-bold text-sm hover:bg-wheat-light disabled:opacity-50 whitespace-nowrap"
          >
            {status === 'loading' ? 'Enviando…' : 'Suscribirme'}
          </button>
        </form>
      )}

      {status === 'error' && (
        <p className="text-red-400 text-xs mt-3">{message}</p>
      )}
    </div>
  )
}
