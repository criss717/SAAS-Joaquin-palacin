# --- ETAPA 1: BASE DE PNPM ---
FROM node:22-slim AS base
WORKDIR /app
RUN corepack enable && corepack prepare pnpm@latest --activate
ENV CI=true

# --- ETAPA 2: COMPILACIÓN Y PODA (BUILDER) ---
FROM base AS builder
COPY package.json pnpm-lock.yaml ./
COPY prisma ./prisma/

# 1. Instalamos TODO (aquí sí está la CLI de prisma disponible)
RUN pnpm install --frozen-lockfile --ignore-scripts

# 2. Generamos el cliente de Prisma (crea los archivos en node_modules/.pnpm)
RUN pnpm prisma generate

# 3. Copiamos el código y compilamos Next.js
COPY . .
RUN pnpm build

# 🚀 EL TRUCO MAESTRO: Desinstala las devDeps en 2 segundos sin descargar nada
RUN pnpm prune --prod

# --- ETAPA 3: PRODUCCIÓN REAL (RUNNER) ---
FROM node:22-slim AS runner
WORKDIR /app
RUN corepack enable && corepack prepare pnpm@latest --activate
ENV NODE_ENV=production
ENV CI=true

COPY package.json pnpm-lock.yaml ./
COPY prisma ./prisma/

# 4. Copiamos DIRECTAMENTE las carpetas ya limpias y masticadas del builder
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/.next ./.next
COPY --from=builder /app/public ./public

USER node
EXPOSE 3000
CMD ["pnpm", "start"]