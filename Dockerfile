FROM node:22-alpine AS base
WORKDIR /app

# instalar pnpm
RUN corepack enable && corepack prepare pnpm@latest --activate

# deps
COPY package.json pnpm-lock.yaml ./
RUN pnpm install --frozen-lockfile

# copiar app
COPY . .

# prisma generate (IMPORTANTE)
RUN pnpm prisma generate

# build
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