import sharp from 'sharp'
import path from 'path'
import { promises as fs } from 'fs'
import {
  type TeamInfo,
  getTeamLogo,
  createPlaceholderLogo,
} from './vs-image-generator'
import { isACSED } from './team-utils'
import { TITLE_FONT, BODY_FONT, textAttrs } from './fonts'

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
    ${textNode({
      x: SIZE / 2,
      y: 115,
      text: escapeXml(title),
      attrs: textAttrs({
        family: TITLE_FONT,
        size: 42,
        weight: 'bold',
        fill: WHEAT,
        letterSpacing: 1,
        anchor: 'middle',
      }),
    })}
    <rect x="100" y="135" width="${SIZE - 200}" height="3" fill="${WHEAT}" opacity="0.6"/>
  `
}

function svgFooter(): string {
  return `
    <rect x="100" y="${SIZE - 150}" width="${SIZE - 200}" height="3" fill="${WHEAT}" opacity="0.6"/>
    ${textNode({
      x: SIZE / 2,
      y: SIZE - 120,
      text: 'AC SED | LIGA B',
      attrs: textAttrs({
        family: BODY_FONT,
        size: 18,
        fill: WHEAT_LIGHT,
        letterSpacing: 1,
        anchor: 'middle',
        opacity: 0.8,
      }),
    })}
  `
}

interface TextNodeArgs {
  x: number
  y: number
  text: string
  attrs: string
}
function textNode({ x, y, text, attrs }: TextNodeArgs): string {
  return `<text x="${x}" y="${y}" ${attrs}>${text}</text>`
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
  awayTeam: TeamInfo,
): Promise<Buffer> {
  const bg = await loadBackground(background || getDefaultTemplatePath())
  const logoSize = 150

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
  const cOff = 50
  const cW = 3

  const overlay = `
    <svg width="${SIZE}" height="${SIZE}" xmlns="http://www.w3.org/2000/svg">
      <defs>
        <radialGradient id="grad" cx="50%" cy="50%" r="70%">
          <stop offset="0%" stop-color="${NAVY}" stop-opacity="0.8"/>
          <stop offset="100%" stop-color="${NAVY}" stop-opacity="0.5"/>
        </radialGradient>
      </defs>

      <rect width="${SIZE}" height="${SIZE}" fill="url(#grad)"/>

      <!-- Corner accents -->
      <line x1="${cOff}" y1="${cOff}" x2="${cOff + cLen}" y2="${cOff}" stroke="${WHEAT}" stroke-width="${cW}" opacity="0.7"/>
      <line x1="${cOff}" y1="${cOff}" x2="${cOff}" y2="${cOff + cLen}" stroke="${WHEAT}" stroke-width="${cW}" opacity="0.7"/>
      <line x1="${SIZE - cOff}" y1="${cOff}" x2="${SIZE - cOff - cLen}" y2="${cOff}" stroke="${WHEAT}" stroke-width="${cW}" opacity="0.7"/>
      <line x1="${SIZE - cOff}" y1="${cOff}" x2="${SIZE - cOff}" y2="${cOff + cLen}" stroke="${WHEAT}" stroke-width="${cW}" opacity="0.7"/>
      <line x1="${cOff}" y1="${SIZE - cOff}" x2="${cOff + cLen}" y2="${SIZE - cOff}" stroke="${WHEAT}" stroke-width="${cW}" opacity="0.7"/>
      <line x1="${cOff}" y1="${SIZE - cOff}" x2="${cOff}" y2="${SIZE - cOff - cLen}" stroke="${WHEAT}" stroke-width="${cW}" opacity="0.7"/>
      <line x1="${SIZE - cOff}" y1="${SIZE - cOff}" x2="${SIZE - cOff - cLen}" y2="${SIZE - cOff}" stroke="${WHEAT}" stroke-width="${cW}" opacity="0.7"/>
      <line x1="${SIZE - cOff}" y1="${SIZE - cOff}" x2="${SIZE - cOff}" y2="${SIZE - cOff - cLen}" stroke="${WHEAT}" stroke-width="${cW}" opacity="0.7"/>

      ${svgTitle('RESULTADO')}

      <!-- Score -->
      ${textNode({
        x: SIZE / 2 - 220,
        y: 430,
        text: String(homeScore),
        attrs: textAttrs({ family: TITLE_FONT, size: 220, weight: 400, fill: CREAM, anchor: 'middle' }),
      })}
      ${textNode({
        x: SIZE / 2,
        y: 390,
        text: '-',
        attrs: textAttrs({ family: TITLE_FONT, size: 80, weight: 400, fill: WHEAT, anchor: 'middle', opacity: 0.8 }),
      })}
      ${textNode({
        x: SIZE / 2 + 220,
        y: 430,
        text: String(awayScore),
        attrs: textAttrs({ family: TITLE_FONT, size: 220, weight: 400, fill: CREAM, anchor: 'middle' }),
      })}

      <!-- Team names -->
      ${textNode({
        x: SIZE / 2 - 200,
        y: 705,
        text: escapeXml(homeTeam.name.toUpperCase()),
        attrs: textAttrs({ family: BODY_FONT, size: 24, weight: 'bold', fill: CREAM, anchor: 'middle' }),
      })}
      ${textNode({
        x: SIZE / 2 + 200,
        y: 705,
        text: escapeXml(awayTeam.name.toUpperCase()),
        attrs: textAttrs({ family: BODY_FONT, size: 24, weight: 'bold', fill: CREAM, anchor: 'middle' }),
      })}

      <!-- Subtitle phrase -->
      ${textNode({
        x: SIZE / 2,
        y: 790,
        text: escapeXml(headline),
        attrs: textAttrs({ family: BODY_FONT, size: 26, fill: WHEAT, letterSpacing: 1, anchor: 'middle', opacity: 0.9 }),
      })}

      ${svgFooter()}
    </svg>
  `

  const overlaySvg = Buffer.from(overlay)

  const composites: sharp.OverlayOptions[] = [
    { input: overlaySvg, top: 0, left: 0 },
    { input: homeLogo, top: 520, left: Math.floor(SIZE / 2 - 200 - logoSize / 2) },
    { input: awayLogo, top: 520, left: Math.floor(SIZE / 2 + 200 - logoSize / 2) },
  ]

  if (beersIcon) {
    composites.push(
      { input: beersIcon, top: 767, left: 240 },
      { input: beersIcon, top: 767, left: SIZE - 240 - 50 },
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
  scorers: ScorerInfo[],
): Promise<Buffer> {
  const [bg, footerLogo] = await Promise.all([
    loadBackground(background || getDefaultTemplatePath()),
    getFooterLogo(),
  ])

  const rowHeight = 42
  const tableStartY = 250
  const headerY = 195
  const colPos = { pos: 120, name: 170, pj: 620, pg: 690, pe: 760, pp: 830, pts: 920 }

  let tableRows = ''
  standings.forEach((row, i) => {
    const y = tableStartY + i * rowHeight
    const rowBg = row.isACSED
      ? `<rect x="80" y="${y - 33}" width="${SIZE - 160}" height="${rowHeight}" rx="4" fill="${WHEAT}" opacity="0.3"/>`
      : ''
    const textColor = row.isACSED ? WHEAT : CREAM
    const weight: 'bold' | 'normal' = row.isACSED ? 'bold' : 'normal'
    const mk = (size: number, w: 'bold' | 'normal', anchor?: 'start' | 'middle' | 'end') =>
      textAttrs({ family: BODY_FONT, size, weight: w, fill: textColor, anchor })

    tableRows += `
      ${rowBg}
      ${textNode({ x: colPos.pos, y, text: String(row.position), attrs: mk(20, weight, 'middle') })}
      ${textNode({ x: colPos.name, y, text: escapeXml(row.teamName), attrs: mk(20, weight, 'start') })}
      ${textNode({ x: colPos.pj, y, text: String(row.played), attrs: mk(20, weight, 'middle') })}
      ${textNode({ x: colPos.pg, y, text: String(row.won), attrs: mk(20, weight, 'middle') })}
      ${textNode({ x: colPos.pe, y, text: String(row.drawn), attrs: mk(20, weight, 'middle') })}
      ${textNode({ x: colPos.pp, y, text: String(row.lost), attrs: mk(20, weight, 'middle') })}
      ${textNode({ x: colPos.pts, y, text: String(row.points), attrs: mk(22, 'bold', 'middle') })}
    `
  })

  const scorersStartY = tableStartY + standings.length * rowHeight + 60
  let scorersSection = ''
  if (scorers.length > 0) {
    scorersSection = `
      <rect x="80" y="${scorersStartY - 10}" width="${SIZE - 160}" height="3" fill="${WHEAT}" opacity="0.4"/>
      ${textNode({
        x: SIZE / 2,
        y: scorersStartY + 35,
        text: 'GOLEADORES',
        attrs: textAttrs({ family: TITLE_FONT, size: 24, weight: 'bold', fill: WHEAT, anchor: 'middle' }),
      })}
    `
    scorers.forEach((scorer, i) => {
      const y = scorersStartY + 75 + i * 36
      const minuteStr = scorer.minute ? ` (${scorer.minute}')` : ''
      scorersSection += `
        ${textNode({
          x: 200,
          y,
          text: `${escapeXml(scorer.name)}${minuteStr}`,
          attrs: textAttrs({ family: BODY_FONT, size: 20, fill: CREAM }),
        })}
        ${textNode({
          x: SIZE - 200,
          y,
          text: `${scorer.goals} ${scorer.goals === 1 ? 'gol' : 'goles'}`,
          attrs: textAttrs({ family: BODY_FONT, size: 20, weight: 'bold', fill: WHEAT, anchor: 'end' }),
        })}
      `
    })
  }

  const header = (x: number, text: string, anchor: 'start' | 'middle') =>
    textNode({
      x,
      y: headerY,
      text,
      attrs: textAttrs({ family: BODY_FONT, size: 20, weight: 'bold', fill: WHEAT, anchor }),
    })

  const overlay = `
    <svg width="${SIZE}" height="${SIZE}" xmlns="http://www.w3.org/2000/svg">
      <rect width="${SIZE}" height="${SIZE}" fill="${NAVY}" opacity="0.82"/>

      ${svgTitle('TABLA DE POSICIONES')}

      ${header(colPos.pos, '#', 'middle')}
      ${header(colPos.name, 'Equipo', 'start')}
      ${header(colPos.pj, 'PJ', 'middle')}
      ${header(colPos.pg, 'G', 'middle')}
      ${header(colPos.pe, 'E', 'middle')}
      ${header(colPos.pp, 'P', 'middle')}
      ${header(colPos.pts, 'Pts', 'middle')}

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
  venue?: string | null,
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
    hour12: false,
  })

  const venueStr = venue ? escapeXml(venue.toUpperCase()) : ''
  const centerY = SIZE / 2 - 60

  const overlay = `
    <svg width="${SIZE}" height="${SIZE}" xmlns="http://www.w3.org/2000/svg">
      <rect width="${SIZE}" height="${SIZE}" fill="${NAVY}" opacity="0.75"/>

      ${textNode({
        x: SIZE / 2,
        y: 70,
        text: 'ESTA NOCHE',
        attrs: textAttrs({ family: TITLE_FONT, size: 24, weight: 'bold', fill: WHEAT, anchor: 'middle', opacity: 0.7 }),
      })}
      ${svgTitle('AC SED')}

      ${textNode({
        x: SIZE / 2,
        y: centerY + 15,
        text: 'VS',
        attrs: textAttrs({ family: TITLE_FONT, size: 56, weight: 'bold', fill: WHEAT, anchor: 'middle' }),
      })}

      ${textNode({
        x: SIZE / 2 - 260,
        y: centerY + 195,
        text: escapeXml(homeTeam.name.toUpperCase()),
        attrs: textAttrs({ family: BODY_FONT, size: 30, weight: 'bold', fill: CREAM, anchor: 'middle' }),
      })}
      ${textNode({
        x: SIZE / 2 + 260,
        y: centerY + 195,
        text: escapeXml(awayTeam.name.toUpperCase()),
        attrs: textAttrs({ family: BODY_FONT, size: 30, weight: 'bold', fill: CREAM, anchor: 'middle' }),
      })}

      ${textNode({
        x: SIZE / 2,
        y: SIZE - 290,
        text: escapeXml(dateStr),
        attrs: textAttrs({ family: BODY_FONT, size: 28, weight: 'bold', fill: CREAM, anchor: 'middle' }),
      })}
      ${textNode({
        x: SIZE / 2,
        y: SIZE - 230,
        text: `${timeStr} HRS`,
        attrs: textAttrs({ family: TITLE_FONT, size: 38, weight: 'bold', fill: WHEAT, anchor: 'middle' }),
      })}
      ${venueStr
        ? textNode({
            x: SIZE / 2,
            y: SIZE - 180,
            text: venueStr,
            attrs: textAttrs({ family: BODY_FONT, size: 24, weight: 'bold', fill: CREAM, anchor: 'middle', opacity: 0.9 }),
          })
        : ''}

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
  background: string | Buffer,
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
    const publicDir = path.join(process.cwd(), 'public')
    const files = await fs.readdir(publicDir)
    return files
      .filter(f => f.startsWith('team-') && /\.(jpg|jpeg|png|webp)$/i.test(f))
      .map(f => `/${f}`)
  }
}
