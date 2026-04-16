import sharp from 'sharp'
import path from 'path'
import { promises as fs } from 'fs'
import {
  type TeamInfo,
  getTeamLogo,
  createPlaceholderLogo,
} from './vs-image-generator'
import { isACSED } from './team-utils'

export type { TeamInfo }

// Brand colors
const NAVY = '#1B2B4B'
const CREAM = '#FAF7F0'
const WHEAT = '#C8A96E'
const WHEAT_LIGHT = '#D4BA8A'

const SIZE = 1080

// --- Helpers ---

async function loadBackground(source: string | Buffer): Promise<Buffer> {
  let buf: Buffer
  if (Buffer.isBuffer(source)) {
    buf = source
  } else if (source.startsWith('http')) {
    const res = await fetch(source)
    if (!res.ok) throw new Error(`Failed to fetch background: ${res.status}`)
    buf = Buffer.from(await res.arrayBuffer())
  } else {
    buf = await fs.readFile(source)
  }
  return sharp(buf)
    .resize(SIZE, SIZE, { fit: 'cover' })
    .jpeg({ quality: 95 })
    .toBuffer()
}

function escapeXml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;')
}

async function getAcsedLogo(): Promise<Buffer | null> {
  try {
    const p = path.join(process.cwd(), 'public', 'ACSED-transaparent.webp')
    return await fs.readFile(p)
  } catch {
    try {
      return await fs.readFile(path.join(process.cwd(), 'public', 'ACSED.webp'))
    } catch {
      return null
    }
  }
}

async function getBeersIcon(): Promise<Buffer | null> {
  try {
    const p = path.join(process.cwd(), 'public', 'salud.png')
    return await fs.readFile(p)
  } catch {
    return null
  }
}

async function processLogo(buf: Buffer, size: number): Promise<Buffer> {
  return sharp(buf)
    .resize(size, size, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } })
    .png()
    .toBuffer()
}

function getDefaultTemplatePath(): string {
  return path.join(process.cwd(), 'public', 'team-1.webp')
}

// --- Shared SVG fragments ---

function svgTitle(title: string): string {
  return `
    <text x="${SIZE / 2}" y="115" font-family="Arial" font-size="42" font-weight="bold"
          fill="${WHEAT}" text-anchor="middle" letter-spacing="6">${escapeXml(title)}</text>
    <rect x="100" y="135" width="${SIZE - 200}" height="3" fill="${WHEAT}" opacity="0.6"/>
  `
}

function svgFooter(): string {
  return `
    <rect x="100" y="${SIZE - 150}" width="${SIZE - 200}" height="3" fill="${WHEAT}" opacity="0.6"/>
    <text x="${SIZE / 2}" y="${SIZE - 120}" font-family="Arial" font-size="18"
          fill="${WHEAT_LIGHT}" text-anchor="middle" letter-spacing="3" opacity="0.8">
      AC SED | LIGA B
    </text>
  `
}

async function getFooterLogo(): Promise<{ logo: Buffer; top: number; left: number } | null> {
  const raw = await getAcsedLogo()
  if (!raw) return null
  const logo = await processLogo(raw, 90)
  return { logo, top: SIZE - 100, left: Math.floor(SIZE / 2 - 45) }
}

// --- Result Image (Score overlay) ---

