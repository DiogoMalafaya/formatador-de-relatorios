# Container image for the app.
#
# Why a container rather than a serverless deploy: the PDF renderer (DIO-11)
# needs headless Chromium and real filesystem access. Fixing that at the
# scaffold stage is much cheaper than discovering it at DIO-11 and re-platforming
# mid-build. If hosting later moves to a serverless target, the renderer has to
# split out into its own service first.

FROM node:22-slim AS deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci

FROM node:22-slim AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
ENV NEXT_TELEMETRY_DISABLED=1
RUN npm run build

FROM node:22-slim AS runner
WORKDIR /app
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1

# Chromium's font dependencies. Without these the rendered PDF silently falls
# back to a substitute face and Portuguese diacritics can render as boxes —
# a defect that only shows up in the customer's downloaded file.
RUN apt-get update && apt-get install -y --no-install-recommends \
      fonts-liberation \
      fontconfig \
    && rm -rf /var/lib/apt/lists/*

RUN groupadd --system --gid 1001 nodejs \
    && useradd --system --uid 1001 --gid nodejs nextjs

COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static
COPY --from=builder --chown=nextjs:nodejs /app/public ./public

USER nextjs
EXPOSE 3000
ENV PORT=3000
ENV HOSTNAME=0.0.0.0

CMD ["node", "server.js"]
