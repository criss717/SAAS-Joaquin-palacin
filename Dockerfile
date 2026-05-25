# --- ETAPA 1: BASE ---
FROM node:22-slim AS base
WORKDIR /app
RUN corepack enable && corepack prepare pnpm@latest --activate
ENV CI=true

# --- ETAPA 2: COMPILACIÓN (BUILDER) ---
FROM base AS builder

COPY package.json pnpm-lock.yaml ./
COPY prisma ./prisma/

RUN pnpm install --frozen-lockfile --ignore-scripts
RUN pnpm prisma generate

COPY . .
RUN pnpm build

# --- ETAPA 3: PRODUCCIÓN REAL (RUNNER) ---
FROM node:22-alpine AS runner
WORKDIR /app
RUN corepack enable && corepack prepare pnpm@latest --activate
ENV NODE_ENV=production
ENV CI=true

# Copiamos configuración de paquetes y la carpeta prisma (necesaria para regenerar el cliente)
COPY package.json pnpm-lock.yaml ./
COPY prisma ./prisma/

# 1. Instalamos SOLO dependencias de producción
RUN pnpm install --frozen-lockfile --prod --ignore-scripts

RUN pnpm prisma generate

# 2. Copiamos la aplicación compilada del builder
COPY --from=builder /app/.next ./.next
COPY --from=builder /app/public ./public

USER node
EXPOSE 3000
CMD ["pnpm", "start"]