export async function generateResultImage(
  background: string | Buffer | null,
  homeTeam: TeamInfo,
  awayTeam: TeamInfo
): Promise<Buffer> {
  const bg = await loadBackground(background || getDefaultTemplatePath())
  const logoSize = 240

  const [homeLogoRaw, awayLogoRaw, beersIconRaw, footerLogo] = await Promise.all([
    getTeamLogo(homeTeam).then(b => b || createPlaceholderLogo(homeTeam.name)),
    getTeamLogo(awayTeam).then(b => b || createPlaceholderLogo(awayTeam.name)),
    getBeersIcon(),
    getFooterLogo(),
  ])

  const [homeLogo, awayLogo] = await Promise.all([
    processLogo(homeLogoRaw, logoSize),
    processLogo(awayLogoRaw, logoSize),
  ])

  const beersIcon = beersIconRaw
    ? await processLogo(beersIconRaw, 50)
    : null

  const homeScore = homeTeam.score ?? 0
  const awayScore = awayTeam.score ?? 0

  // Determine result headline
  let headline = 'RESULTADO'
  const acsedIsHome = isACSED(homeTeam.name)
  const acsedScore = acsedIsHome ? homeScore : awayScore
  const rivalScore = acsedIsHome ? awayScore : homeScore
  if (acsedScore > rivalScore) headline = 'OBLIGADOS A CELEBRAR'
  else if (acsedScore < rivalScore) headline = 'HABRÁ QUE PASAR LAS PENAS'
  else if (homeTeam.score !== null && awayTeam.score !== null) headline = 'TENEMOS SED DE MÁS'

  // Corner accent length
  const cLen = 60
  const cOff = 50 // offset from edge
  const cW = 3    // stroke width

  const overlay = `
    <svg width="${SIZE}" height="${SIZE}" xmlns="http://www.w3.org/2000/svg">
      <defs>
        <!-- Radial gradient: darker center for score readability, lighter edges to show background -->
        <radialGradient id="grad" cx="50%" cy="50%" r="70%">
          <stop offset="0%" stop-color="${NAVY}" stop-opacity="0.8"/>
          <stop offset="100%" stop-color="${NAVY}" stop-opacity="0.5"/>
        </radialGradient>
      </defs>

      <!-- Gradient overlay -->
      <rect width="${SIZE}" height="${SIZE}" fill="url(#grad)"/>

      <!-- Corner accents (top-left) -->
      <line x1="${cOff}" y1="${cOff}" x2="${cOff + cLen}" y2="${cOff}" stroke="${WHEAT}" stroke-width="${cW}" opacity="0.7"/>
      <line x1="${cOff}" y1="${cOff}" x2="${cOff}" y2="${cOff + cLen}" stroke="${WHEAT}" stroke-width="${cW}" opacity="0.7"/>
      <!-- Corner accents (top-right) -->
      <line x1="${SIZE - cOff}" y1="${cOff}" x2="${SIZE - cOff - cLen}" y2="${cOff}" stroke="${WHEAT}" stroke-width="${cW}" opacity="0.7"/>
      <line x1="${SIZE - cOff}" y1="${cOff}" x2="${SIZE - cOff}" y2="${cOff + cLen}" stroke="${WHEAT}" stroke-width="${cW}" opacity="0.7"/>
      <!-- Corner accents (bottom-left) -->
      <line x1="${cOff}" y1="${SIZE - cOff}" x2="${cOff + cLen}" y2="${SIZE - cOff}" stroke="${WHEAT}" stroke-width="${cW}" opacity="0.7"/>
      <line x1="${cOff}" y1="${SIZE - cOff}" x2="${cOff}" y2="${SIZE - cOff - cLen}" stroke="${WHEAT}" stroke-width="${cW}" opacity="0.7"/>
      <!-- Corner accents (bottom-right) -->
      <line x1="${SIZE - cOff}" y1="${SIZE - cOff}" x2="${SIZE - cOff - cLen}" y2="${SIZE - cOff}" stroke="${WHEAT}" stroke-width="${cW}" opacity="0.7"/>
      <line x1="${SIZE - cOff}" y1="${SIZE - cOff}" x2="${SIZE - cOff}" y2="${SIZE - cOff - cLen}" stroke="${WHEAT}" stroke-width="${cW}" opacity="0.7"/>

      ${svgTitle('RESULTADO')}

      <!-- Score (+300) -->
      <text x="${SIZE / 2 - 85}" y="560" font-family="Arial" font-size="120"
            font-weight="bold" fill="${CREAM}" text-anchor="middle">${homeScore}</text>
      <text x="${SIZE / 2}" y="540" font-family="Arial" font-size="44"
            font-weight="bold" fill="${WHEAT}" text-anchor="middle" opacity="0.8">-</text>
      <text x="${SIZE / 2 + 85}" y="560" font-family="Arial" font-size="120"
            font-weight="bold" fill="${CREAM}" text-anchor="middle">${awayScore}</text>

      <!-- Team names (+200) -->
      <text x="${SIZE / 2 - 270}" y="670" font-family="Arial" font-size="34"
            font-weight="bold" fill="${CREAM}" text-anchor="middle">
        ${escapeXml(homeTeam.name.toUpperCase())}
      </text>
      <text x="${SIZE / 2 + 270}" y="670" font-family="Arial" font-size="34"
            font-weight="bold" fill="${CREAM}" text-anchor="middle">
        ${escapeXml(awayTeam.name.toUpperCase())}
      </text>

      <!-- Subtitle phrase (+200) -->
      <text x="${SIZE / 2}" y="760" font-family="Arial" font-size="28"
            fill="${WHEAT}" text-anchor="middle" letter-spacing="3" opacity="0.9">
        ${escapeXml(headline)}
      </text>

      ${svgFooter()}
    </svg>
  `

  const overlaySvg = Buffer.from(overlay)

  const composites: sharp.OverlayOptions[] = [
    { input: overlaySvg, top: 0, left: 0 },
    // Home team logo (+200)
    {
      input: homeLogo,
      top: 370,
      left: Math.floor(SIZE / 2 - 270 - logoSize / 2),
    },
    // Away team logo (+200)
    {
      input: awayLogo,
      top: 370,
      left: Math.floor(SIZE / 2 + 270 - logoSize / 2),
    },
  ]

  // Beers icons flanking the subtitle phrase (y=760, 50px icons)
  if (beersIcon) {
    composites.push(
      { input: beersIcon, top: 718, left: 200 },
      { input: beersIcon, top: 718, left: SIZE - 200 - 50 },
    )
  }

  if (footerLogo) {
    composites.push({ input: footerLogo.logo, top: footerLogo.top, left: footerLogo.left })
  }

  return sharp(bg)
    .composite(composites)
    .jpeg({ quality: 90 })
    .toBuffer()
}

