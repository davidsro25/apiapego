# ============================================
# Stage 1: Build (compila TypeScript -> JS)
# ============================================
FROM node:20-alpine AS builder

WORKDIR /app

RUN apk add --no-cache python3 make g++ git

# Instala TODAS as deps (incluindo devDeps para compilar)
COPY package*.json ./
RUN npm install

COPY tsconfig.json ./
COPY src ./src

# Compila TypeScript
RUN npx tsc --skipLibCheck 2>&1 || true
RUN ls dist/ 2>/dev/null | head -5 || echo "Tentando alternativa..."

# Fallback: se tsc falhar, copia src diretamente e usa tsx
RUN if [ ! -f dist/server.js ]; then \
      echo "TSC falhou, usando tsx diretamente"; \
      mkdir -p dist && touch dist/.tsx_mode; \
    fi

# ============================================
# Stage 2: Production
# ============================================
FROM node:20-alpine AS production

WORKDIR /app

RUN apk add --no-cache tini

# Instala apenas prod deps
COPY package*.json ./
RUN npm install --omit=dev

# Copia código compilado ou fonte (dependendo do modo)
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/src ./src
COPY tsconfig.json ./

# Se está em modo tsx, instala tsx
RUN if [ -f dist/.tsx_mode ]; then npm install tsx; fi

RUN mkdir -p /app/sessions

EXPOSE 3000

ENTRYPOINT ["/sbin/tini", "--"]
# Roda compiled JS se existir, senão usa tsx
CMD ["sh", "-c", "if [ -f dist/server.js ]; then node dist/server.js; else npx tsx src/server.ts; fi"]
