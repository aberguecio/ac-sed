# AC SED - Football Club Website

A modern web application for AC SED football club featuring automated match tracking, AI-generated news articles, and comprehensive team statistics.

## Features

- **Automated Match Tracking**: Scrapes match data from Liga B API weekly
- **AI-Powered News**: Automatically generates match reports using AI (OpenAI/Anthropic)
- **Team Statistics**: Displays standings, top scorers, and match fixtures
- **Newsletter System**: Email notifications for subscribers with AWS SES
- **Admin Panel**: Manage news articles, players, and content
- **Image Management**: AWS S3 integration for image storage

## Tech Stack

- **Framework**: Next.js 15 (React 18)
- **Database**: PostgreSQL with Prisma ORM
- **Authentication**: NextAuth.js v5
- **AI**: Vercel AI SDK (OpenAI/Anthropic)
- **Styling**: Tailwind CSS
- **Cloud Services**: AWS (S3, SES)
- **Web Scraping**: Playwright
- **Deployment**: Docker + Docker Compose

## Prerequisites

- Node.js 20+
- Docker & Docker Compose
- PostgreSQL 16
- AWS Account (for S3 and SES)
- OpenAI or Anthropic API key

## Environment Variables

Copy `.env.example` to `.env` and configure:

```bash
# Database
DATABASE_URL=postgresql://acsed:password@db:5432/acsed
POSTGRES_DB=acsed
POSTGRES_USER=acsed
POSTGRES_PASSWORD=changeme

# NextAuth
NEXTAUTH_SECRET=your-random-secret-32-chars
NEXTAUTH_URL=http://localhost:3000

# Admin
ADMIN_PASSWORD=changeme

# AI Configuration
AI_API_KEY=sk-...
AI_MODEL=gpt-4o-mini
AI_BASE_URL=  # Optional for LiteLLM/custom endpoints

# Cron Security
CRON_SECRET=your-random-secret

# AWS
AWS_ACCESS_KEY_ID=
AWS_SECRET_ACCESS_KEY=
AWS_REGION=us-east-1
AWS_SES_FROM_EMAIL=newsletter@yourdomain.com
AWS_S3_BUCKET=your-bucket-name

# Site URL
NEXT_PUBLIC_SITE_URL=https://yourdomain.com
```

## Development Setup

1. **Clone the repository**
   ```bash
   git clone <repository-url>
   cd ac-sed
   ```

2. **Install dependencies**
   ```bash
   npm install
   ```

3. **Set up database**
   ```bash
   # Start PostgreSQL with Docker
   docker-compose -f docker-compose.dev.yml up -d db

   # Run migrations
   npm run db:push
   ```

4. **Start development server**
   ```bash
   npm run dev
   ```

5. **Access the application**
   - Website: http://localhost:3000
   - Admin panel: http://localhost:3000/admin

## Production Deployment

1. **Configure environment**
   - Copy `.env.example` to `.env`
   - Update all production values

2. **Build and deploy**
   ```bash
   docker-compose up -d
   ```

3. **Services**
   - `db`: PostgreSQL database
   - `web`: Next.js application
   - `cron`: Automated scraper (runs Tuesdays at 12 PM)

## Project Structure

```
ac-sed/
├── app/                    # Next.js app directory
│   ├── (site)/            # Public pages
│   ├── admin/             # Admin panel
│   └── api/               # API routes
├── components/            # React components
├── lib/                   # Utilities & business logic
│   ├── scraper.ts        # Liga B API scraper
│   ├── ai.ts             # AI news generation
│   └── db.ts             # Prisma client
├── prisma/               # Database schema
├── public/               # Static assets
└── docker-compose.yml    # Production config
```

## Key Features Explained

### Automated Scraper
- Runs weekly (Tuesdays 12 PM)
- Fetches match data, standings, and scorers from Liga B API
- Generates AI news articles for completed matches
- Endpoint: `/api/cron` (secured with `CRON_SECRET`)

### Admin Panel
- `/admin/scrape` - Manual scraper execution
- `/admin/news` - Manage news articles
- `/admin/players` - Team roster management
- `/admin/subscribers` - Newsletter subscribers

### Newsletter
- Subscribers can sign up via `/api/subscribe`
- Send curated news via admin panel
- Unsubscribe links included automatically

## API Documentation

See `LIGAB_API.md` for detailed Liga B API documentation.

## License

Private - All rights reserved

## Support

For issues or questions, contact the development team.
