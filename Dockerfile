# --- Сборка ---
FROM node:24-alpine AS build
WORKDIR /app
ENV NEXT_TELEMETRY_DISABLED=1 NEXT_OUTPUT=standalone
COPY package.json package-lock.json ./
RUN npm ci
COPY next.config.mjs jsconfig.json ./
COPY src ./src
COPY public ./public
COPY server ./server
COPY content ./content
RUN npm run build

# --- Runtime ---
FROM node:24-alpine
ENV NODE_ENV=production NEXT_TELEMETRY_DISABLED=1 PORT=3000 HOSTNAME=0.0.0.0
WORKDIR /app
COPY --from=build /app/.next/standalone ./
COPY --from=build /app/.next/static ./.next/static
COPY public ./public
# Миграции и скрипты (createsuperuser) — исходниками; книги — описания из репозитория, сканы — в томе /app/books
COPY server ./server
COPY content ./content
USER node
CMD ["node", "server.js"]
