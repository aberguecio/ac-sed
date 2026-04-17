import { NextResponse } from 'next/server'
import { normalizeChileanPhone } from './phone-utils'

export const PUBLIC_PLAYER_SELECT = {
  id: true,
  name: true,
  position: true,
  number: true,
  photoUrl: true,
  bio: true,
  active: true,
  createdAt: true,
  statRitmo: true,
  statDisparo: true,
  statPase: true,
  statRegate: true,
  statDefensa: true,
  statFisico: true,
  leaguePlayerId: true,
  nicknames: true,
} as const

export type PlayerInput = {
  name?: string
  position?: string | null
  number?: number | null
  photoUrl?: string | null
  bio?: string | null
  active?: boolean
  statRitmo?: number | null
  statDisparo?: number | null
  statPase?: number | null
  statRegate?: number | null
  statDefensa?: number | null
  statFisico?: number | null
  phoneNumber?: string | null
  nicknames?: string[]
}

// Whitelist + normalización de input para create/update de Player.
// Devuelve un PlayerInput limpio o un Response (400) si la validación falla.
export function sanitizePlayerInput(body: Record<string, unknown>): PlayerInput | Response {
  const allowed: (keyof PlayerInput)[] = [
    'name', 'position', 'number', 'photoUrl', 'bio', 'active',
    'statRitmo', 'statDisparo', 'statPase', 'statRegate', 'statDefensa', 'statFisico',
    'phoneNumber', 'nicknames',
  ]
  const data: PlayerInput = {}
  for (const key of allowed) {
    if (key in body) {
      ;(data as Record<string, unknown>)[key] = body[key] as unknown
    }
  }

  if ('phoneNumber' in data) {
    const raw = data.phoneNumber
    if (raw == null || raw === '') {
      data.phoneNumber = null
    } else if (typeof raw === 'string') {
      const normalized = normalizeChileanPhone(raw)
      if (normalized == null) {
        return NextResponse.json({ error: 'Teléfono chileno inválido' }, { status: 400 })
      }
      data.phoneNumber = normalized
    } else {
      return NextResponse.json({ error: 'Teléfono chileno inválido' }, { status: 400 })
    }
  }

  if ('nicknames' in data) {
    const raw = data.nicknames
    if (!Array.isArray(raw)) {
      return NextResponse.json({ error: 'nicknames debe ser un array' }, { status: 400 })
    }
    const seen = new Set<string>()
    const cleaned: string[] = []
    for (const item of raw) {
      if (typeof item !== 'string') continue
      const trimmed = item.trim()
      if (!trimmed) continue
      const key = trimmed.toLowerCase()
      if (seen.has(key)) continue
      seen.add(key)
      cleaned.push(trimmed)
      if (cleaned.length >= 10) break
    }
    data.nicknames = cleaned
  }

  return data
}

export function isP2002(err: unknown): boolean {
  return (
    typeof err === 'object' &&
    err !== null &&
    'code' in err &&
    (err as { code?: string }).code === 'P2002'
  )
}
