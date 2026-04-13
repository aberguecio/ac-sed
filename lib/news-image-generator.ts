import { createCanvas, loadImage, registerFont } from 'canvas'
import path from 'path'
import fs from 'fs/promises'

const LOGO_BASE_URL = 'https://liga-b.nyc3.digitaloceanspaces.com/team'

// Helper to build full logo URL
function getLogoUrl(teamId: number, logoUuid: string, size: '28x28' | '48x48' | '50x50' | '80x80' = '80x80'): string {
  return `${LOGO_BASE_URL}/${teamId}/${size}_${logoUuid}`
}

interface TeamInfo {
  id: number
  name: string
  logoUrl: string | null
}

export async function generateVsImage(homeTeam: TeamInfo, awayTeam: TeamInfo): Promise<Buffer> {
  const width = 1200
  const height = 630

  const canvas = createCanvas(width, height)
  const ctx = canvas.getContext('2d')

  // Background gradient
  const gradient = ctx.createLinearGradient(0, 0, width, height)
  gradient.addColorStop(0, '#1a1a2e')
  gradient.addColorStop(0.5, '#16213e')
  gradient.addColorStop(1, '#0f3460')
  ctx.fillStyle = gradient
  ctx.fillRect(0, 0, width, height)

  // Add subtle pattern overlay
  ctx.fillStyle = 'rgba(255, 255, 255, 0.02)'
  for (let i = 0; i < width; i += 40) {
    for (let j = 0; j < height; j += 40) {
      if ((i + j) % 80 === 0) {
        ctx.fillRect(i, j, 20, 20)
      }
    }
  }

  // Title
  ctx.fillStyle = '#ffffff'
  ctx.font = 'bold 36px Arial'
  ctx.textAlign = 'center'
  ctx.fillText('PRÓXIMO PARTIDO', width / 2, 80)

  // VS text
  ctx.font = 'bold 72px Arial'
  ctx.fillStyle = '#e94560'
  ctx.fillText('VS', width / 2, height / 2 + 20)

  // Team names
  ctx.font = 'bold 42px Arial'
  ctx.fillStyle = '#ffffff'

  // Home team (left)
  ctx.textAlign = 'right'
  const homeNameLines = wrapText(ctx, homeTeam.name.toUpperCase(), 350)
  homeNameLines.forEach((line, index) => {
    ctx.fillText(line, width / 2 - 150, height / 2 + (index - homeNameLines.length/2 + 0.5) * 50)
  })

  // Away team (right)
  ctx.textAlign = 'left'
  const awayNameLines = wrapText(ctx, awayTeam.name.toUpperCase(), 350)
  awayNameLines.forEach((line, index) => {
    ctx.fillText(line, width / 2 + 150, height / 2 + (index - awayNameLines.length/2 + 0.5) * 50)
  })

  // Load and draw logos
  const logoSize = 150
  const logoY = height / 2 - 75

  // Home team logo (left)
  if (homeTeam.logoUrl) {
    try {
      const homeLogoUrl = getLogoUrl(homeTeam.id, homeTeam.logoUrl, '80x80')
      const homeLogo = await loadImage(homeLogoUrl)

      // White background circle for logo
      ctx.beginPath()
      ctx.arc(width / 2 - 300, logoY + logoSize/2, logoSize/2 + 10, 0, Math.PI * 2)
      ctx.fillStyle = '#ffffff'
      ctx.fill()

      ctx.save()
      ctx.beginPath()
      ctx.arc(width / 2 - 300, logoY + logoSize/2, logoSize/2, 0, Math.PI * 2)
      ctx.clip()
      ctx.drawImage(homeLogo, width / 2 - 300 - logoSize/2, logoY, logoSize, logoSize)
      ctx.restore()
    } catch (err) {
      // If logo fails, draw placeholder
      drawPlaceholderLogo(ctx, width / 2 - 300, logoY, logoSize, homeTeam.name)
    }
  } else if (homeTeam.name.includes('AC Sed')) {
    // Use local AC SED logo
    try {
      const acSedLogo = await loadImage(path.join(process.cwd(), 'public', 'acsed.webp'))

      ctx.beginPath()
      ctx.arc(width / 2 - 300, logoY + logoSize/2, logoSize/2 + 10, 0, Math.PI * 2)
      ctx.fillStyle = '#ffffff'
      ctx.fill()

      ctx.save()
      ctx.beginPath()
      ctx.arc(width / 2 - 300, logoY + logoSize/2, logoSize/2, 0, Math.PI * 2)
      ctx.clip()
      ctx.drawImage(acSedLogo, width / 2 - 300 - logoSize/2, logoY, logoSize, logoSize)
      ctx.restore()
    } catch {
      drawPlaceholderLogo(ctx, width / 2 - 300, logoY, logoSize, homeTeam.name)
    }
  } else {
    drawPlaceholderLogo(ctx, width / 2 - 300, logoY, logoSize, homeTeam.name)
  }

  // Away team logo (right)
  if (awayTeam.logoUrl) {
    try {
      const awayLogoUrl = getLogoUrl(awayTeam.id, awayTeam.logoUrl, '80x80')
      const awayLogo = await loadImage(awayLogoUrl)

      ctx.beginPath()
      ctx.arc(width / 2 + 300, logoY + logoSize/2, logoSize/2 + 10, 0, Math.PI * 2)
      ctx.fillStyle = '#ffffff'
      ctx.fill()

      ctx.save()
      ctx.beginPath()
      ctx.arc(width / 2 + 300, logoY + logoSize/2, logoSize/2, 0, Math.PI * 2)
      ctx.clip()
      ctx.drawImage(awayLogo, width / 2 + 300 - logoSize/2, logoY, logoSize, logoSize)
      ctx.restore()
    } catch (err) {
      drawPlaceholderLogo(ctx, width / 2 + 300, logoY, logoSize, awayTeam.name)
    }
  } else if (awayTeam.name.includes('AC Sed')) {
    // Use local AC SED logo
    try {
      const acSedLogo = await loadImage(path.join(process.cwd(), 'public', 'acsed.webp'))

      ctx.beginPath()
      ctx.arc(width / 2 + 300, logoY + logoSize/2, logoSize/2 + 10, 0, Math.PI * 2)
      ctx.fillStyle = '#ffffff'
      ctx.fill()

      ctx.save()
      ctx.beginPath()
      ctx.arc(width / 2 + 300, logoY + logoSize/2, logoSize/2, 0, Math.PI * 2)
      ctx.clip()
      ctx.drawImage(acSedLogo, width / 2 + 300 - logoSize/2, logoY, logoSize, logoSize)
      ctx.restore()
    } catch {
      drawPlaceholderLogo(ctx, width / 2 + 300, logoY, logoSize, awayTeam.name)
    }
  } else {
    drawPlaceholderLogo(ctx, width / 2 + 300, logoY, logoSize, awayTeam.name)
  }

  // Footer
  ctx.fillStyle = 'rgba(255, 255, 255, 0.3)'
  ctx.font = '24px Arial'
  ctx.textAlign = 'center'
  ctx.fillText('LIGA B - FÚTBOL AMATEUR', width / 2, height - 40)

  return canvas.toBuffer('image/png')
}

