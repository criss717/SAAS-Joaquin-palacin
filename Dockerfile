# --- ETAPA 1: BASE DE PNPM ---
# Creamos una etapa base para no repetir la instalación de pnpm
FROM node:22-slim AS base
WORKDIR /app
RUN corepack enable && corepack prepare pnpm@latest --activate
ENV CI=true

# --- ETAPA 2: COMPILACIÓN (BUILDER) ---
FROM base AS builder
# 1. Copiamos los archivos de configuración de paquetes primero
COPY package.json pnpm-lock.yaml ./
COPY prisma ./prisma/

# 2. Instalamos TODAS las dependencias directamente aquí (incluye Prisma y devDeps)
RUN pnpm install --frozen-lockfile --ignore-scripts

# 3. Generamos el cliente de Prisma ahora que los paquetes están limpios y reales
RUN pnpm prisma generate

# 4. Copiamos el resto del código y compilamos
COPY . .
RUN pnpm build

# --- ETAPA 3: PRODUCCIÓN REAL (RUNNER) ---
FROM node:22-alpine AS runner
WORKDIR /app
RUN corepack enable && corepack prepare pnpm@latest --activate
ENV NODE_ENV=production
ENV CI=true

COPY package.json pnpm-lock.yaml ./
COPY prisma ./prisma/

# 1. Instalamos SOLO las dependencias de producción en un entorno limpio
RUN pnpm install --frozen-lockfile --prod --ignore-scripts

# 2. Copiamos los artefactos generados del builder (aquí Next.js ya metió el cliente de Prisma dentro del build estático)
COPY --from=builder /app/.next ./.next
COPY --from=builder /app/public ./public

USER node
EXPOSE 3000
CMD ["pnpm", "start"]