// Fonts used for Instagram image generation.
// Keep in sync with Dockerfile COPY block under /usr/share/fonts/truetype/acsed/.
//
// Sharp uses librsvg to render SVG overlays. librsvg ignores @font-face and
// requires fonts to be registered with fontconfig at the OS level. If you swap
// a font here, also update the TTF in public/fonts/ and rebuild the Docker image.

export const TITLE_FONT = 'Stalinist One'
export const BODY_FONT = 'Boldonse'

interface TextAttrs {
  family: string
  size: number
  weight?: number | 'normal' | 'bold'
  fill: string
  letterSpacing?: number
  anchor?: 'start' | 'middle' | 'end'
  opacity?: number
}

// Builds SVG attribute string for a <text> node. Centralizes font handling
// so swapping fonts is a one-line change per node.
export function textAttrs(a: TextAttrs): string {
  const parts = [
    `font-family="${a.family}"`,
    `font-size="${a.size}"`,
  ]
  if (a.weight !== undefined) parts.push(`font-weight="${a.weight}"`)
  parts.push(`fill="${a.fill}"`)
  if (a.letterSpacing !== undefined && a.letterSpacing !== 0) {
    parts.push(`letter-spacing="${a.letterSpacing}"`)
  }
  if (a.anchor) parts.push(`text-anchor="${a.anchor}"`)
  if (a.opacity !== undefined) parts.push(`opacity="${a.opacity}"`)
  return parts.join(' ')
}
