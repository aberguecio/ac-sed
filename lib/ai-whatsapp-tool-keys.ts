// Plain metadata for the WhatsApp agent tools. Lives in its own file with
// zero runtime imports so that lib/ai-config.ts and the admin route can
// import the keys + descriptions without dragging the heavy
// ai-whatsapp-tools.ts module (which transitively imports lib/ai.ts and
// would create a circular dependency).

export const WHATSAPP_TOOL_KEYS = [
  'listMatches',
  'getMatchById',
  'getMatchDetails',
  'getMatchGoals',
  'getMatchAttendance',
  'getNextMatch',
  'getLastPlayedMatch',
  'listRoster',
  'searchPlayer',
  'getTopScorers',
  'getPlayerSeasonStats',
  'getHeadToHead',
  'getTeamCards',
  'listTournaments',
  'getTournamentInfo',
  'getCurrentStandings',
  'getRemainingFixtures',
  'getPromotionProjection',
] as const

export type WhatsappToolKey = (typeof WHATSAPP_TOOL_KEYS)[number]

export const WHATSAPP_TOOL_DESCRIPTIONS: Record<WhatsappToolKey, string> = {
  listMatches: 'Lista partidos con filtros (rival, estado, orden, límite).',
  getMatchById: 'Devuelve un partido por id con equipos, fecha, marcador, sede.',
  getMatchDetails: 'Detalle ampliado de un partido (goles, tarjetas, asistencia).',
  getMatchGoals: 'Goleadores y minutos de un partido.',
  getMatchAttendance: 'Confirmados / pendientes para un partido.',
  getNextMatch: 'Próximo partido no jugado (AC SED u otro equipo).',
  getLastPlayedMatch: 'Último partido jugado (AC SED u otro equipo).',
  listRoster: 'Lista de jugadores activos del plantel.',
  searchPlayer: 'Busca jugador por nombre/apodo (id, bio, teléfono).',
  getTopScorers: 'Goleadores top de un equipo o torneo.',
  getPlayerSeasonStats: 'Estadísticas del jugador en el torneo en curso.',
  getHeadToHead: 'Historial AC SED vs un rival.',
  getTeamCards: 'Tarjetas de un equipo y posibles suspensiones.',
  listTournaments: 'Lista torneos cargados (id, nombre, vigencia).',
  getTournamentInfo: 'Formato/reglas y fases del torneo.',
  getCurrentStandings: 'Tabla de posiciones actual.',
  getRemainingFixtures: 'Fixture restante de AC SED.',
  getPromotionProjection: 'Puntos actuales y proyectados por equipo.',
}
