FROM node:20-slim AS base

# Install system dependencies for Playwright Chromium + Sharp/librsvg font rendering
RUN apt-get update && apt-get install -y \
  chromium \
  libnspr4 \
  libnss3 \
  libatk1.0-0 \
  libatk-bridge2.0-0 \
  libcups2 \
  libdrm2 \
  libxkbcommon0 \
  libxcomposite1 \
  libxdamage1 \
  libxfixes3 \
  libxrandr2 \
  libgbm1 \
  libpango-1.0-0 \
  libcairo2 \
  libasound2 \
  fontconfig \
  fonts-liberation \
  --no-install-recommends \
  && rm -rf /var/lib/apt/lists/*

# Tell Playwright to use system Chromium
ENV PLAYWRIGHT_BROWSERS_PATH=/usr/bin
ENV PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1

# Register Google Fonts for Instagram image generation (librsvg needs fontconfig).
# TTFs are committed under public/fonts/; kept in sync with lib/fonts.ts.
COPY public/fonts/ /usr/share/fonts/truetype/acsed/
RUN fc-cache -f -v && \
    fc-list | grep -iE 'boldonse|stalinist' || true

WORKDIR /app

# Install dependencies
COPY package*.json ./
RUN npm install && npm cache clean --force

# Generate Prisma client
COPY prisma ./prisma
RUN npx prisma generate

# Build Next.js app
COPY . .
ENV SKIP_ENV_VALIDATION=1
RUN npm run build

# Copy static files for standalone mode
RUN cp -r .next/static .next/standalone/.next/ && \
    if [ -d public ]; then cp -r public .next/standalone/; fi && \
    cp -r prisma .next/standalone/

# Remove dev dependencies after build
RUN npm prune --omit=dev

EXPOSE 3000
ENV NODE_ENV=production
ENV PORT=3000
ENV HOSTNAME=0.0.0.0

WORKDIR /app/.next/standalone
CMD ["sh", "-c", "npx prisma db push && node server.js"]