// --- Standings Image ---

interface StandingsRow {
  position: number
  teamName: string
  played: number
  won: number
  drawn: number
  lost: number
  points: number
  isACSED: boolean
}

interface ScorerInfo {
  name: string
  goals: number
  minute?: number | null
}

export async function generateStandingsImage(
  background: string | Buffer | null,
  standings: StandingsRow[],
  scorers: ScorerInfo[]
): Promise<Buffer> {
  const [bg, footerLogo] = await Promise.all([
    loadBackground(background || getDefaultTemplatePath()),
    getFooterLogo(),
  ])

  // Table pushed down: header at 130, gap before first row
  const rowHeight = 42
  const tableStartY = 250
  const headerY = 195

  // Column positions
  const colPos = { pos: 120, name: 170, pj: 620, pg: 690, pe: 760, pp: 830, pts: 920 }

  let tableRows = ''
  standings.forEach((row, i) => {
    const y = tableStartY + i * rowHeight
    const rowBg = row.isACSED
      ? `<rect x="80" y="${y - 28}" width="${SIZE - 160}" height="${rowHeight}" rx="4" fill="${WHEAT}" opacity="0.3"/>`
      : ''
    const textColor = row.isACSED ? WHEAT : CREAM
    const weight = row.isACSED ? 'bold' : 'normal'

    tableRows += `
      ${rowBg}
      <text x="${colPos.pos}" y="${y}" font-family="Arial" font-size="20" fill="${textColor}" font-weight="${weight}" text-anchor="middle">${row.position}</text>
      <text x="${colPos.name}" y="${y}" font-family="Arial" font-size="20" fill="${textColor}" font-weight="${weight}">${escapeXml(row.teamName)}</text>
      <text x="${colPos.pj}" y="${y}" font-family="Arial" font-size="20" fill="${textColor}" font-weight="${weight}" text-anchor="middle">${row.played}</text>
      <text x="${colPos.pg}" y="${y}" font-family="Arial" font-size="20" fill="${textColor}" font-weight="${weight}" text-anchor="middle">${row.won}</text>
      <text x="${colPos.pe}" y="${y}" font-family="Arial" font-size="20" fill="${textColor}" font-weight="${weight}" text-anchor="middle">${row.drawn}</text>
      <text x="${colPos.pp}" y="${y}" font-family="Arial" font-size="20" fill="${textColor}" font-weight="${weight}" text-anchor="middle">${row.lost}</text>
      <text x="${colPos.pts}" y="${y}" font-family="Arial" font-size="22" fill="${textColor}" font-weight="bold" text-anchor="middle">${row.points}</text>
    `
  })

  // Scorers section
  const scorersStartY = tableStartY + standings.length * rowHeight + 60
  let scorersSection = ''
  if (scorers.length > 0) {
    scorersSection = `
      <rect x="80" y="${scorersStartY - 10}" width="${SIZE - 160}" height="3" fill="${WHEAT}" opacity="0.4"/>
      <text x="${SIZE / 2}" y="${scorersStartY + 35}" font-family="Arial" font-size="24" font-weight="bold"
            fill="${WHEAT}" text-anchor="middle" letter-spacing="4">GOLEADORES</text>
    `
    scorers.forEach((scorer, i) => {
      const y = scorersStartY + 75 + i * 36
      const minuteStr = scorer.minute ? ` (${scorer.minute}')` : ''
      scorersSection += `
        <text x="200" y="${y}" font-family="Arial" font-size="20" fill="${CREAM}">
          ${escapeXml(scorer.name)}${minuteStr}
        </text>
        <text x="${SIZE - 200}" y="${y}" font-family="Arial" font-size="20" fill="${WHEAT}" font-weight="bold" text-anchor="end">
          ${scorer.goals} ${scorer.goals === 1 ? 'gol' : 'goles'}
        </text>
      `
    })
  }

  const overlay = `
    <svg width="${SIZE}" height="${SIZE}" xmlns="http://www.w3.org/2000/svg">
      <rect width="${SIZE}" height="${SIZE}" fill="${NAVY}" opacity="0.82"/>

      ${svgTitle('TABLA DE POSICIONES')}

      <!-- Table column headers (bigger, bolder) -->
      <text x="${colPos.pos}" y="${headerY}" font-family="Arial" font-size="20" fill="${WHEAT}" font-weight="bold" text-anchor="middle">#</text>
      <text x="${colPos.name}" y="${headerY}" font-family="Arial" font-size="20" fill="${WHEAT}" font-weight="bold">Equipo</text>
      <text x="${colPos.pj}" y="${headerY}" font-family="Arial" font-size="20" fill="${WHEAT}" font-weight="bold" text-anchor="middle">PJ</text>
      <text x="${colPos.pg}" y="${headerY}" font-family="Arial" font-size="20" fill="${WHEAT}" font-weight="bold" text-anchor="middle">G</text>
      <text x="${colPos.pe}" y="${headerY}" font-family="Arial" font-size="20" fill="${WHEAT}" font-weight="bold" text-anchor="middle">E</text>
      <text x="${colPos.pp}" y="${headerY}" font-family="Arial" font-size="20" fill="${WHEAT}" font-weight="bold" text-anchor="middle">P</text>
      <text x="${colPos.pts}" y="${headerY}" font-family="Arial" font-size="20" fill="${WHEAT}" font-weight="bold" text-anchor="middle">Pts</text>

      <rect x="80" y="${headerY + 12}" width="${SIZE - 160}" height="1" fill="${CREAM}" opacity="0.3"/>

      ${tableRows}

      ${scorersSection}

      ${svgFooter()}
    </svg>
  `

  const composites: sharp.OverlayOptions[] = [
    { input: Buffer.from(overlay), top: 0, left: 0 },
  ]

  if (footerLogo) {
    composites.push({ input: footerLogo.logo, top: footerLogo.top, left: footerLogo.left })
  }

  return sharp(bg)
    .composite(composites)
    .jpeg({ quality: 90 })
    .toBuffer()
}

