# syntax=docker/dockerfile:1

# ---------- Stage 1: deps — cài node_modules với npm ci ----------
FROM node:22-alpine AS deps

WORKDIR /app

COPY package.json package-lock.json ./

RUN npm ci --no-audit --no-fund

# ---------- Stage 2: builder — build Next.js production ----------
FROM node:22-alpine AS builder

WORKDIR /app

COPY --from=deps /app/node_modules ./node_modules
COPY . .

ENV NEXT_TELEMETRY_DISABLED=1

# API_ORIGIN chỉ dùng cho rewrites lúc runtime (next start) — không ảnh hưởng build
ARG API_ORIGIN=http://api:8000
ENV API_ORIGIN=$API_ORIGIN

RUN npm run build

# ---------- Stage 3: runtime — standalone server, image tối thiểu ----------
FROM node:22-alpine AS runtime

WORKDIR /app

ENV NODE_ENV=production \
    NEXT_TELEMETRY_DISABLED=1 \
    PORT=3000 \
    HOSTNAME=0.0.0.0

# Tạo user không phải root TRƯỚC khi COPY --chown (cần tồn tại trong /etc/passwd)
RUN addgroup -S allercare && adduser -S allercare -G allercare

# Standalone output: server.js + các deps cần thiết duy nhất
COPY --from=builder --chown=allercare:allercare /app/.next/standalone /app
COPY --from=builder --chown=allercare:allercare /app/.next/static /app/.next/static
COPY --from=builder --chown=allercare:allercare /app/public /app/public

USER allercare

EXPOSE 3000

HEALTHCHECK --interval=15s --timeout=5s --start-period=20s --retries=5 \
    CMD wget -qO- http://127.0.0.1:3000/ > /dev/null 2>&1 || exit 1

CMD ["node", "server.js"]
