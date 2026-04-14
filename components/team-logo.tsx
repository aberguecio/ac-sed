import { isACSED } from '@/lib/team-utils'

interface TeamLogoProps {
  teamId: number
  teamName: string
  logoUrl: string | null
  size?: 'sm' | 'md' | 'lg'
  className?: string
  textSize?: string // Optional text size for fallback (e.g., "text-[9px]", "text-sm md:text-base")
}

function getInitials(name: string): string {
  return name
    .split(' ')
    .map(word => word[0])
    .join('')
    .substring(0, 2)
    .toUpperCase()
}

function getApiSize(size: 'sm' | 'md' | 'lg'): string {
  switch (size) {
    case 'sm':
      return '28x28'
    case 'md':
      return '80x80'
    case 'lg':
      return '' // Original size
    default:
      return '28x28'
  }
}

function getDefaultSize(size: 'sm' | 'md' | 'lg'): string {
  switch (size) {
    case 'sm':
      return 'h-7 w-7' // 28px
    case 'md':
      return 'h-20 w-20' // 80px
    case 'lg':
      return 'h-32 w-32' // 128px (reasonable default)
    default:
      return 'h-7 w-7'
  }
}


function getDefaultTextSize(size: 'sm' | 'md' | 'lg'): string {
  switch (size) {
    case 'sm':
      return 'text-[9px]'
    case 'md':
      return 'text-[24px]'
    case 'lg':
      return 'text-[40px]'
    default:
      return 'text-[9px]'
  }
}

export function TeamLogo({ teamId, teamName, logoUrl, size = 'sm', className = '', textSize }: TeamLogoProps) {
  const isAcsed = isACSED(teamName)
  const apiSize = getApiSize(size)
  const defaultSize = getDefaultSize(size)
  const finalClassName = className || defaultSize
  const finalTextSize = textSize || getDefaultTextSize(size)

  // AC SED always uses local logo
  if (isAcsed) {
    return (
      <img
        src="/ACSED-transaparent.webp"
        alt={teamName}
        className={`object-contain ${finalClassName}`}
      />
    )
  }

  // Other teams: try logo URL, fallback to initials
  if (logoUrl) {
    const logoSizePrefix = apiSize ? `${apiSize}_` : ''
    return (
      <img
        src={`https://liga-b.nyc3.digitaloceanspaces.com/team/${teamId}/${logoSizePrefix}${logoUrl}`}
        alt={teamName}
        className={`object-contain ${finalClassName}`}
      />
    )
  }

  // Fallback: gray circle with initials
  const initials = getInitials(teamName)
  return (
    <div
      className={`rounded-full bg-gray-400 flex items-center justify-center ${finalClassName}`}
    >
      <span className={`font-semibold text-white ${finalTextSize}`}>{initials}</span>
    </div>
  )
}
