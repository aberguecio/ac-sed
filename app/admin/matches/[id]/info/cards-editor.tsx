'use client'

import { useState } from 'react'

interface Card {
  id: number
  leaguePlayerId: number
  cardType: string
  minute: number | null
  reason: string | null
  teamName: string
  scrapedPlayer: { id: number; firstName: string; lastName: string }
}

interface Player {
  id: number
  name: string
  number: number | null
  leaguePlayerId: number | null
}

interface CardsEditorProps {
  cards: Card[]
  players: Player[]
}

export function CardsEditor({ cards, players }: CardsEditorProps) {
  const [cardPlayers, setCardPlayers] = useState<Map<number, number>>(
    new Map(cards.map(c => [c.id, c.leaguePlayerId])),
  )
  const [saving, setSaving] = useState<number | null>(null)
  const [messages, setMessages] = useState<Map<number, { type: 'success' | 'error'; text: string }>>(
    new Map(),
  )

  const handlePlayerChange = async (cardId: number, leaguePlayerId: number) => {
    setCardPlayers(prev => new Map(prev).set(cardId, leaguePlayerId))
    setSaving(cardId)
    setMessages(prev => {
      const next = new Map(prev)
      next.delete(cardId)
      return next
    })

    try {
      const res = await fetch(`/api/admin/match-cards/${cardId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ leaguePlayerId }),
      })

      if (!res.ok) {
        const data = await res.json()
        throw new Error(data.error || 'Error al guardar')
      }

      setMessages(prev => new Map(prev).set(cardId, { type: 'success', text: '✓ Guardado' }))
      setTimeout(() => {
        setMessages(prev => {
          const next = new Map(prev)
          next.delete(cardId)
          return next
        })
      }, 2000)
    } catch (err) {
      setMessages(prev =>
        new Map(prev).set(cardId, {
          type: 'error',
          text: err instanceof Error ? err.message : 'Error',
        }),
      )
    } finally {
      setSaving(null)
    }
  }

  return (
    <div className="space-y-4">
      {cards.map(card => {
        const scraperPlayer = `${card.scrapedPlayer.firstName} ${card.scrapedPlayer.lastName}`
        const currentPlayer = cardPlayers.get(card.id)
        const message = messages.get(card.id)
        const isSaving = saving === card.id
        const isRed = card.cardType === 'red'

        return (
          <div
            key={card.id}
            className="border border-gray-200 rounded-lg p-4 hover:border-gray-300 transition-colors"
          >
            <div className="space-y-3">
              <div className="flex items-center gap-2 pb-2 border-b border-gray-100">
                <span className="text-lg">{isRed ? '🟥' : '🟨'}</span>
                <div>
                  <div className="text-xs text-gray-500">
                    {card.teamName}
                    {card.minute != null ? ` · min ${card.minute}'` : ''}
                    {card.reason ? ` · ${card.reason}` : ''}
                  </div>
                  <div className="text-xs text-gray-400">Scraper detectó: {scraperPlayer}</div>
                </div>
              </div>

              <div className="flex items-center gap-3">
                <label
                  htmlFor={`card-${card.id}`}
                  className="text-sm text-gray-600 whitespace-nowrap w-24"
                >
                  Jugador:
                </label>
                <select
                  id={`card-${card.id}`}
                  value={currentPlayer}
                  onChange={e => handlePlayerChange(card.id, parseInt(e.target.value))}
                  disabled={isSaving}
                  className="flex-1 border border-gray-200 rounded px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-navy/20 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {players
                    .filter(p => p.leaguePlayerId)
                    .map(player => (
                      <option key={player.leaguePlayerId} value={player.leaguePlayerId!}>
                        {player.number ? `#${player.number} ` : ''}
                        {player.name}
                      </option>
                    ))}
                </select>
              </div>

              {message && (
                <div className="text-center pt-2">
                  <span
                    className={`text-xs ${
                      message.type === 'success' ? 'text-green-600' : 'text-red-600'
                    }`}
                  >
                    {message.text}
                  </span>
                </div>
              )}
            </div>
          </div>
        )
      })}
    </div>
  )
}