// --- Promo Image (upcoming match) ---

export async function generatePromoImage(
  background: string | Buffer | null,
  homeTeam: TeamInfo,
  awayTeam: TeamInfo,
  matchDate: Date,
  venue?: string | null
): Promise<Buffer> {
  const bg = await loadBackground(background || getDefaultTemplatePath())
  const logoSize = 260

  const [homeLogoRaw, awayLogoRaw, footerLogo] = await Promise.all([
    getTeamLogo(homeTeam).then(b => b || createPlaceholderLogo(homeTeam.name)),
    getTeamLogo(awayTeam).then(b => b || createPlaceholderLogo(awayTeam.name)),
    getFooterLogo(),
  ])

  const [homeLogo, awayLogo] = await Promise.all([
    processLogo(homeLogoRaw, logoSize),
    processLogo(awayLogoRaw, logoSize),
  ])

  const dateStr = matchDate.toLocaleDateString('es-CL', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
  }).toUpperCase()

  const timeStr = matchDate.toLocaleTimeString('es-CL', {
    hour: '2-digit',
    minute: '2-digit',
  })

  const venueStr = venue ? escapeXml(venue.toUpperCase()) : ''

  // Logos + names zone centered vertically but shifted up
  const centerY = SIZE / 2 - 60

  const overlay = `
    <svg width="${SIZE}" height="${SIZE}" xmlns="http://www.w3.org/2000/svg">
      <rect width="${SIZE}" height="${SIZE}" fill="${NAVY}" opacity="0.75"/>

      <!-- Header -->
      <text x="${SIZE / 2}" y="70" font-family="Arial" font-size="24" font-weight="bold"
            fill="${WHEAT}" text-anchor="middle" letter-spacing="4" opacity="0.7">ESTA NOCHE</text>
      ${svgTitle('AC SED')}

      <!-- VS -->
      <text x="${SIZE / 2}" y="${centerY + 15}" font-family="Arial" font-size="56"
            font-weight="bold" fill="${WHEAT}" text-anchor="middle">VS</text>

      <!-- Team names (bigger) -->
      <text x="${SIZE / 2 - 260}" y="${centerY + 195}" font-family="Arial" font-size="30"
            font-weight="bold" fill="${CREAM}" text-anchor="middle">
        ${escapeXml(homeTeam.name.toUpperCase())}
      </text>
      <text x="${SIZE / 2 + 260}" y="${centerY + 195}" font-family="Arial" font-size="30"
            font-weight="bold" fill="${CREAM}" text-anchor="middle">
        ${escapeXml(awayTeam.name.toUpperCase())}
      </text>

      <!-- Date & time (bigger) -->
      <text x="${SIZE / 2}" y="${SIZE - 250}" font-family="Arial" font-size="28"
            fill="${CREAM}" text-anchor="middle" font-weight="bold">${escapeXml(dateStr)}</text>
      <text x="${SIZE / 2}" y="${SIZE - 205}" font-family="Arial" font-size="38"
            font-weight="bold" fill="${WHEAT}" text-anchor="middle">${timeStr} HRS</text>
      ${venueStr ? `<text x="${SIZE / 2}" y="${SIZE - 168}" font-family="Arial" font-size="24" fill="${CREAM}" text-anchor="middle" opacity="0.9" font-weight="bold">${venueStr}</text>` : ''}

      ${svgFooter()}
    </svg>
  `

  const composites: sharp.OverlayOptions[] = [
    { input: Buffer.from(overlay), top: 0, left: 0 },
    {
      input: homeLogo,
      top: Math.floor(centerY - logoSize / 2 - 50),
      left: Math.floor(SIZE / 2 - 260 - logoSize / 2),
    },
    {
      input: awayLogo,
      top: Math.floor(centerY - logoSize / 2 - 50),
      left: Math.floor(SIZE / 2 + 260 - logoSize / 2),
    },
  ]

  if (footerLogo) {
    composites.push({ input: footerLogo.logo, top: footerLogo.top, left: footerLogo.left })
  }

  return sharp(bg)
    .composite(composites)
    .jpeg({ quality: 90 })
    .toBuffer()
}

