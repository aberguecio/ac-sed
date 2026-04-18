# Player stats algorithm

Goal: replace the random 30–65 stat generator in `app/api/admin/players/generate/route.ts` with a
deterministic, FIFA-flavoured function. Also run it as an *update* job so stats evolve as new
Liga B data arrives.

## What EA actually does

- **Hybrid pipeline**: ~6,000 scouts + editors combined with Opta event data. No pure formula.
- **6 "face" stats** (PAC, SHO, PAS, DRI, DEF, PHY) are weighted averages of ~30 sub-stats.
- **OVR** is a linear weighted sum of the 6 faces, **weights depend on position** (ST weights SHO/PAC; CB weights DEF/PHY).
- **Career Mode growth** — closest analogue to our problem — auto-evolves a player via
  `(POT − OVR) × ageMultiplier × formMultiplier × minutesPlayedFactor`, gated by a minutes threshold.

Sources: EA Pitch Notes "How Player Ratings Are Decided", FIFPlay attribute/OVR guides,
FIFA Career-Mode community decompiles, Opta/Stats Perform partnership disclosures.

## Our data budget

From `MatchGoal` and `MatchCard` (scraped per-match) plus `Player.position`:

- `G` — goals in current phase (and lifetime, via historical records)
- `Y`, `R` — yellow / red cards
- `position` — Arquero | Defensa | Mediocampista | Delantero (manual)

We do **not** have: minutes, passes, shots, xG, assists, age. So anything age- or minutes-based
from Career Mode is skipped. "Appearances" is not reliably derivable (silent matches leave no trace).

## Design: priors + bounded deltas

Shrinkage-flavoured but simplified: every player starts at a **position prior** and observed
signals move the stat by **capped deltas**. Amateur realism cap at 94.

### Position priors (0–99)

```ts
const PRIORS = {
  Arquero:       { ritmo:50, disparo:25, pase:55, regate:45, defensa:70, fisico:65 },
  Defensa:       { ritmo:62, disparo:40, pase:58, regate:55, defensa:72, fisico:70 },
  Mediocampista: { ritmo:65, disparo:58, pase:70, regate:68, defensa:55, fisico:62 },
  Delantero:     { ritmo:72, disparo:75, pase:58, regate:70, defensa:35, fisico:65 },
}
```

(Unknown position → Mediocampista. Tune once we see real data.)

### Signals → deltas

```
goalsBoost(pos, G):
  Delantero:     min(G × 2, 18)   → + to disparo
                 min(G × 1, 10)   → + to regate, ritmo
  Mediocampista: min(G × 3, 15)   → + to disparo
                 min(G × 1.5, 8)  → + to regate, pase
  Defensa:       min(G × 4, 12)   → + to disparo (rare goals mean something)
                 min(G × 2, 6)    → + to pase
  Arquero:       ignore

cardPenalty(Y, R):
  raw = Y × 1.5 + R × 6
  return -min(raw, 15)            → − to defensa (discipline proxy)

volumePenalty(G, Y, R):
  events = G + Y + R
  if events === 0:  return -3     → − to all stats (no activity → shrink toward bench prior)
  else:             return 0
```

Rationale for the "no-events" shrinkage: a player in the roster with zero scraped events for a
full phase is almost certainly not playing. We don't drop them to prior-minus-a-lot; just a gentle
nudge so a genuinely new player doesn't sit at prior forever.

### Final stat

```
stat = clamp(prior + goalsBoost + cardPenalty + volumePenalty, 30, 94)
```

No age curve, no EWMA, no pseudocounts. Evidence bounds keep it stable on ~10 matches/phase.

### OVR (FIFA position weights)

```ts
const OVR_WEIGHTS = {
  Arquero:       { defensa:.30, fisico:.25, ritmo:.15, pase:.15, regate:.10, disparo:.05 },
  Defensa:       { defensa:.35, fisico:.25, ritmo:.10, pase:.10, regate:.10, disparo:.10 },
  Mediocampista: { pase:.25, regate:.20, disparo:.15, defensa:.15, fisico:.15, ritmo:.10 },
  Delantero:     { disparo:.25, ritmo:.20, regate:.20, fisico:.15, pase:.15, defensa:.05 },
}
ovr = clamp(round(Σ stat_i × w_i), 30, 90)
```

OVR isn't stored (no column). Either add `Player.overall Int?` or compute at read time — lean
toward computed.

## Where it plugs in

1. **Generation** — `app/api/admin/players/generate/route.ts` (line 39–52): replace
   `randomStat()` calls with one call into a new helper.
2. **Update** — new endpoint `POST /api/admin/players/recalc-stats` (or hook into
   `/api/scrape` after it finishes, gated so it only runs at phase-end to avoid flicker per
   Career Mode convention). Iterates active `Player`s with `leaguePlayerId`, aggregates goals
   + cards, writes new stats.
3. **Shared lib** — `lib/player-stats.ts` exports `computePlayerStats({position, goals,
   yellows, reds})` and `computeOverall(stats, position)`. Single file, <150 LOC.

## Tradeoffs

- **Simple & stable**: position prior dominates until signals accumulate; no one hits 99 after
  one hat-trick.
- **Not truly Bayesian**: deltas are capped constants rather than shrunk by sample size. Fine
  at amateur scale; revisit if we start tracking minutes.
- **GK handling**: treated like any other position via the Arquero prior + most boosts disabled.
  Real EA uses a different stat schema (Diving/Handling/…), but we keep the 6-face UI for
  consistency with the frontend.
- **Phase boundary recalc recommended** to prevent weekly flicker on the player cards.

## Next step

If approved, I'll add `lib/player-stats.ts`, wire it into the generate route, and add the
recalc endpoint + an admin button on `/admin/players` to trigger it.
