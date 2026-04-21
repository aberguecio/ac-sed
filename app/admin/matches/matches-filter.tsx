'use client'

import { useRouter, useSearchParams } from 'next/navigation'

interface MatchesFilterProps {
  showAll: boolean
}

export function MatchesFilter({ showAll }: MatchesFilterProps) {
  const router = useRouter()
  const searchParams = useSearchParams()

  const handleToggle = (value: boolean) => {
    const params = new URLSearchParams(searchParams)
    if (value) {
      params.set('showAll', 'true')
    } else {
      params.delete('showAll')
    }
    router.push(`/admin/matches?${params.toString()}`)
  }

  return (
    <div className="flex items-center gap-2 text-sm">
      <button
        onClick={() => handleToggle(false)}
        className={`px-3 py-1.5 rounded transition-colors ${
          !showAll
            ? 'bg-navy text-cream font-medium'
            : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
        }`}
      >
        Solo ACSED
      </button>
      <button
        onClick={() => handleToggle(true)}
        className={`px-3 py-1.5 rounded transition-colors ${
          showAll
            ? 'bg-navy text-cream font-medium'
            : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
        }`}
      >
        Todos
      </button>
    </div>
  )
}
