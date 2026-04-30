// Centralized weights and tunable constants for the predictive model.
// Adjust here without touching algorithm code. Calibrate empirically by
// back-testing against finished tournaments (see plan verification step 3).

export const WEIGHTS = {
  // Temporal decay: weight = 0.5 ^ (monthsAgo / halfLifeMonths)
  // 12 months => weight 0.5; 24 months => 0.25.
  halfLifeMonths: 12,

  // Multiplier applied to matches that fall in the currently active stage.
  currentPhaseBoost: 1.5,

  // Window for "recent form" metrics (matches, any tournament).
  recentFormWindow: 5,
  recentFormShortWindow: 3,

  // Pythagorean exponent (Bill James base; calibrated x for football is ~1.83).
  pythagoreanExponent: 1.83,

  // Window for volatility (stddev of GD per match).
  volatilityWindow: 10,

  // Logistic regression coefficients. Sign convention: positive => favors AC SED.
  beta: {
    intercept: 0.05, // slight home-baseline bias toward AC SED voice
    h2hWeightedScore: 0.30, // [-1..1]
    commonOppOutcomeDelta: 0.40, // qualitative diff: did we win where they lost?
    commonOppGdDelta: 0.15, // magnitude diff: by how much did each side beat them?
    commonOppL2Delta: 0.10, // second-derivative: smaller weight on purpose
    formDiff: 0.15, // points-ratio diff [-1..1]
    pythDiff: 0.10, // expected win% diff [-1..1]
    sosDiff: 0.05, // PPG diff [-3..3]
    ppgDiff: 0.10, // current standings PPG diff [-3..3]
    rivalVolatilityPenalty: 0.05, // rival GD stddev (positive => rival erratic, slight ACSED edge)
  },

  // Draw probability is taken as a fixed slice around the win/loss boundary.
  // Smaller = sharper W/L predictions; bigger = more "draws".
  drawSpread: 0.18,

  // Confidence components. Final confidence = clamp(0..1) of weighted sum.
  confidence: {
    minSamplesForFull: 8, // h2h + common opponents combined
    volatilityPenalty: 0.05, // per unit stddev above 1.5
  },

  // Goal-scorer concentration threshold for insight generation (HHI).
  highHHI: 0.35,

  // Recent reds threshold to flag.
  redsLastNMatches: 3,
}

export type Weights = typeof WEIGHTS
