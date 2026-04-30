// Shared types for the scouting / pre-match prediction module.

export interface MatchLite {
  id: number
  date: Date
  tournamentId: number | null
  stageId: number | null
  groupId: number | null
  homeTeamId: number | null
  awayTeamId: number | null
  homeScore: number | null
  awayScore: number | null
}

export interface H2HMatch {
  matchId: number
  date: Date
  acsedScore: number
  rivalScore: number
  result: 'W' | 'D' | 'L'
  weight: number
  isCurrentPhase: boolean
}

export interface HeadToHeadResult {
  sampleSize: number
  weightedSampleSize: number
  winRate: number
  drawRate: number
  lossRate: number
  avgGD: number
  weightedScore: number // in [-1, 1]: positive = ACSED dominates
  matches: H2HMatch[]
}

export interface CommonOpponentRow {
  opponentId: number
  opponentName: string
  acsedGD: number // weighted avg goal differential
  rivalGD: number
  gdDelta: number // acsedGD - rivalGD
  acsedOutcome: number // weighted avg outcome (W=+1, D=0, L=-1)
  rivalOutcome: number
  outcomeDelta: number // acsedOutcome - rivalOutcome (range [-2, +2])
  weight: number
  acsedSamples: number
  rivalSamples: number
}

export interface CommonOpponentsResult {
  opponents: CommonOpponentRow[]
  meanGdDelta: number
  weightedMeanGdDelta: number
  weightedMeanOutcomeDelta: number
  totalCommonOpponents: number
}

export interface SecondaryOpponentRow {
  opponentId: number
  opponentName: string
  yGD: number // Y's weighted GD vs this opponent
  weight: number
}

export interface CommonOpponentL2Row {
  yId: number
  yName: string
  yImpliedRating: number // mean weighted GD of Y vs all its other rivals
  secondaryOpponents: SecondaryOpponentRow[]
}

export interface CommonOpponentsL2Result {
  rows: CommonOpponentL2Row[]
  // Aggregated bias toward team A (positive => the common opponents A faced
  // tend to also be tougher overall, signaling A's wins are more meaningful).
  weightedSecondaryDelta: number
  totalSecondaryOpponents: number
}

export type FormResult = 'W' | 'D' | 'L'

export interface RecentFormTeam {
  results: FormResult[]
  pointsRatio: number // points / maxPoints in window
  avgGD: number
  currentStreak: { type: FormResult; length: number } | null
  trend: number // -1..1, positive = improving over the window
}

export interface RecentFormResult {
  acsed: RecentFormTeam
  rival: RecentFormTeam
  windowSize: number
}

export interface PythagoreanTeam {
  expectedWinPct: number
  actualWinPct: number
  delta: number // actual - expected (positive = over-performing)
  goalsFor: number
  goalsAgainst: number
  played: number
}

export interface PythagoreanResult {
  acsed: PythagoreanTeam
  rival: PythagoreanTeam
}

export interface StrengthOfScheduleResult {
  sosACSED: number // mean PPG of opponents already faced in current phase
  sosRival: number
  diff: number // sosACSED - sosRival
}

export interface VolatilityResult {
  acsedStdDev: number
  rivalStdDev: number
  diff: number // rival - acsed (rival more erratic = positive)
}

export interface DisciplineResult {
  acsedAvgCards: number
  rivalAvgCards: number
  rivalRecentReds: number
  acsedRecentReds: number
}

export interface TopScorer {
  playerName: string
  goals: number
  share: number // 0..1, fraction of team goals
}

export interface ScorersResult {
  acsedTop: TopScorer[]
  rivalTop: TopScorer[]
  acsedHHI: number // 0..1
  rivalHHI: number
}

export interface CurrentStandingsRow {
  teamName: string
  position: number
  played: number
  points: number
  goalsFor: number
  goalsAgainst: number
  goalDifference: number
  ppg: number // points per game
}

export interface CurrentStandingsResult {
  acsed: CurrentStandingsRow | null
  rival: CurrentStandingsRow | null
  ppgDiff: number // acsed - rival
  table: CurrentStandingsRow[]
}

export interface PredictionResult {
  pWin: number
  pDraw: number
  pLoss: number
  expectedGD: number
  confidence: number // 0..1
  features: Record<string, number> // raw inputs that fed the model, for debugging
  betas: Record<string, number> // coefficients used (snapshot of WEIGHTS.beta)
  intercept: number
  logit: number
}

export interface ScoutingInsight {
  text: string
  weight: number // magnitude used for ordering
  category:
    | 'h2h'
    | 'common'
    | 'commonL2'
    | 'form'
    | 'pyth'
    | 'sos'
    | 'standings'
    | 'volatility'
    | 'discipline'
    | 'scorers'
}

export interface PendingMatchPrediction {
  matchId: number
  date: string // ISO
  homeTeam: { id: number; name: string; logoUrl: string | null }
  awayTeam: { id: number; name: string; logoUrl: string | null }
  pHomeWin: number
  pDraw: number
  pAwayWin: number
  expectedGD: number // home perspective
  predictedHome: number
  predictedAway: number
  scoreDerivation?: {
    homeGFperMatch: number
    homeGAperMatch: number
    awayGFperMatch: number
    awayGAperMatch: number
    expectedHomeGoals: number
    expectedAwayGoals: number
  }
}

export interface ProjectedStandingRow {
  teamId: number
  teamName: string
  logoUrl: string | null
  played: number
  won: number
  drawn: number
  lost: number
  goalsFor: number
  goalsAgainst: number
  goalDifference: number
  points: number
  position: number
  // From the played-only baseline, for the diff vs projected.
  basePosition: number
  basePoints: number
}

export interface PhaseProjectionResult {
  pendingMatches: PendingMatchPrediction[]
  projectedStandings: ProjectedStandingRow[]
  baselineStandings: ProjectedStandingRow[] // played-only
}

export interface ScoutingBundle {
  acsed: { id: number; name: string; logoUrl: string | null }
  rival: { id: number; name: string; logoUrl: string | null }
  context: {
    tournamentId: number
    stageId: number
    groupId: number
    asOfDate: string // ISO
    nextMatch: { id: number; date: string } | null
  }
  headToHead: HeadToHeadResult
  commonOpponents: CommonOpponentsResult
  commonOpponentsL2: CommonOpponentsL2Result
  recentForm: RecentFormResult
  pythagorean: PythagoreanResult
  strengthOfSchedule: StrengthOfScheduleResult
  volatility: VolatilityResult
  discipline: DisciplineResult
  scorers: ScorersResult
  currentStandings: CurrentStandingsResult
  prediction: PredictionResult
  insights: ScoutingInsight[]
}
