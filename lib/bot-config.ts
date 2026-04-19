import { prisma } from '@/lib/db'

export type BotConfig = {
  id: number
  aiAllowDms: boolean
  updatedAt: Date
}

export async function getBotConfig(): Promise<BotConfig> {
  return prisma.botConfig.upsert({
    where: { id: 1 },
    create: { id: 1 },
    update: {},
  })
}

export async function setBotConfig(patch: { aiAllowDms?: boolean }): Promise<BotConfig> {
  return prisma.botConfig.upsert({
    where: { id: 1 },
    create: { id: 1, ...patch },
    update: patch,
  })
}
