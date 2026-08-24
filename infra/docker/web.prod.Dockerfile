# =============================================
# VecinoCentinela — Web (Next.js PRODUCCIÓN)
# next build + next start (nunca next dev en prod)
# Creado: 23 Ago 2026 por Magdi 🪲
# =============================================
FROM node:22-alpine AS deps
WORKDIR /app
COPY apps/web/package.json /app/apps/web/package.json
COPY apps/web/tsconfig.json /app/apps/web/tsconfig.json
COPY apps/web/next.config.ts /app/apps/web/next.config.ts
COPY apps/web/tailwind.config.ts /app/apps/web/tailwind.config.ts
COPY apps/web/postcss.config.mjs /app/apps/web/postcss.config.mjs
RUN cd /app/apps/web && npm install

FROM node:22-alpine AS builder
WORKDIR /app
COPY --from=deps /app/apps/web/node_modules /app/apps/web/node_modules
COPY apps/web /app/apps/web
ARG NEXT_PUBLIC_API_URL
ENV NEXT_PUBLIC_API_URL=$NEXT_PUBLIC_API_URL
WORKDIR /app/apps/web
RUN npm run build

FROM node:22-alpine AS runner
WORKDIR /app/apps/web
ENV NODE_ENV=production
COPY --from=builder /app/apps/web/package.json ./
COPY --from=builder /app/apps/web/next.config.ts ./
COPY --from=builder /app/apps/web/public ./public
COPY --from=builder /app/apps/web/.next ./.next
COPY --from=builder /app/apps/web/node_modules ./node_modules
EXPOSE 3000
USER node
CMD ["npm", "run", "start", "--", "-p", "3000"]
