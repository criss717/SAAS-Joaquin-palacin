# --- ETAPA 1: DEPENDENCIAS ---
FROM node:22-slim AS deps
WORKDIR /app
RUN corepack enable && corepack prepare pnpm@latest --activate
COPY package.json pnpm-lock.yaml ./
# Instalamos ABSOLUTAMENTE TODO para poder compilar
RUN pnpm install --frozen-lockfile

# --- ETAPA 2: COMPILACIÓN (BUILD) ---
FROM node:22-slim AS builder
WORKDIR /app
RUN corepack enable && corepack prepare pnpm@latest --activate
COPY . .
# Copiamos los node_modules de la etapa anterior
COPY --from=deps /app/node_modules ./node_modules
RUN pnpm prisma generate
RUN pnpm build

# --- ETAPA 3: PRODUCCIÓN REAL (EL RUNNER) ---
FROM node:22-alpine AS runner
WORKDIR /app
RUN corepack enable && corepack prepare pnpm@latest --activate

ENV NODE_ENV=production
# Truco de pnpm para instalar SOLO las dependencias de producción en el runner
ENV NODE_ENV=production 

COPY package.json pnpm-lock.yaml ./
# Instalamos únicamente lo necesario para ejecutar 
RUN pnpm install --prod --frozen-lockfile

# Copiamos solo el resultado final compilado de Next y Prisma
COPY --from=builder /app/.next ./.next
COPY --from=builder /app/public ./public
COPY --from=builder /app/prisma ./prisma

EXPOSE 3000

CMD ["pnpm", "start"]