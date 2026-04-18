export async function register() {
  if (process.env.NEXT_RUNTIME !== 'nodejs') return
  const { hydrateFromDb } = await import('@/lib/attendance-notifier')
  await hydrateFromDb()
}
