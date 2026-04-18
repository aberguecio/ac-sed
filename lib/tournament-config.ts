// Reglas estructurales del torneo Liga B (siempre 6 equipos por fase, todos
// contra todos, 2 ascienden y 2 descienden). Se exponen como constantes para
// que el agente AI pueda razonar sobre escenarios sin tener que adivinar el
// formato. Si alguna fase llegara a tener reglas distintas, reemplazar este
// objeto por una búsqueda por tournamentId.

export const TOURNAMENT_RULES = {
  teamsPerPhase: 6,
  matchesPerTeamPerPhase: 5,
  promotionSlots: 2,
  relegationSlots: 2,
  format: 'round-robin' as const,
}

export type TournamentRules = typeof TOURNAMENT_RULES

export function getTournamentRules(): TournamentRules {
  return TOURNAMENT_RULES
}
