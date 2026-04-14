/**
 * AC SED team constants and utilities
 */

export const ACSED_TEAM_NAME = 'AC Sed'
export const ACSED_TEAM_ID = 2836

/**
 * Check if a team name belongs to AC SED
 * @param teamName - Team name to check
 * @returns true if team is AC SED
 */
export function isACSED(teamName: string | null | undefined): boolean {
  if (!teamName) return false
  return teamName === ACSED_TEAM_NAME
}
