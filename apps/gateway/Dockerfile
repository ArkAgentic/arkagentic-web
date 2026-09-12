FROM node:20-alpine AS deps
WORKDIR /app/apps/gateway
COPY apps/gateway/package*.json ./
RUN npm ci

FROM node:20-alpine AS builder
WORKDIR /app/apps/gateway
ENV SKIP_BILLING_VERIFY=1
COPY --from=deps /app/apps/gateway/node_modules ./node_modules
COPY apps/gateway ./
RUN npm run build

FROM node:20-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production
ENV PORT=3000

COPY --from=builder /app/apps/gateway/public ./public
COPY --from=builder /app/apps/gateway/.next/standalone ./
COPY --from=builder /app/apps/gateway/.next/static ./.next/static

EXPOSE 3000
CMD ["node", "server.js"]
