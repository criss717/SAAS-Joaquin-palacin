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

ENV NODE_ENV=production

# 🚨 CLAVE: Copiamos todo asegurando que el usuario 'node' sea el propietario real
COPY --chown=node:node package.json pnpm-lock.yaml ./
COPY --chown=node:node prisma ./prisma/
COPY --chown=node:node --from=builder /app/node_modules ./node_modules
COPY --chown=node:node --from=builder /app/.next ./.next
COPY --chown=node:node --from=builder /app/public ./public

# Cambiamos al usuario sin privilegios
USER node

EXPOSE 3000

# Next.js expone su binario directamente en node_modules.
CMD ["node", "node_modules/.bin/next", "start"]