// --- Custom overlay on any background ---

export async function composeCustomImage(
  background: string | Buffer
): Promise<Buffer> {
  const [bg, footerLogo] = await Promise.all([
    loadBackground(background),
    getFooterLogo(),
  ])

  const overlay = `
    <svg width="${SIZE}" height="${SIZE}" xmlns="http://www.w3.org/2000/svg">
      <rect width="${SIZE}" height="${SIZE}" fill="${NAVY}" opacity="0.35"/>
      ${svgFooter()}
    </svg>
  `

  const composites: sharp.OverlayOptions[] = [
    { input: Buffer.from(overlay), top: 0, left: 0 },
  ]

  if (footerLogo) {
    composites.push({ input: footerLogo.logo, top: footerLogo.top, left: footerLogo.left })
  }

  return sharp(bg)
    .composite(composites)
    .jpeg({ quality: 90 })
    .toBuffer()
}

// --- List available templates ---

export async function listTemplates(): Promise<string[]> {
  const templatesDir = path.join(process.cwd(), 'public', 'ig-templates')
  try {
    const files = await fs.readdir(templatesDir)
    return files
      .filter(f => /\.(jpg|jpeg|png|webp)$/i.test(f))
      .map(f => `/ig-templates/${f}`)
  } catch {
    // Fallback to team photos if no ig-templates directory
    const publicDir = path.join(process.cwd(), 'public')
    const files = await fs.readdir(publicDir)
    return files
      .filter(f => f.startsWith('team-') && /\.(jpg|jpeg|png|webp)$/i.test(f))
      .map(f => `/${f}`)
  }
}
