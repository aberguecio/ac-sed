import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();

async function analyzeTeams() {
  console.log('🔍 Analizando equipos en la base de datos actual...\n');

  // 1. Equipos únicos en Match
  const matchTeams = await prisma.$queryRaw`
    SELECT DISTINCT team_name, COUNT(*) as occurrences
    FROM (
      SELECT "homeTeam" as team_name FROM "Match"
      UNION ALL
      SELECT "awayTeam" as team_name FROM "Match"
    ) teams
    GROUP BY team_name
    ORDER BY occurrences DESC
    LIMIT 10
  `;

  console.log('📊 Top 10 equipos en partidos:');
  console.log(matchTeams);

  // 2. Total de registros por tabla
  const [matchCount, standingCount, scorerCount] = await Promise.all([
    prisma.match.count(),
    prisma.standing.count(),
    prisma.leagueScorer.count()
  ]);

  console.log('\n📈 Total de registros:');
  console.log(`- Partidos: ${matchCount}`);
  console.log(`- Standings: ${standingCount}`);
  console.log(`- Goleadores: ${scorerCount}`);

  // 3. Verificar variaciones de AC SED
  const acSedVariations = await prisma.$queryRaw`
    SELECT DISTINCT team_name, 'Match-home' as source
    FROM "Match"
    WHERE "homeTeam" ILIKE '%sed%'
    UNION
    SELECT DISTINCT team_name, 'Match-away' as source
    FROM "Match"
    WHERE "awayTeam" ILIKE '%sed%'
    UNION
    SELECT DISTINCT "teamName", 'Standing' as source
    FROM "Standing"
    WHERE "teamName" ILIKE '%sed%'
  `;

  console.log('\n⚠️  Variaciones de AC SED encontradas:');
  console.log(acSedVariations);

  await prisma.$disconnect();
}

analyzeTeams().catch(console.error);