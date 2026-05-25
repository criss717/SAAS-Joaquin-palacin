# --- ETAPA 1: DEPENDENCIAS DE DESARROLLO ---
FROM node:22-slim AS deps
WORKDIR /app

RUN corepack enable && corepack prepare pnpm@latest --activate

ENV CI=true

COPY package.json pnpm-lock.yaml ./

RUN pnpm install --frozen-lockfile --ignore-scripts

# --- ETAPA 2: COMPILACIÓN (BUILD) ---
FROM node:22-slim AS builder
WORKDIR /app

RUN corepack enable && corepack prepare pnpm@latest --activate

COPY . .
COPY --from=deps /app/node_modules ./node_modules

RUN pnpm prisma generate
RUN pnpm build

# --- ETAPA 3: PRODUCCIÓN REAL ---
FROM node:22-alpine AS runner
WORKDIR /app

RUN corepack enable && corepack prepare pnpm@latest --activate

ENV NODE_ENV=production
ENV CI=true

COPY package.json pnpm-lock.yaml ./

# 1. Instalamos solo dependencias de producción (sin la CLI de prisma)
RUN pnpm install --frozen-lockfile --prod --ignore-scripts

# 2. Copiamos los artefactos de la compilación de Next.js
COPY --from=builder /app/.next ./.next
COPY --from=builder /app/public ./public
COPY --from=builder /app/prisma ./prisma

# copiamos la carpeta donde Prisma autogenera el cliente por defecto.
COPY --from=builder /app/node_modules/.prisma ./node_modules/.prisma

USER node

EXPOSE 3000

CMD ["pnpm", "start"]