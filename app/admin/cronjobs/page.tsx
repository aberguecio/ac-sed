import { prisma } from '@/lib/db'
import { CronJobsTable } from './cron-jobs-table'

export const dynamic = 'force-dynamic'

export default async function AdminCronJobsPage() {
  const jobs = await prisma.cronJob.findMany({ orderBy: { key: 'asc' } })

  return (
    <div className="p-8 space-y-6">
      <div>
        <h1 className="text-2xl font-extrabold text-navy mb-2">Cron Jobs</h1>
        <p className="text-gray-500 text-sm max-w-2xl">
          Tareas programadas que corren dentro de la app. Editá horario y activación
          desde acá; el scheduler interno se reprograma al instante. Usá <em>Run now</em>
          para forzar una corrida manual.
        </p>
      </div>

      <CronJobsTable initialJobs={jobs.map(j => ({
        ...j,
        lastRunAt: j.lastRunAt ? j.lastRunAt.toISOString() : null,
        retryUntil: j.retryUntil ? j.retryUntil.toISOString() : null,
        nextRetryAt: j.nextRetryAt ? j.nextRetryAt.toISOString() : null,
        createdAt: j.createdAt.toISOString(),
        updatedAt: j.updatedAt.toISOString(),
      }))} />

      <div className="bg-cream rounded-lg p-4 text-xs text-gray-600 max-w-2xl">
        <p className="font-medium text-gray-800 mb-2">Sintaxis cron (5 campos):</p>
        <code className="block">m h dom mon dow</code>
        <p className="mt-2">Ejemplos: <code>0 12 * * 2</code> (martes 12:00) · <code>0 9 * * 1</code> (lunes 09:00) · <code>*/5 * * * *</code> (cada 5 min)</p>
      </div>
    </div>
  )
}
