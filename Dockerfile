# --- ETAPA 1: BASE DE PNPM ---
FROM node:22-slim AS base
WORKDIR /app
RUN corepack enable && corepack prepare pnpm@latest --activate
ENV CI=true

# --- ETAPA 2: COMPILACIÓN Y PODA (BUILDER) ---
FROM base AS builder
COPY package.json pnpm-lock.yaml ./
COPY prisma ./prisma/

RUN pnpm install --frozen-lockfile --ignore-scripts
RUN pnpm prisma generate

COPY . .
RUN pnpm build
RUN pnpm prune --prod

# --- ETAPA 3: PRODUCCIÓN REAL (RUNNER) ---
FROM node:22-slim AS runner
WORKDIR /app

# Configurar variables de entorno y directorios de caché para el usuario node
ENV NODE_ENV=production
ENV CI=true
ENV PNPM_HOME="/home/node/.local/share/pnpm"
ENV PATH="$PNPM_HOME:$PATH"

RUN corepack enable && corepack prepare pnpm@latest --activate

# Asegurar los directorios del usuario node antes de copiar
RUN mkdir -p /home/node/.cache /home/node/.local/share/pnpm && chown -R node:node /home/node

# Copiamos los archivos asignando explícitamente la propiedad al usuario 'node'
COPY --chown=node:node package.json pnpm-lock.yaml ./
COPY --chown=node:node prisma ./prisma/
COPY --chown=node:node --from=builder /app/node_modules ./node_modules
COPY --from=builder --chown=node:node /app/.next ./.next
COPY --from=builder --chown=node:node /app/public ./public

USER node

EXPOSE 3000
CMD ["pnpm", "start"]