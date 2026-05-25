FROM node:22-slim AS base
WORKDIR /app

RUN corepack enable && corepack prepare pnpm@latest --activate

ENV CI=true
ENV PNPM_CONFIG_IGNORE_SCRIPTS=false

COPY package.json pnpm-lock.yaml ./

# instalar deps
RUN pnpm install --frozen-lockfile

# copiar app
COPY . .

RUN pnpm prisma generate

# build Next
RUN pnpm build

# -------------------------
FROM node:22-alpine AS runner
WORKDIR /app

RUN corepack enable && corepack prepare pnpm@latest --activate

ENV NODE_ENV=production

COPY --from=base /app/.next ./.next
COPY --from=base /app/public ./public
COPY --from=base /app/package.json ./package.json
COPY --from=base /app/node_modules ./node_modules
COPY --from=base /app/prisma ./prisma

EXPOSE 3000

CMD ["pnpm", "start"]