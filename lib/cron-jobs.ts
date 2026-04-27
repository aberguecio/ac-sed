import slugify from 'slugify'
import { prisma } from '@/lib/db'
import { runScraper } from '@/lib/scraper'
import { generateMatchNews, generateInstagramCaption } from '@/lib/ai'
import { ACSED_TEAM_ID } from '@/lib/team-utils'
import { pickRandomBackgrounds } from '@/lib/instagram-backgrounds'
import { attachComposedImage } from '@/lib/ig-image-pipeline'
import type { CronJob } from '@prisma/client'

export type JobStatus = 'success' | 'noop' | 'error'

export type JobResult = {
  status: JobStatus
  message: string
  // When set, the scheduler persists `retryUntil` and `nextRetryAt` so the
  // job is fired again at `nextAt` even outside its cron expression.
  scheduleRetry?: { until: Date; nextAt: Date }
  // When true, the scheduler clears any existing retry window after success.
  clearRetry?: boolean
}

export type JobHandler = (job: CronJob) => Promise<JobResult>

const HOUR_MS = 60 * 60 * 1000
const RETRY_WINDOW_MS = 24 * HOUR_MS
const RETRY_INTERVAL_MS = HOUR_MS

const aiProvider = () => process.env.AI_PROVIDER ?? 'openai'

async function processResultMatch(matchId: number) {
  const match = await prisma.match.findUnique({
    where: { id: matchId },
    include: { homeTeam: true, awayTeam: true },
  })
  if (!match) return

  // News article (skip if one already exists for this match)
  const existingNews = await prisma.newsArticle.findFirst({ where: { matchId } })
  if (!existingNews) {
    try {
      const { title, content } = await generateMatchNews(match)
      const baseSlug = slugify(title, { lower: true, strict: true })
      await prisma.newsArticle.create({
        data: {
          title,
          slug: `${baseSlug}-${Date.now()}`,
          content,
          matchId,
          aiProvider: aiProvider(),
          published: false,
        },
      })
    } catch (err) {
      console.error('[cron weekly-result] news error for match', matchId, err)
    }
  }

  // Instagram result post draft (skip if a draft result post already exists)
  const existingPost = await prisma.instagramPost.findFirst({
    where: { matchId, postType: 'result' },
  })
  if (existingPost) return

  let post
  try {
    const caption = await generateInstagramCaption(match, 'result')
    post = await prisma.instagramPost.create({
      data: {
        caption,
        postType: 'result',
        matchId,
        aiProvider: aiProvider(),
        status: 'draft',
      },
    })
  } catch (err) {
    console.error('[cron weekly-result] caption error for match', matchId, err)
    return
  }

  // Two distinct random backgrounds: one for the result image, one for standings
  const bgs = await pickRandomBackgrounds(2)
  const resultBg = bgs[0]?.imageUrl ?? null
  const standingsBg = bgs[1]?.imageUrl ?? null

  try {
    await attachComposedImage({
      postId: post.id,
      imageType: 'result',
      match,
      backgroundUrl: resultBg,
      orderIndex: 0,
    })
  } catch (err) {
    console.error('[cron weekly-result] result image error for match', matchId, err)
  }

  try {
    await attachComposedImage({
      postId: post.id,
      imageType: 'standings',
      match,
      backgroundUrl: standingsBg,
      orderIndex: 1,
    })
  } catch (err) {
    console.error('[cron weekly-result] standings image error for match', matchId, err)
  }
}

const handleWeeklyResult: JobHandler = async (job) => {
  const { newMatches } = await runScraper('scheduler')

  if (newMatches.length === 0) {
    const now = new Date()
    const stillRetrying = job.retryUntil && now < job.retryUntil
    const until = stillRetrying ? job.retryUntil! : new Date(now.getTime() + RETRY_WINDOW_MS)
    const nextAt = new Date(now.getTime() + RETRY_INTERVAL_MS)
    return {
      status: 'noop',
      message: stillRetrying
        ? 'sin partido nuevo, reintentando en 1h'
        : 'sin partido nuevo, abro ventana de retry 24h',
      scheduleRetry: { until, nextAt },
    }
  }

  for (const match of newMatches) {
    await processResultMatch(match.id)
  }

  return {
    status: 'success',
    message: `procesados ${newMatches.length} partido(s)`,
    clearRetry: true,
  }
}

const handleMondayPromo: JobHandler = async () => {
  const start = new Date()
  start.setHours(0, 0, 0, 0)
  const end = new Date(start)
  end.setHours(23, 59, 59, 999)

  const match = await prisma.match.findFirst({
    where: {
      date: { gte: start, lte: end },
      OR: [{ homeTeamId: ACSED_TEAM_ID }, { awayTeamId: ACSED_TEAM_ID }],
    },
    include: { homeTeam: true, awayTeam: true },
    orderBy: { date: 'asc' },
  })

  if (!match) {
    return { status: 'noop', message: 'AC SED no juega hoy' }
  }

  const existing = await prisma.instagramPost.findFirst({
    where: { matchId: match.id, postType: 'promo' },
  })
  if (existing) {
    return { status: 'noop', message: 'promo ya existe para el partido de hoy' }
  }

  const caption = await generateInstagramCaption(match, 'promo')
  const post = await prisma.instagramPost.create({
    data: {
      caption,
      postType: 'promo',
      matchId: match.id,
      aiProvider: aiProvider(),
      status: 'draft',
    },
  })

  const [bg] = await pickRandomBackgrounds(1)
  await attachComposedImage({
    postId: post.id,
    imageType: 'promo',
    match,
    backgroundUrl: bg?.imageUrl ?? null,
    orderIndex: 0,
  })

  return { status: 'success', message: `promo creada para match ${match.id}` }
}

export const JOB_REGISTRY: Record<string, JobHandler> = {
  'weekly-result': handleWeeklyResult,
  'monday-promo': handleMondayPromo,
}

export const DEFAULT_JOBS: Array<Pick<CronJob, 'key' | 'name' | 'schedule' | 'timezone'>> = [
  {
    key: 'weekly-result',
    name: 'Resultado semanal (martes)',
    schedule: '0 12 * * 2',
    timezone: 'America/Santiago',
  },
  {
    key: 'monday-promo',
    name: 'Promo del partido (lunes)',
    schedule: '0 9 * * 1',
    timezone: 'America/Santiago',
  },
]

export async function seedDefaultJobs() {
  for (const def of DEFAULT_JOBS) {
    await prisma.cronJob.upsert({
      where: { key: def.key },
      update: {},
      create: { ...def, enabled: true },
    })
  }
}
