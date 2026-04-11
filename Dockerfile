# ============================================
# Stage 1: Builder
# ============================================
FROM node:20-alpine AS builder

WORKDIR /app

# Instala dependências nativas necessárias para o Baileys
RUN apk add --no-cache python3 make g++ git

COPY package*.json ./
RUN npm ci --only=production

COPY tsconfig.json ./
COPY src ./src

# Instala devDeps para build
RUN npm install --save-dev typescript tsx
RUN npm run build 2>/dev/null || npx tsc --skipLibCheck || true

# ============================================
# Stage 2: Production
# ============================================
FROM node:20-alpine AS production

WORKDIR /app

# Dependências runtime
RUN apk add --no-cache tini

# Copia apenas o necessário
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/package.json ./
COPY --from=builder /app/src ./src

# Cria diretório de sessões
RUN mkdir -p /app/sessions

# Usuário não-root para segurança
RUN addgroup -g 1001 -S apiapego && \
    adduser -S -u 1001 -G apiapego apiapego && \
    chown -R apiapego:apiapego /app

USER apiapego

EXPOSE 3000

# Usa tini como PID 1 para graceful shutdown
ENTRYPOINT ["/sbin/tini", "--"]
CMD ["node", "-r", "tsx/cjs", "src/server.ts"]
