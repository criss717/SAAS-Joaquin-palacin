# --- ETAPA 1: DEPENDENCIAS DE DESARROLLO ---
FROM node:22-slim AS deps
WORKDIR /app

RUN corepack enable && corepack prepare pnpm@latest --activate

ENV CI=true

RUN pnpm config set ignore-scripts false
RUN pnpm config set side-effects-cache false

COPY package.json pnpm-lock.yaml ./

# Ahora instalará sin importar las advertencias de supply-chain
RUN pnpm install --frozen-lockfile

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

# 🛠️ CONFIGURACIÓN CRÍTICA: También en el entorno de producción
RUN pnpm config set ignore-scripts false

COPY package.json pnpm-lock.yaml ./

RUN pnpm install --frozen-lockfile

COPY --from=builder /app/.next ./.next
COPY --from=builder /app/public ./public
COPY --from=builder /app/prisma ./prisma

EXPOSE 3000

CMD ["pnpm", "start"]