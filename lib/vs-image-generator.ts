import sharp from 'sharp'
import path from 'path'
import { promises as fs } from 'fs'

const LOGO_BASE_URL = 'https://liga-b.nyc3.digitaloceanspaces.com/team'

// Helper to build full logo URL
function getLogoUrl(teamId: number, logoUuid: string, size?: '28x28' | '48x48' | '50x50' | '80x80'): string {
  // If no size specified, return the original image (1024x1024)
  if (!size) {
    return `${LOGO_BASE_URL}/${teamId}/${logoUuid}`
  }
  return `${LOGO_BASE_URL}/${teamId}/${size}_${logoUuid}`
}

interface TeamInfo {
  id: number
  name: string
  logoUrl: string | null
  score?: number | null
}

async function fetchImageAsBuffer(url: string): Promise<Buffer | null> {
  try {
    const response = await fetch(url)
    if (!response.ok) return null
    const arrayBuffer = await response.arrayBuffer()
    return Buffer.from(arrayBuffer)
  } catch (error) {
    console.error('Error fetching image:', error)
    return null
  }
}

async function getTeamLogo(team: TeamInfo): Promise<Buffer | null> {
  // For AC SED, try to use local transparent logo first
  if (team.name.includes('AC Sed') || team.name.includes('AC SED')) {
    try {
      // Try transparent logo first
      const transparentLogoPath = path.join(process.cwd(), 'public', 'logo-transparent.png')
      return await fs.readFile(transparentLogoPath)
    } catch (error) {
      try {
        // Fallback to webp logo
        const localLogoPath = path.join(process.cwd(), 'public', 'acsed.webp')
        return await fs.readFile(localLogoPath)
      } catch (error2) {
        console.log('Local AC SED logos not found, will use placeholder')
      }
    }
  }

  // Try to fetch remote logo - use original size (1024x1024) for best quality
  if (team.logoUrl && team.id) {
    const logoUrl = getLogoUrl(team.id, team.logoUrl) // No size = original 1024x1024
    const buffer = await fetchImageAsBuffer(logoUrl)
    if (buffer) return buffer
  }

  return null
}

function createPlaceholderLogo(teamName: string): Promise<Buffer> {
  const initials = teamName
    .split(' ')
    .map(word => word[0])
    .join('')
    .substring(0, 2)
    .toUpperCase()

  // Create SVG with initials - simple square background
  const svg = `
    <svg width="200" height="200" xmlns="http://www.w3.org/2000/svg">
      <rect x="10" y="10" width="180" height="180" fill="#2a2a2a" rx="10"/>
      <text x="100" y="110" font-family="Arial" font-size="70" font-weight="bold" fill="#ffffff" text-anchor="middle">
        ${initials}
      </text>
    </svg>
  `

  return sharp(Buffer.from(svg)).png().toBuffer()
}

export async function generateVsImage(homeTeam: TeamInfo, awayTeam: TeamInfo): Promise<Buffer> {
  const width = 1200
  const height = 630
  const logoSize = 200 // Increased logo size

  // Get or create logos
  const [homeLogoBuffer, awayLogoBuffer] = await Promise.all([
    getTeamLogo(homeTeam).then(buf => buf || createPlaceholderLogo(homeTeam.name)),
    getTeamLogo(awayTeam).then(buf => buf || createPlaceholderLogo(awayTeam.name))
  ])

  // Process logos - resize without cropping, no circles
  const [homeLogoProcessed, awayLogoProcessed] = await Promise.all([
    sharp(homeLogoBuffer)
      .resize(logoSize, logoSize, {
        fit: 'contain',  // Changed from 'cover' to 'contain' to avoid cropping
        background: { r: 0, g: 0, b: 0, alpha: 0 } // Transparent background
      })
      .png()
      .toBuffer(),
    sharp(awayLogoBuffer)
      .resize(logoSize, logoSize, {
        fit: 'contain',  // Changed from 'cover' to 'contain' to avoid cropping
        background: { r: 0, g: 0, b: 0, alpha: 0 } // Transparent background
      })
      .png()
      .toBuffer()
  ])

  // Create the main SVG
  const svg = `
    <svg width="${width}" height="${height}" xmlns="http://www.w3.org/2000/svg">
      <defs>
        <linearGradient id="bgGradient" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" style="stop-color:#1a1a2e;stop-opacity:1" />
          <stop offset="50%" style="stop-color:#16213e;stop-opacity:1" />
          <stop offset="100%" style="stop-color:#0f3460;stop-opacity:1" />
        </linearGradient>
        <pattern id="pattern" x="0" y="0" width="80" height="80" patternUnits="userSpaceOnUse">
          <rect x="0" y="0" width="20" height="20" fill="rgba(255,255,255,0.02)"/>
          <rect x="40" y="40" width="20" height="20" fill="rgba(255,255,255,0.02)"/>
        </pattern>
      </defs>

      <!-- Background -->
      <rect width="${width}" height="${height}" fill="url(#bgGradient)"/>
      <rect width="${width}" height="${height}" fill="url(#pattern)"/>

      <!-- Title -->
      <text x="${width/2}" y="80" font-family="Arial" font-size="36" font-weight="bold" fill="#ffffff" text-anchor="middle">
        RESULTADO DEL PARTIDO
      </text>

      <!-- Score and VS Text -->
      ${homeTeam.score !== null && homeTeam.score !== undefined ?
        `<text x="${width/2 - 100}" y="${height/2 + 10}" font-family="Arial" font-size="90" font-weight="bold" fill="#ffffff" text-anchor="middle">
          ${homeTeam.score}
        </text>` : ''
      }
      <text x="${width/2}" y="${height/2 + 10}" font-family="Arial" font-size="60" font-weight="bold" fill="#e94560" text-anchor="middle">
        VS
      </text>
      ${awayTeam.score !== null && awayTeam.score !== undefined ?
        `<text x="${width/2 + 100}" y="${height/2 + 10}" font-family="Arial" font-size="90" font-weight="bold" fill="#ffffff" text-anchor="middle">
          ${awayTeam.score}
        </text>` : ''
      }

      <!-- Team Names - Now below logos -->
      <text x="${width/2 - 300}" y="${height/2 + 150}" font-family="Arial" font-size="32" font-weight="bold" fill="#ffffff" text-anchor="middle">
        ${homeTeam.name.toUpperCase()}
      </text>
      <text x="${width/2 + 300}" y="${height/2 + 150}" font-family="Arial" font-size="32" font-weight="bold" fill="#ffffff" text-anchor="middle">
        ${awayTeam.name.toUpperCase()}
      </text>

      <!-- Footer -->
      <text x="${width/2}" y="${height - 40}" font-family="Arial" font-size="24" fill="rgba(255,255,255,0.3)" text-anchor="middle">
        LIGA B - FÚTBOL AMATEUR
      </text>
    </svg>
  `

  // Create base image
  const baseImage = await sharp(Buffer.from(svg))
    .png()
    .toBuffer()

  // Composite logos onto the base image - adjusted positions for larger logos
  const finalImage = await sharp(baseImage)
    .composite([
      {
        input: homeLogoProcessed,
        top: Math.floor(height/2 - logoSize/2 - 30), // Moved up a bit
        left: Math.floor(width/2 - 300 - logoSize/2)
      },
      {
        input: awayLogoProcessed,
        top: Math.floor(height/2 - logoSize/2 - 30), // Moved up a bit
        left: Math.floor(width/2 + 300 - logoSize/2)
      }
    ])
    .png()
    .toBuffer()

  return finalImage
}