# Running the project

Everything runs in Docker. **Do not** run `npm` / `npx prisma` on the host.

## First-time setup

```bash
cp .env.example .env
# Fill in: ADMIN_PASSWORD, NEXTAUTH_SECRET, CRON_SECRET,
#         AI_API_KEY, AWS_*, INSTAGRAM_*, NEXT_PUBLIC_SITE_URL
```

## Development

```bash
docker-compose -f docker-compose.dev.yml up -d
```

Starts three services:

| Service | Purpose |
|---|---|
| `db` | Postgres 16-alpine, health-checked (`pg_isready`) |
| `web` | Next.js dev server with hot reload (`Dockerfile.dev`, polling enabled), mounts repo at `/app`, preserves `node_modules` + `.next`. Runs `prisma db push` then `npm run dev` |
| `cron` | Alpine + crond hitting `/api/cron` on Mon 08:00 UTC |

- App: http://localhost:3000
- Admin: http://localhost:3000/admin (login with `ADMIN_PASSWORD`)

## Production

```bash
docker-compose up -d
```

Differences vs dev:
- Web built from `Dockerfile` (multi-stage, Next.js standalone). CMD: `npx prisma db push && node server.js`
- Exposed via Traefik (external `proxy` network), host `acsed.cl`, TLS
- Cron: Tue 12:00 UTC
- Only internal networking — no 3000 port mapping

## Common commands

```bash
# Logs
docker-compose logs -f web
docker-compose logs -f cron

# Enter containers
docker-compose exec web bash
docker-compose exec db psql -U acsed -d acsed
docker-compose exec cron sh

# Apply schema changes (after editing prisma/schema.prisma)
docker-compose exec web npx prisma db push

# Reset DB (destructive)
docker-compose down -v && docker-compose up -d

# Lint
docker-compose exec web npm run lint

# Manually trigger cron / scraper
curl -H "X-Cron-Secret: $CRON_SECRET" http://localhost:3000/api/cron
```

## Database access

- Host: `db` (inside compose network), not exposed to host by default
- DB/User/Pass: from `POSTGRES_*` env vars (defaults `acsed`/`acsed`/`changeme`)
- Connection: `postgresql://acsed:changeme@db:5432/acsed`

## Testing

No test runner configured — no Jest/Vitest dependencies, no `test` script. Verify changes by:
1. `docker-compose logs -f web` for compile/runtime errors
2. Exercise flows manually at http://localhost:3000 and `/admin`
3. `npm run lint` inside the container

## Bootstrapping data

No seed script. Initial data comes from the scraper — either wait for the cron, or trigger manually:

```bash
curl -H "X-Cron-Secret: $CRON_SECRET" http://localhost:3000/api/cron
# or via admin UI at /admin/scrape
```
