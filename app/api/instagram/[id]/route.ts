import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { getMatchContext } from '@/lib/ai'

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const post = await prisma.instagramPost.findUnique({
    where: { id: parseInt(id) },
    include: {
      images: { orderBy: { orderIndex: 'asc' } },
      match: {
        include: {
          homeTeam: true,
          awayTeam: true,
        },
      },
    },
  })

  if (!post) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  let aiContext = null
  if (post.match) {
    const context = await getMatchContext(post.match)
    aiContext = {
      matchDate: post.match.date,
      matchInfo: `${post.match.homeTeam?.name ?? 'TBD'} ${post.match.homeScore ?? '?'} - ${post.match.awayScore ?? '?'} ${post.match.awayTeam?.name ?? 'TBD'}`,
      goals: context.goals.map((g: any) => ({
        minute: g.minute,
        player: g.scrapedPlayer ? `${g.scrapedPlayer.firstName} ${g.scrapedPlayer.lastName}` : 'Desconocido',
        team: g.teamName,
      })),
      standings: context.standingsRows.map((s: any) =>
        `${s.position}. ${s.teamName} - ${s.points}pts (G:${s.won} E:${s.drawn} P:${s.lost})`
      ),
    }
  }

  return NextResponse.json({ ...post, aiContext })
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const body = await req.json()

  // Only allow updating caption on draft posts
  const post = await prisma.instagramPost.findUnique({ where: { id: parseInt(id) } })
  if (!post) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const updated = await prisma.instagramPost.update({
    where: { id: parseInt(id) },
    data: {
      ...(body.caption !== undefined && { caption: body.caption }),
    },
    include: {
      images: { orderBy: { orderIndex: 'asc' } },
      match: {
        include: {
          homeTeam: { select: { name: true } },
          awayTeam: { select: { name: true } },
        },
      },
    },
  })

  return NextResponse.json(updated)
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const post = await prisma.instagramPost.findUnique({ where: { id: parseInt(id) } })
  if (!post) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  if (post.status === 'published') {
    return NextResponse.json({ error: 'No se puede eliminar un post publicado' }, { status: 400 })
  }

  // Cascade deletes images due to onDelete: Cascade in schema
  await prisma.instagramPost.delete({ where: { id: parseInt(id) } })
  return NextResponse.json({ success: true })
}
