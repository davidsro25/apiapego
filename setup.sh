#!/bin/bash
# ============================================
# ApiApego - Setup Script
# ============================================
set -e

echo "🚀 Configurando ApiApego WhatsApp API..."

# 1. Instala certbot para SSL
echo "📜 Instalando certbot..."
apt-get install -y certbot 2>/dev/null | tail -3

# 2. Cria diretório SSL
mkdir -p nginx/ssl

# 3. Gera certificado SSL (ajuste o email)
echo "🔐 Gerando certificado SSL para apiapego.apego.app.br..."
certbot certonly --standalone \
  --non-interactive \
  --agree-tos \
  --email admin@apego.app.br \
  -d apiapego.apego.app.br \
  --pre-hook "docker compose stop nginx 2>/dev/null || true" \
  --post-hook "docker compose start nginx 2>/dev/null || true"

# 4. Copia certificados
cp /etc/letsencrypt/live/apiapego.apego.app.br/fullchain.pem nginx/ssl/fullchain.pem
cp /etc/letsencrypt/live/apiapego.apego.app.br/privkey.pem nginx/ssl/privkey.pem

# 5. Cron para renovação automática
(crontab -l 2>/dev/null; echo "0 3 * * 1 certbot renew --quiet && cp /etc/letsencrypt/live/apiapego.apego.app.br/*.pem /root/apiapego/nginx/ssl/ && docker compose -f /root/apiapego/docker-compose.yml restart nginx") | crontab -

echo "✅ SSL configurado!"
echo ""
echo "🐳 Iniciando containers..."
docker compose up -d --build

echo ""
echo "✅ ApiApego rodando em https://apiapego.apego.app.br"
echo ""
echo "📋 API Key: $(grep GLOBAL_API_KEY .env | cut -d= -f2)"
