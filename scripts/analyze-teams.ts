import { prisma } from '../lib/db'

async function analyzeTeams() {
  console.log('🔍 Analizando equipos en la base de datos actual...\n');

  // 1. Equipos únicos en Match
  const matchTeams = await prisma.$queryRaw<{team_name: string, occurrences: bigint}[]>`
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
  matchTeams.forEach(t => console.log(`  - ${t.team_name}: ${t.occurrences} veces`));

  // 2. Total de registros por tabla
  const [matchCount, standingCount, scorerCount] = await Promise.all([
    prisma.match.count(),
    prisma.standing.count(),
    prisma.leagueScorer.count()
  ]);

  console.log('\n📈 Total de registros:');
  console.log(`  - Partidos: ${matchCount}`);
  console.log(`  - Standings: ${standingCount}`);
  console.log(`  - Goleadores: ${scorerCount}`);

  // 3. Verificar variaciones de AC SED
  const acSedVariations = await prisma.$queryRaw<{team_name: string, source: string}[]>`
    SELECT DISTINCT "homeTeam" as team_name, 'Match-home' as source
    FROM "Match"
    WHERE "homeTeam" ILIKE '%sed%'
    UNION
    SELECT DISTINCT "awayTeam" as team_name, 'Match-away' as source
    FROM "Match"
    WHERE "awayTeam" ILIKE '%sed%'
    UNION
    SELECT DISTINCT "teamName" as team_name, 'Standing' as source
    FROM "Standing"
    WHERE "teamName" ILIKE '%sed%'
  `;

  console.log('\n⚠️  Variaciones de AC SED encontradas:');
  acSedVariations.forEach(v => console.log(`  - "${v.team_name}" (en ${v.source})`));

  // 4. Equipos únicos totales
  const uniqueTeams = await prisma.$queryRaw<{team_count: bigint}[]>`
    SELECT COUNT(DISTINCT team_name) as team_count
    FROM (
      SELECT "homeTeam" as team_name FROM "Match"
      UNION
      SELECT "awayTeam" as team_name FROM "Match"
      UNION
      SELECT "teamName" as team_name FROM "Standing"
    ) all_teams
  `;

  console.log(`\n📋 Total de equipos únicos: ${uniqueTeams[0].team_count}`);

  await prisma.$disconnect();
}

analyzeTeams().catch(console.error);