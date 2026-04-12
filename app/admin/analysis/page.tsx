'use client'

import { useState, useEffect } from 'react'

interface Analysis {
  id: number
  tournamentId: number
  stageId: number
  groupId: number
  content: string
  dataHash: string
  aiProvider: string
  generatedAt: string
}

const TOURNAMENTS = [
  { id: 201, name: 'Apertura 2026', stages: [{ id: 396, name: 'Fase 1' }] },
  { id: 191, name: 'Clausura 2025', stages: [
    { id: 371, name: 'Fase 1' },
    { id: 384, name: 'Fase 2' }
  ]},
  { id: 178, name: 'Apertura 2025', stages: [
    { id: 351, name: 'Fase 1' },
    { id: 360, name: 'Fase 2' }
  ]},
]

export default function AnalysisAdminPage() {
  const [analyses, setAnalyses] = useState<Analysis[]>([])
  const [loading, setLoading] = useState(false)
  const [regenerating, setRegenerating] = useState<number | null>(null)

  async function fetchAnalyses() {
    setLoading(true)
    try {
      const res = await fetch('/api/admin/analysis')
      const data = await res.json()
      setAnalyses(data)
    } catch (err) {
      console.error('Error fetching analyses:', err)
    }
    setLoading(false)
  }

  async function regenerateAnalysis(tournamentId: number, stageId: number) {
    const key = tournamentId * 1000 + stageId
    setRegenerating(key)

    try {
      const res = await fetch('/api/admin/analysis/regenerate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tournamentId, stageId }),
      })

      if (res.ok) {
        alert('Análisis regenerado exitosamente')
        fetchAnalyses()
      } else {
        alert('Error al regenerar análisis')
      }
    } catch (err) {
      alert('Error al regenerar análisis')
    }

    setRegenerating(null)
  }

  useEffect(() => {
    fetchAnalyses()
  }, [])

  const getTournamentName = (tournamentId: number, stageId: number) => {
    const tournament = TOURNAMENTS.find(t => t.id === tournamentId)
    const stage = tournament?.stages.find(s => s.id === stageId)
    return `${tournament?.name || 'Desconocido'} - ${stage?.name || 'Fase ?'}`
  }

  return (
    <div className="p-8">
      <h1 className="text-2xl font-extrabold text-navy mb-8">Gestión de Análisis</h1>

      {loading ? (
        <div className="text-center py-12">
          <div className="inline-block animate-spin rounded-full h-8 w-8 border-b-2 border-navy"></div>
        </div>
      ) : (
        <div className="space-y-6">
          {analyses.length === 0 ? (
            <p className="text-gray-400 text-center py-12">No hay análisis generados todavía</p>
          ) : (
            analyses.map((analysis) => {
              const key = analysis.tournamentId * 1000 + analysis.stageId
              const isRegenerating = regenerating === key

              return (
                <div key={analysis.id} className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
                  <div className="flex justify-between items-start mb-4">
                    <div>
                      <h3 className="font-bold text-navy text-lg">
                        {getTournamentName(analysis.tournamentId, analysis.stageId)}
                      </h3>
                      <p className="text-sm text-gray-500">
                        Generado: {new Date(analysis.generatedAt).toLocaleString('es-CL')}
                      </p>
                      <p className="text-xs text-gray-400">
                        Proveedor: {analysis.aiProvider} | Hash: {analysis.dataHash.slice(0, 8)}...
                      </p>
                    </div>
                    <button
                      onClick={() => regenerateAnalysis(analysis.tournamentId, analysis.stageId)}
                      disabled={isRegenerating}
                      className="bg-navy text-cream px-4 py-2 rounded-lg text-sm font-semibold hover:bg-navy-light transition-colors disabled:opacity-50"
                    >
                      {isRegenerating ? 'Regenerando...' : '🔄 Regenerar'}
                    </button>
                  </div>

                  <div className="bg-gray-50 rounded-lg p-4">
                    <p className="whitespace-pre-wrap text-sm text-gray-700">{analysis.content}</p>
                  </div>
                </div>
              )
            })
          )}
        </div>
      )}

      <div className="mt-8 bg-blue-50 border border-blue-200 rounded-lg p-4">
        <h3 className="font-semibold text-blue-800 mb-2">ℹ️ Información</h3>
        <ul className="text-sm text-blue-700 space-y-1 list-disc list-inside">
          <li>Los análisis se generan automáticamente cuando cambian los datos</li>
          <li>El hash identifica cambios en standings, partidos o goleadores</li>
          <li>Regenerar forzará un nuevo análisis aunque los datos no hayan cambiado</li>
          <li>Los análisis se muestran en la página de Estadísticas</li>
        </ul>
      </div>
    </div>
  )
}