function wrapText(ctx: CanvasRenderingContext2D, text: string, maxWidth: number): string[] {
  const words = text.split(' ')
  const lines: string[] = []
  let currentLine = ''

  for (const word of words) {
    const testLine = currentLine ? `${currentLine} ${word}` : word
    const metrics = ctx.measureText(testLine)

    if (metrics.width > maxWidth && currentLine) {
      lines.push(currentLine)
      currentLine = word
    } else {
      currentLine = testLine
    }
  }

  if (currentLine) {
    lines.push(currentLine)
  }

  return lines
}

function drawPlaceholderLogo(
  ctx: CanvasRenderingContext2D,
  centerX: number,
  centerY: number,
  size: number,
  teamName: string
) {
  // Draw circle background
  ctx.beginPath()
  ctx.arc(centerX, centerY + size/2, size/2, 0, Math.PI * 2)
  ctx.fillStyle = '#2a2a2a'
  ctx.fill()

  // Draw border
  ctx.strokeStyle = '#ffffff'
  ctx.lineWidth = 3
  ctx.stroke()

  // Draw initials
  const initials = teamName
    .split(' ')
    .map(word => word[0])
    .join('')
    .substring(0, 2)
    .toUpperCase()

  ctx.fillStyle = '#ffffff'
  ctx.font = `bold ${size/3}px Arial`
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  ctx.fillText(initials, centerX, centerY + size/2)
}