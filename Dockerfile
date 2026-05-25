# --- ETAPA 1: DEPENDENCIAS DE DESARROLLO ---
FROM node:22-slim AS deps
WORKDIR /app

RUN corepack enable && corepack prepare pnpm@latest --activate

ENV CI=true

COPY package.json pnpm-lock.yaml ./

# Instalamos todas las dependencias (prod + dev) para poder compilar y generar Prisma
RUN pnpm install --frozen-lockfile --ignore-scripts=false

# --- ETAPA 2: COMPILACIÓN (BUILD) ---
FROM node:22-slim AS builder
WORKDIR /app

RUN corepack enable && corepack prepare pnpm@latest --activate

COPY . .
# Copiamos las dependencias completas de la etapa anterior
COPY --from=deps /app/node_modules ./node_modules

# Generar el cliente de Prisma (necesita el esquema)
RUN pnpm prisma generate

# Compilar la aplicación Next.js
RUN pnpm build

# --- ETAPA 3: PRODUCCIÓN REAL (EL RUNNER BLINDADO) ---
FROM node:22-alpine AS runner
WORKDIR /app

RUN corepack enable && corepack prepare pnpm@latest --activate

# Establecer entorno de producción (pnpm omitirá devDependencies de forma automática)
ENV NODE_ENV=production
ENV CI=true

COPY package.json pnpm-lock.yaml ./

# Instalar ÚNICAMENTE las dependencias de producción necesarias para ejecutar la app
RUN pnpm install --frozen-lockfile --ignore-scripts=false

# Copiar exclusivamente los artefactos compilados finales (adiós código fuente .ts y tests)
COPY --from=builder /app/.next ./.next
COPY --from=builder /app/public ./public
COPY --from=builder /app/prisma ./prisma

EXPOSE 3000

CMD ["pnpm", "start"]